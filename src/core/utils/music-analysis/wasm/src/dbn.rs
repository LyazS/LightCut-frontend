const FPS: usize = 100;
const TEMPO_COUNT: usize = 60;
const TRANSITION_LAMBDA: f64 = 100.0;
const OBSERVATION_LAMBDA: f64 = 16.0;

pub struct DecodedDownbeats {
    pub beats: Vec<f64>,
    pub positions: Vec<u8>,
    pub meter: u32,
}

pub struct Decoder {
    triple: BarHmm,
    quadruple: BarHmm,
}

struct BarHmm {
    meter: u8,
    state_positions: Vec<f64>,
    first_states: Vec<usize>,
    observation_pointers: Vec<u8>,
    boundary_sources: Vec<u16>,
    boundary_log_probabilities: Vec<f64>,
    boundary_pointers: Vec<usize>,
    first_columns: Vec<i32>,
    non_boundary_states: Vec<usize>,
}

struct MeterResult {
    beats: Vec<f64>,
    positions: Vec<u8>,
    score: f64,
}

impl Decoder {
    pub fn new() -> Self {
        Self {
            triple: BarHmm::build(3),
            quadruple: BarHmm::build(4),
        }
    }

    pub fn decode(&self, activations: &[f32]) -> DecodedDownbeats {
        let observation_count = activations.len() / 2;
        let mut first_frame = 0;
        let mut last_frame = 0;
        for frame in 0..observation_count {
            if activations[frame * 2] >= 0.24 || activations[frame * 2 + 1] >= 0.24 {
                if last_frame == 0 {
                    first_frame = frame;
                }
                last_frame = frame + 1;
            }
        }

        if last_frame == 0 {
            return DecodedDownbeats {
                beats: Vec::new(),
                positions: Vec::new(),
                meter: 3,
            };
        }

        let active = &activations[first_frame * 2..last_frame * 2];
        let triple = decode_meter(&self.triple, active, first_frame);
        let quadruple = decode_meter(&self.quadruple, active, first_frame);
        let (meter, winner) = if triple.score >= quadruple.score {
            (self.triple.meter, triple)
        } else {
            (self.quadruple.meter, quadruple)
        };
        DecodedDownbeats {
            beats: winner.beats,
            positions: winner.positions,
            meter: meter as u32,
        }
    }
}

impl BarHmm {
    fn build(meter: u8) -> Self {
        let beat = build_beat_state_space(
            (60.0 * FPS as f64) / 215.0,
            (60.0 * FPS as f64) / 55.0,
            TEMPO_COUNT,
        );
        let states_per_beat = beat.first_states.len();
        let mut state_positions = Vec::new();
        let mut state_intervals = Vec::new();
        let mut first_states = Vec::new();
        let mut last_states = Vec::new();
        let mut offset = 0;

        for beat_index in 0..meter as usize {
            for index in 0..beat.positions.len() {
                state_positions.push(beat.positions[index] + beat_index as f64);
                state_intervals.push(beat.intervals[index]);
            }
            for index in 0..states_per_beat {
                first_states.push(beat.first_states[index] + offset);
                last_states.push(beat.last_states[index] + offset);
            }
            offset += beat.positions.len();
        }

        let mut boundary_sources = Vec::new();
        let mut boundary_log_probabilities = Vec::new();
        let mut boundary_pointers = vec![0];
        for beat_index in 0..meter as usize {
            let previous_beat = (beat_index + meter as usize - 1) % meter as usize;
            let sources = &last_states
                [previous_beat * states_per_beat..(previous_beat + 1) * states_per_beat];
            let destinations =
                &first_states[beat_index * states_per_beat..(beat_index + 1) * states_per_beat];
            let mut probabilities = vec![0.0; states_per_beat * states_per_beat];
            for source_index in 0..states_per_beat {
                let mut sum = 0.0;
                for destination_index in 0..states_per_beat {
                    let ratio = state_intervals[destinations[destination_index]] as f64
                        / state_intervals[sources[source_index]] as f64;
                    let probability = libm::exp(-TRANSITION_LAMBDA * (ratio - 1.0).abs());
                    let value = if probability <= f64::EPSILON {
                        0.0
                    } else {
                        probability
                    };
                    probabilities[source_index * states_per_beat + destination_index] = value;
                    sum += value;
                }
                for destination_index in 0..states_per_beat {
                    probabilities[source_index * states_per_beat + destination_index] /= sum;
                }
            }
            for destination_index in 0..states_per_beat {
                for source_index in 0..states_per_beat {
                    let probability =
                        probabilities[source_index * states_per_beat + destination_index];
                    if probability == 0.0 {
                        continue;
                    }
                    boundary_sources.push(sources[source_index] as u16);
                    boundary_log_probabilities.push(libm::log(probability));
                }
                boundary_pointers.push(boundary_sources.len());
            }
        }

        let mut observation_pointers = vec![0; state_positions.len()];
        let border = 1.0 / OBSERVATION_LAMBDA;
        for (index, position) in state_positions.iter().enumerate() {
            if position % 1.0 < border {
                observation_pointers[index] = 1;
            }
            if *position < border {
                observation_pointers[index] = 2;
            }
        }

        let mut first_columns = vec![-1; state_positions.len()];
        for (column, state) in first_states.iter().enumerate() {
            first_columns[*state] = column as i32;
        }
        let non_boundary_states = first_columns
            .iter()
            .enumerate()
            .filter_map(|(state, column)| (*column < 0).then_some(state))
            .collect();

        Self {
            meter,
            state_positions,
            first_states,
            observation_pointers,
            boundary_sources,
            boundary_log_probabilities,
            boundary_pointers,
            first_columns,
            non_boundary_states,
        }
    }
}

struct BeatStateSpace {
    positions: Vec<f64>,
    intervals: Vec<usize>,
    first_states: Vec<usize>,
    last_states: Vec<usize>,
}

fn build_beat_state_space(minimum: f64, maximum: f64, tempo_count: usize) -> BeatStateSpace {
    let mut intervals: Vec<usize> = (js_round(minimum)..=js_round(maximum))
        .map(|interval| interval as usize)
        .collect();
    if tempo_count < intervals.len() {
        let mut sample_count = tempo_count;
        loop {
            let mut values = Vec::new();
            for index in 0..sample_count {
                let ratio = if sample_count == 1 {
                    0.0
                } else {
                    index as f64 / (sample_count - 1) as f64
                };
                let value = js_round(libm::exp2(
                    libm::log2(minimum) + (libm::log2(maximum) - libm::log2(minimum)) * ratio,
                )) as usize;
                if !values.contains(&value) {
                    values.push(value);
                }
            }
            values.sort_unstable();
            intervals = values;
            if intervals.len() >= tempo_count {
                break;
            }
            sample_count += 1;
        }
    }

    let mut first_states = Vec::with_capacity(intervals.len());
    let mut last_states = Vec::with_capacity(intervals.len());
    let mut positions = Vec::new();
    let mut state_intervals = Vec::new();
    let mut offset = 0;
    for interval in intervals {
        first_states.push(offset);
        last_states.push(offset + interval - 1);
        for position in 0..interval {
            positions.push(position as f64 / interval as f64);
            state_intervals.push(interval);
        }
        offset += interval;
    }
    BeatStateSpace {
        positions,
        intervals: state_intervals,
        first_states,
        last_states,
    }
}

fn decode_meter(hmm: &BarHmm, activations: &[f32], first_frame: usize) -> MeterResult {
    let (path, score) = viterbi(hmm, activations);
    let mut positions = vec![0; path.len()];
    let mut is_beat = vec![false; path.len()];
    for frame in 0..path.len() {
        positions[frame] = hmm.state_positions[path[frame] as usize].trunc() as u8 + 1;
        is_beat[frame] = hmm.observation_pointers[path[frame] as usize] >= 1;
    }

    let mut beats = Vec::new();
    let mut beat_positions = Vec::new();
    let mut frame = 0;
    while frame < is_beat.len() {
        if !is_beat[frame] {
            frame += 1;
            continue;
        }
        let start = frame;
        while frame < is_beat.len() && is_beat[frame] {
            frame += 1;
        }
        let mut peak = start;
        let mut peak_value = f64::NEG_INFINITY;
        for current in start..frame {
            for category in 0..2 {
                let value = activations[current * 2 + category] as f64;
                if value > peak_value {
                    peak_value = value;
                    peak = current;
                }
            }
        }
        beats.push((peak + first_frame) as f64 / FPS as f64);
        beat_positions.push(positions[peak]);
    }
    MeterResult {
        beats,
        positions: beat_positions,
        score,
    }
}

fn viterbi(hmm: &BarHmm, activations: &[f32]) -> (Vec<u32>, f64) {
    let observation_count = activations.len() / 2;
    let state_count = hmm.state_positions.len();
    let mut previous = vec![-libm::log(state_count as f64); state_count];
    let mut current = vec![0.0; state_count];
    let column_count = hmm.first_states.len();
    let mut backpointers = vec![0_u16; observation_count * column_count];

    for frame in 0..observation_count {
        let ordinary = activations[frame * 2] as f64;
        let downbeat = activations[frame * 2 + 1] as f64;
        let no_event = (1.0 - ordinary - downbeat).max(0.0);
        let densities = [
            if no_event == 0.0 {
                f64::NEG_INFINITY
            } else {
                libm::log(no_event / (OBSERVATION_LAMBDA - 1.0))
            },
            libm::log(ordinary),
            libm::log(downbeat),
        ];

        for state in &hmm.non_boundary_states {
            current[*state] =
                previous[*state - 1] + densities[hmm.observation_pointers[*state] as usize];
        }
        for column in 0..column_count {
            let start = hmm.boundary_pointers[column];
            let end = hmm.boundary_pointers[column + 1];
            let mut best_edge = start;
            let mut best_score = f64::NEG_INFINITY;
            for edge in start..end {
                let score = previous[hmm.boundary_sources[edge] as usize]
                    + hmm.boundary_log_probabilities[edge];
                if score > best_score {
                    best_score = score;
                    best_edge = edge;
                }
            }
            backpointers[frame * column_count + column] = hmm.boundary_sources[best_edge];
            let state = hmm.first_states[column];
            current[state] = best_score + densities[hmm.observation_pointers[state] as usize];
        }
        std::mem::swap(&mut previous, &mut current);
    }

    let mut state = 0;
    for index in 1..state_count {
        if previous[index] > previous[state] {
            state = index;
        }
    }
    let score = previous[state];
    let mut path = vec![0; observation_count];
    for frame in (0..observation_count).rev() {
        path[frame] = state as u32;
        let column = hmm.first_columns[state];
        state = if column >= 0 {
            backpointers[frame * column_count + column as usize] as usize
        } else {
            state - 1
        };
    }
    (path, score)
}

fn js_round(value: f64) -> i32 {
    libm::floor(value + 0.5) as i32
}

#[cfg(test)]
mod tests {
    use super::Decoder;

    #[test]
    fn state_spaces_match_the_reference_decoder() {
        let decoder = Decoder::new();
        assert_eq!(decoder.triple.state_positions.len(), 11_157);
        assert_eq!(decoder.triple.first_states.len(), 180);
        assert_eq!(decoder.triple.boundary_sources.len(), 5_259);
        assert_eq!(decoder.quadruple.state_positions.len(), 14_876);
        assert_eq!(decoder.quadruple.first_states.len(), 240);
        assert_eq!(decoder.quadruple.boundary_sources.len(), 7_012);
    }
}
