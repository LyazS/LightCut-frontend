mod dbn;

use std::cell::RefCell;
use std::f64::consts::PI;

const SAMPLE_RATE: usize = 44_100;
const DEMUCS_SEGMENT_SAMPLES: usize = 343_980;
const DEMUCS_NFFT: usize = 4_096;
const DEMUCS_HOP: usize = 1_024;
const DEMUCS_FREQUENCIES: usize = DEMUCS_NFFT / 2;
const DEMUCS_FRAMES: usize = 336;
const DEMUCS_SOURCES: usize = 4;
const FEATURE_FRAME: usize = 2_048;
const FEATURE_HOP: usize = 441;
const FEATURE_BINS: usize = FEATURE_FRAME / 2;
const FEATURE_BANDS: usize = 81;
const MAX_ENGINE_BYTES: u64 = 1_500_000_000;
#[repr(C)]
struct AcousticRecord {
    time: f32,
    score: f32,
    signal_a: f32,
    signal_b: f32,
    signal_c: f32,
    signal_d: f32,
    kind: f32,
}

struct FilterBank {
    starts: Vec<usize>,
    values: Vec<Vec<f32>>,
}

struct Engine {
    length: usize,
    feature_frames: usize,
    mean: f64,
    std: f64,
    input: Vec<f32>,
    accumulated: Vec<f32>,
    total_weight: Vec<f32>,
    segment_weight: Vec<f32>,
    chunk: Vec<f32>,
    stft: Vec<f32>,
    complex_stems: Vec<f32>,
    time_stems: Vec<f32>,
    reconstruction: Vec<f32>,
    envelope: Vec<f32>,
    real: Vec<f32>,
    imaginary: Vec<f32>,
    demucs_window: Vec<f32>,
    feature_window: Vec<f32>,
    filterbank: FilterBank,
    features: Vec<f32>,
    dbn_decoder: dbn::Decoder,
    activations: Vec<f32>,
    decoded_beats: Vec<f64>,
    decoded_positions: Vec<u8>,
    decoded_meter: u32,
    acoustic_events: Vec<AcousticRecord>,
}

impl Engine {
    fn new(length: usize) -> Option<Self> {
        if length == 0 || estimated_bytes(length) > MAX_ENGINE_BYTES {
            return None;
        }

        let feature_frames = div_ceil(length, FEATURE_HOP);
        let demucs_window = periodic_hann(DEMUCS_NFFT);
        let feature_window = symmetric_hann(FEATURE_FRAME);
        let mut envelope = vec![0.0; demucs_output_length()];
        for frame in 0..DEMUCS_FRAMES + 4 {
            let start = frame * DEMUCS_HOP;
            for sample in 0..DEMUCS_NFFT {
                envelope[start + sample] = (envelope[start + sample] as f64
                    + demucs_window[sample] as f64 * demucs_window[sample] as f64)
                    as f32;
            }
        }

        let half = DEMUCS_SEGMENT_SAMPLES / 2;
        let mut segment_weight = vec![0.0; DEMUCS_SEGMENT_SAMPLES];
        for (sample, value) in segment_weight.iter_mut().enumerate() {
            *value = if sample < half {
                ((sample + 1) as f64 / half as f64) as f32
            } else {
                ((DEMUCS_SEGMENT_SAMPLES - sample) as f64 / half as f64) as f32
            };
        }

        Some(Self {
            length,
            feature_frames,
            mean: 0.0,
            std: 1.0,
            input: vec![0.0; 2 * length],
            accumulated: vec![0.0; DEMUCS_SOURCES * 2 * length],
            total_weight: vec![0.0; length],
            segment_weight,
            chunk: vec![0.0; 2 * DEMUCS_SEGMENT_SAMPLES],
            stft: vec![0.0; 2 * DEMUCS_FREQUENCIES * DEMUCS_FRAMES * 2],
            complex_stems: vec![0.0; DEMUCS_SOURCES * 2 * DEMUCS_FREQUENCIES * DEMUCS_FRAMES * 2],
            time_stems: vec![0.0; DEMUCS_SOURCES * 2 * DEMUCS_SEGMENT_SAMPLES],
            reconstruction: vec![0.0; demucs_output_length()],
            envelope,
            real: vec![0.0; DEMUCS_NFFT],
            imaginary: vec![0.0; DEMUCS_NFFT],
            demucs_window,
            feature_window,
            filterbank: logarithmic_filterbank(),
            features: vec![0.0; DEMUCS_SOURCES * feature_frames * FEATURE_BANDS],
            dbn_decoder: dbn::Decoder::new(),
            activations: vec![0.0; feature_frames * 2],
            decoded_beats: Vec::with_capacity(feature_frames),
            decoded_positions: Vec::with_capacity(feature_frames),
            decoded_meter: 3,
            acoustic_events: Vec::new(),
        })
    }

    fn normalize(&mut self) {
        let mut mean = 0.0_f64;
        for sample in 0..self.length {
            mean += (self.input[sample] as f64 + self.input[self.length + sample] as f64) / 2.0;
        }
        mean /= self.length as f64;

        let mut squared_difference = 0.0_f64;
        for sample in 0..self.length {
            let value =
                (self.input[sample] as f64 + self.input[self.length + sample] as f64) / 2.0 - mean;
            squared_difference += value * value;
        }

        self.mean = mean;
        self.std =
            libm::sqrt(squared_difference / self.length.saturating_sub(1).max(1) as f64) + 1e-8;
        for value in &mut self.input {
            *value = ((*value as f64 - self.mean) / self.std) as f32;
        }
    }

    fn prepare_segment(&mut self, offset: usize, current_length: usize) -> bool {
        if current_length == 0
            || current_length > DEMUCS_SEGMENT_SAMPLES
            || offset + current_length > self.length
        {
            return false;
        }

        self.chunk.fill(0.0);
        let delta = DEMUCS_SEGMENT_SAMPLES - current_length;
        let start = offset as isize - (delta / 2) as isize;
        let source_start = start.max(0) as usize;
        let source_end = (start + DEMUCS_SEGMENT_SAMPLES as isize)
            .min(self.length as isize)
            .max(0) as usize;
        let target_start = (source_start as isize - start) as usize;

        for channel in 0..2 {
            let source_offset = channel * self.length + source_start;
            let target_offset = channel * DEMUCS_SEGMENT_SAMPLES + target_start;
            let count = source_end - source_start;
            self.chunk[target_offset..target_offset + count]
                .copy_from_slice(&self.input[source_offset..source_offset + count]);
        }
        self.htdemucs_stft();
        true
    }

    fn htdemucs_stft(&mut self) {
        let pad = DEMUCS_HOP / 2 * 3;
        let first_padded_length = 2 * pad + DEMUCS_FRAMES * DEMUCS_HOP;
        for channel in 0..2 {
            for frame in 0..DEMUCS_FRAMES {
                let frame_offset = (frame + 2) * DEMUCS_HOP;
                for sample in 0..DEMUCS_NFFT {
                    let first_padded_index = reflect_index(
                        frame_offset as isize + sample as isize - (DEMUCS_NFFT / 2) as isize,
                        first_padded_length,
                    );
                    let source_index = reflect_index(
                        first_padded_index as isize - pad as isize,
                        DEMUCS_SEGMENT_SAMPLES,
                    );
                    self.real[sample] = self.chunk[channel * DEMUCS_SEGMENT_SAMPLES + source_index]
                        * self.demucs_window[sample];
                    self.imaginary[sample] = 0.0;
                }
                fft(&mut self.real, &mut self.imaginary, false);
                for frequency in 0..DEMUCS_FREQUENCIES {
                    let output_index =
                        ((channel * DEMUCS_FREQUENCIES + frequency) * DEMUCS_FRAMES + frame) * 2;
                    self.stft[output_index] = self.real[frequency] / 64.0;
                    self.stft[output_index + 1] = self.imaginary[frequency] / 64.0;
                }
            }
        }
    }

    fn combine_segment(&mut self, offset: usize, current_length: usize) -> bool {
        if current_length == 0
            || current_length > DEMUCS_SEGMENT_SAMPLES
            || offset + current_length > self.length
        {
            return false;
        }

        let trim_start = (DEMUCS_SEGMENT_SAMPLES - current_length) / 2;
        let istft_start = DEMUCS_NFFT / 2 + (DEMUCS_HOP / 2) * 3;

        for source in 0..DEMUCS_SOURCES {
            for channel in 0..2 {
                self.reconstruction.fill(0.0);
                for frame in 0..DEMUCS_FRAMES {
                    self.real.fill(0.0);
                    self.imaginary.fill(0.0);
                    for frequency in 0..DEMUCS_FREQUENCIES {
                        let input_index = (((source * 2 + channel) * DEMUCS_FREQUENCIES
                            + frequency)
                            * DEMUCS_FRAMES
                            + frame)
                            * 2;
                        self.real[frequency] = self.complex_stems[input_index];
                        self.imaginary[frequency] = self.complex_stems[input_index + 1];
                        if frequency > 0 {
                            self.real[DEMUCS_NFFT - frequency] = self.real[frequency];
                            self.imaginary[DEMUCS_NFFT - frequency] = -self.imaginary[frequency];
                        }
                    }
                    fft(&mut self.real, &mut self.imaginary, true);
                    let start = (frame + 2) * DEMUCS_HOP;
                    for sample in 0..DEMUCS_NFFT {
                        self.reconstruction[start + sample] = (self.reconstruction[start + sample]
                            as f64
                            + self.real[sample] as f64 * 64.0 * self.demucs_window[sample] as f64)
                            as f32;
                    }
                }

                let accumulated_offset = (source * 2 + channel) * self.length + offset;
                let time_offset = (source * 2 + channel) * DEMUCS_SEGMENT_SAMPLES + trim_start;
                for sample in 0..current_length {
                    let frequency_value = (self.reconstruction[istft_start + trim_start + sample]
                        as f64
                        / self.envelope[istft_start + trim_start + sample] as f64)
                        as f32;
                    let mixed =
                        frequency_value as f64 + self.time_stems[time_offset + sample] as f64;
                    self.accumulated[accumulated_offset + sample] =
                        (self.accumulated[accumulated_offset + sample] as f64
                            + self.segment_weight[sample] as f64 * mixed)
                            as f32;
                }
            }
        }

        for sample in 0..current_length {
            self.total_weight[offset + sample] = (self.total_weight[offset + sample] as f64
                + self.segment_weight[sample] as f64)
                as f32;
        }
        true
    }

    fn extract_features(&mut self) {
        let mut scales = [1.0_f64; DEMUCS_SOURCES];
        for (source, scale) in scales.iter_mut().enumerate() {
            let mut maximum = 0.0_f64;
            for channel in 0..2 {
                for sample in 0..self.length {
                    maximum = maximum.max(self.stem_value(source, channel, sample).abs() as f64);
                }
            }
            *scale = (1.01 * maximum).max(1.0);
        }

        for (feature_source, source) in [1_usize, 0, 2, 3].iter().copied().enumerate() {
            for frame in 0..self.feature_frames {
                self.real[..FEATURE_FRAME].fill(0.0);
                self.imaginary[..FEATURE_FRAME].fill(0.0);
                let start = frame as isize * FEATURE_HOP as isize - (FEATURE_FRAME / 2) as isize;
                for sample in 0..FEATURE_FRAME {
                    let source_index = start + sample as isize;
                    let mono = if source_index < 0 || source_index >= self.length as isize {
                        0
                    } else {
                        let index = source_index as usize;
                        let left = self.quantized_value(source, 0, index, scales[source]) as i32;
                        let right = self.quantized_value(source, 1, index, scales[source]) as i32;
                        (left + right) / 2
                    };
                    self.real[sample] =
                        (mono as f64 / 32_767.0 * self.feature_window[sample] as f64) as f32;
                }
                fft(
                    &mut self.real[..FEATURE_FRAME],
                    &mut self.imaginary[..FEATURE_FRAME],
                    false,
                );
                for band in 0..FEATURE_BANDS {
                    let mut filtered = 0.0_f64;
                    let start_frequency = self.filterbank.starts[band];
                    for (offset, value) in self.filterbank.values[band].iter().enumerate() {
                        let frequency = start_frequency + offset;
                        let magnitude = libm::hypot(
                            self.real[frequency] as f64,
                            self.imaginary[frequency] as f64,
                        );
                        filtered += magnitude * *value as f64;
                    }
                    self.features
                        [(feature_source * self.feature_frames + frame) * FEATURE_BANDS + band] =
                        libm::log10(1.0 + filtered) as f32;
                }
            }
        }
    }

    fn stem_value(&self, source: usize, channel: usize, sample: usize) -> f32 {
        let index = (source * 2 + channel) * self.length + sample;
        (self.accumulated[index] as f64 / self.total_weight[sample] as f64 * self.std + self.mean)
            as f32
    }

    fn quantized_value(&self, source: usize, channel: usize, sample: usize, scale: f64) -> i16 {
        let value = (self.stem_value(source, channel, sample) as f64 / scale).clamp(-1.0, 1.0);
        (value * 32_767.0) as i16
    }

    fn decode_downbeats(&mut self, frame_count: usize) -> bool {
        if frame_count > self.feature_frames {
            return false;
        }
        let decoded = self
            .dbn_decoder
            .decode(&self.activations[..frame_count * 2]);
        self.decoded_beats.clear();
        self.decoded_beats.extend_from_slice(&decoded.beats);
        self.decoded_positions.clear();
        self.decoded_positions.extend_from_slice(&decoded.positions);
        self.decoded_meter = decoded.meter;
        true
    }

    fn detect_acoustics(&mut self) {
        let mut mono = Vec::with_capacity(self.length);
        for sample in 0..self.length {
            let value = ((self.input[sample] as f64 * self.std) + self.mean
                + (self.input[self.length + sample] as f64 * self.std) + self.mean)
                * 0.5;
            mono.push(value as f32);
        }
        self.acoustic_events = detect_acoustic_events(&mono);
    }
}

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = const { RefCell::new(None) };
}

#[no_mangle]
pub extern "C" fn engine_init(sample_count: u32) -> u32 {
    let Some(engine) = Engine::new(sample_count as usize) else {
        return 0;
    };
    ENGINE.with(|slot| {
        slot.replace(Some(engine));
    });
    1
}

#[no_mangle]
pub extern "C" fn engine_reset() {
    ENGINE.with(|slot| {
        slot.replace(None);
    });
}

#[no_mangle]
pub extern "C" fn engine_input_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(0, |engine| engine.input.as_mut_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn engine_chunk_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(0, |engine| engine.chunk.as_mut_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn engine_stft_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(0, |engine| engine.stft.as_mut_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn engine_complex_stems_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine.complex_stems.as_mut_ptr() as usize as u32
        })
    })
}

#[no_mangle]
pub extern "C" fn engine_time_stems_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(0, |engine| engine.time_stems.as_mut_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn engine_features_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(0, |engine| engine.features.as_mut_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn engine_activations_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(0, |engine| engine.activations.as_mut_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn engine_decoded_beats_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine.decoded_beats.as_mut_ptr() as usize as u32
        })
    })
}

#[no_mangle]
pub extern "C" fn engine_decoded_positions_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine.decoded_positions.as_mut_ptr() as usize as u32
        })
    })
}

#[no_mangle]
pub extern "C" fn engine_decoded_count() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(0, |engine| engine.decoded_beats.len() as u32)
    })
}

#[no_mangle]
pub extern "C" fn engine_decoded_meter() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(0, |engine| engine.decoded_meter)
    })
}

#[no_mangle]
pub extern "C" fn engine_acoustic_events_ptr() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine.acoustic_events.as_mut_ptr() as usize as u32
        })
    })
}

#[no_mangle]
pub extern "C" fn engine_acoustic_events_count() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(0, |engine| engine.acoustic_events.len() as u32)
    })
}

#[no_mangle]
pub extern "C" fn engine_normalize() -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        engine.normalize();
        1
    })
}

#[no_mangle]
pub extern "C" fn engine_prepare_segment(offset: u32, current_length: u32) -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        engine.prepare_segment(offset as usize, current_length as usize) as u32
    })
}

#[no_mangle]
pub extern "C" fn engine_combine_segment(offset: u32, current_length: u32) -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        engine.combine_segment(offset as usize, current_length as usize) as u32
    })
}

#[no_mangle]
pub extern "C" fn engine_extract_features() -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        engine.extract_features();
        1
    })
}

#[no_mangle]
pub extern "C" fn engine_decode_downbeats(frame_count: u32) -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        engine.decode_downbeats(frame_count as usize) as u32
    })
}

#[no_mangle]
pub extern "C" fn engine_detect_acoustics() -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        engine.detect_acoustics();
        1
    })
}

fn acoustic_event(time: f64, score: f64, kind: u32, a: f64, b: f64, c: f64, d: f64) -> AcousticRecord {
    AcousticRecord {
        time: time.max(0.0) as f32,
        score: score.clamp(0.0, 1.0) as f32,
        signal_a: a as f32,
        signal_b: b as f32,
        signal_c: c as f32,
        signal_d: d as f32,
        kind: kind as f32,
    }
}

fn acoustic_event_sort(left: &AcousticRecord, right: &AcousticRecord) -> std::cmp::Ordering {
    left.time
        .partial_cmp(&right.time)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| left.kind.partial_cmp(&right.kind).unwrap_or(std::cmp::Ordering::Equal))
}

fn frame_sample(signal: &[f32], start: isize, index: usize) -> f64 {
    let source = start + index as isize;
    if source < 0 || source >= signal.len() as isize {
        0.0
    } else {
        signal[source as usize] as f64
    }
}

fn moving_average(values: &[f64], width: usize) -> Vec<f64> {
    if values.is_empty() || width <= 1 {
        return values.to_vec();
    }
    let half = width / 2;
    let mut result = vec![0.0; values.len()];
    for index in 0..values.len() {
        let mut total = 0.0;
        for offset in 0..=half * 2 {
            let source = (index as isize + offset as isize - half as isize)
                .clamp(0, values.len() as isize - 1) as usize;
            total += values[source];
        }
        result[index] = total / (half * 2 + 1) as f64;
    }
    result
}

fn robust_unit(values: &[f64]) -> Vec<f64> {
    if values.is_empty() {
        return Vec::new();
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    let quantile = |position: f64| -> f64 {
        sorted[((position * (sorted.len() - 1) as f64).floor() as usize).min(sorted.len() - 1)]
    };
    let low = quantile(0.50);
    let high = quantile(0.95).max(max_value(values));
    if high - low < 1e-10 {
        return vec![0.0; values.len()];
    }
    values
        .iter()
        .map(|value| ((value - low) / (high - low)).clamp(0.0, 1.0))
        .collect()
}

fn max_value(values: &[f64]) -> f64 {
    values
        .iter()
        .copied()
        .fold(f64::NEG_INFINITY, |left, right| left.max(right))
}

fn pick_peaks(values: &[f64], minimum_distance: usize, quantile: f64, threshold: f64) -> Vec<usize> {
    if values.len() < 3 || max_value(values) <= threshold {
        return Vec::new();
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    let quantile_value = sorted[((quantile * (sorted.len() - 1) as f64).floor() as usize).min(sorted.len() - 1)];
    let median = sorted[sorted.len() / 2];
    let baseline = moving_average(values, values.len().min(9));
    let mut candidates: Vec<usize> = (1..values.len() - 1)
        .filter(|index| {
            values[*index] >= values[*index - 1]
                && values[*index] > values[*index + 1]
                && values[*index] >= threshold.max(quantile_value).max(median)
        })
        .collect();
    candidates.sort_by(|left, right| {
        values[*right]
            .partial_cmp(&values[*left])
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.cmp(right))
    });
    let mut selected = Vec::new();
    for candidate in candidates {
        if selected
            .iter()
            .all(|previous| candidate.abs_diff(*previous) >= minimum_distance.max(1))
        {
            selected.push(candidate);
        }
    }
    selected.sort_unstable();
    selected.retain(|index| values[*index] >= baseline[*index]);
    selected
}

fn detect_acoustic_events(signal: &[f32]) -> Vec<AcousticRecord> {
    const FRAME: usize = 2_048;
    const HOP: usize = 512;
    if signal.is_empty() {
        return Vec::new();
    }
    let frame_count = div_ceil(signal.len(), HOP).max(1);
    let mut rms_db = Vec::with_capacity(frame_count);
    let mut spectral_flux = Vec::with_capacity(frame_count);
    let mut mel_flux = Vec::with_capacity(frame_count);
    let mut hfc = Vec::with_capacity(frame_count);
    let mut previous_power = vec![0.0_f64; FRAME / 2 + 1];
    let window: Vec<f64> = (0..FRAME)
        .map(|index| 0.5 - 0.5 * libm::cos(2.0 * PI * index as f64 / FRAME as f64))
        .collect();
    let mut real = vec![0.0_f32; FRAME];
    let mut imaginary = vec![0.0_f32; FRAME];
    for frame in 0..frame_count {
        real.fill(0.0);
        imaginary.fill(0.0);
        let start = frame as isize * HOP as isize - FRAME as isize / 2;
        let mut squared = 0.0;
        for index in 0..FRAME {
            let value = frame_sample(signal, start, index);
            squared += value * value;
            real[index] = (value * window[index]) as f32;
        }
        fft(&mut real, &mut imaginary, false);
        let mut flux = 0.0;
        let mut weighted = 0.0;
        let mut total = 0.0;
        let mut bands = [0.0_f64; 4];
        for bin in 0..=FRAME / 2 {
            let power = libm::log(1.0 + real[bin] as f64 * real[bin] as f64 + imaginary[bin] as f64 * imaginary[bin] as f64);
            flux += (power - previous_power[bin]).max(0.0);
            previous_power[bin] = power;
            total += power;
            weighted += power * bin as f64;
            let band = if bin < 12 { 0 } else if bin < 48 { 1 } else if bin < 180 { 2 } else { 3 };
            bands[band] += power;
        }
        rms_db.push(20.0 * libm::log10(squared.sqrt().max(1e-8) / (FRAME as f64).sqrt()));
        spectral_flux.push(flux / previous_power.len() as f64);
        mel_flux.push((bands[1] + bands[2] + bands[3]) / 3.0);
        hfc.push(if total > 1e-12 { weighted / total } else { 0.0 });
    }

    let mut events = Vec::new();
    let smooth = moving_average(&rms_db, 13);
    let lag = (0.5 * SAMPLE_RATE as f64 / HOP as f64).round() as usize;
    let delta: Vec<f64> = smooth
        .iter()
        .enumerate()
        .map(|(index, value)| if index < lag { 0.0 } else { *value - smooth[index - lag] })
        .collect();
    let rise = robust_unit(&delta.iter().map(|value| value.max(0.0)).collect::<Vec<_>>());
    let fall = robust_unit(&delta.iter().map(|value| (-value).max(0.0)).collect::<Vec<_>>());
    let minimum_distance = lag.max(1);
    for (response, kind) in [(&rise, 0_u32), (&fall, 1_u32)] {
        for index in pick_peaks(response, minimum_distance, 0.78, 0.12) {
            events.push(acoustic_event(index as f64 * HOP as f64 / SAMPLE_RATE as f64, 0.45 + 0.55 * response[index], kind, rms_db[index], delta[index], 0.0, 0.0));
        }
    }
    let peak_baseline = moving_average(&smooth, 129);
    let gate = max_value(&smooth) - 18.0;
    let peak_response: Vec<f64> = smooth.iter().enumerate().map(|(index, value)| if *value >= gate { (*value - peak_baseline[index]).max(0.0) } else { 0.0 }).collect();
    let peak_unit = robust_unit(&peak_response);
    for index in pick_peaks(&peak_response, minimum_distance, 0.75, 0.08) {
        events.push(acoustic_event(index as f64 * HOP as f64 / SAMPLE_RATE as f64, 0.45 + 0.55 * peak_unit[index], 2, rms_db[index], delta[index], 0.0, 0.0));
    }

    let spectral_unit = robust_unit(&spectral_flux);
    let mel_unit = robust_unit(&mel_flux);
    let hfc_unit = robust_unit(&hfc);
    let onset: Vec<f64> = spectral_unit.iter().enumerate().map(|(index, value)| 0.7 * value + 0.2 * mel_unit[index] + 0.1 * hfc_unit[index]).collect();
    for index in pick_peaks(&onset, (0.07 * SAMPLE_RATE as f64 / HOP as f64).round() as usize, 0.82, 0.12) {
        events.push(acoustic_event(index as f64 * HOP as f64 / SAMPLE_RATE as f64, 0.45 + 0.55 * onset[index], 3, onset[index], spectral_flux[index], mel_flux[index], hfc[index]));
    }
    let density = moving_average(&onset, 43);
    let context_window = (0.75 * SAMPLE_RATE as f64 / HOP as f64).round() as usize;
    let context_delta: Vec<f64> = (0..density.len()).map(|index| {
        if index < context_window || index + context_window >= density.len() { return 0.0; }
        let before: f64 = density[index - context_window..index].iter().sum();
        let after: f64 = density[index + 1..=index + context_window].iter().sum();
        after / context_window as f64 - before / context_window as f64
    }).collect();
    let onset_entries: Vec<f64> = context_delta.iter().map(|value| value.max(0.0)).collect();
    let onset_exits: Vec<f64> = context_delta.iter().map(|value| (-value).max(0.0)).collect();
    for (response, kind) in [(&onset_entries, 4_u32), (&onset_exits, 5_u32)] {
        let unit = robust_unit(response);
        for index in pick_peaks(response, (0.4 * SAMPLE_RATE as f64 / HOP as f64).round() as usize, 0.78, 0.1) {
            events.push(acoustic_event(index as f64 * HOP as f64 / SAMPLE_RATE as f64, 0.4 + 0.6 * unit[index], kind, onset[index], density[index] - context_delta[index] / 2.0, density[index] + context_delta[index] / 2.0, 0.0));
        }
    }

    let peak = max_value(&rms_db);
    let threshold = (-60.0_f64).max((-35.0_f64).min(peak - 38.0));
    let minimum_silence = (0.16 * SAMPLE_RATE as f64 / HOP as f64).round() as usize;
    let merge_gap = (0.08 * SAMPLE_RATE as f64 / HOP as f64).round() as usize;
    let mut intervals: Vec<(usize, usize)> = Vec::new();
    let mut start: Option<usize> = None;
    for index in 0..=rms_db.len() {
        let quiet = index < rms_db.len() && rms_db[index] <= threshold;
        if quiet && start.is_none() { start = Some(index); }
        if !quiet {
            if let Some(left) = start.take() {
                if index - left >= minimum_silence {
                    if let Some(previous) = intervals.last_mut() {
                        if left - previous.1 <= merge_gap { previous.1 = index; continue; }
                    }
                    intervals.push((left, index));
                }
            }
        }
    }
    for (left, right) in intervals {
        let mut values = rms_db[left..right].to_vec();
        values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let median = values[values.len() / 2];
        let kind = if values[(values.len() * 3 / 4).min(values.len() - 1)] <= -55.0 { 0.0 } else { 1.0 };
        let duration_ms = (right - left) as f64 * HOP as f64 / SAMPLE_RATE as f64 * 1000.0;
        let score = 0.45 + 0.2 * (duration_ms / 800.0).min(1.0);
        events.push(acoustic_event(left as f64 * HOP as f64 / SAMPLE_RATE as f64, score, 6, median, duration_ms, threshold, kind));
        events.push(acoustic_event((right * HOP) as f64 / SAMPLE_RATE as f64, score, 7, median, duration_ms, threshold, kind));
    }

    let pitch_frame = 4_096;
    let pitch_hop = 1_024;
    let decimation = 4;
    let pitch_count = div_ceil(signal.len(), pitch_hop).max(1);
    let min_lag = (SAMPLE_RATE / 1_000 / decimation).max(2);
    let max_lag = (SAMPLE_RATE / 65 / decimation).min(pitch_frame / decimation - 2);
    let mut f0 = Vec::with_capacity(pitch_count);
    let mut confidence = Vec::with_capacity(pitch_count);
    for frame in 0..pitch_count {
        let start = frame as isize * pitch_hop as isize - pitch_frame as isize / 2;
        let count = pitch_frame / decimation;
        let mut values = vec![0.0; count];
        let mean = (0..count).map(|index| frame_sample(signal, start, index * decimation)).sum::<f64>() / count as f64;
        let mut energy = 0.0;
        for (index, value) in values.iter_mut().enumerate() { *value = frame_sample(signal, start, index * decimation) - mean; energy += *value * *value; }
        let mut best_lag = min_lag;
        let mut best = -1.0;
        for lag_value in min_lag..=max_lag {
            let mut correlation = 0.0;
            for index in lag_value..count { correlation += values[index] * values[index - lag_value]; }
            let normalized = if energy > 1e-8 { correlation / energy } else { 0.0 };
            if normalized > best { best = normalized; best_lag = lag_value; }
        }
        let mut score = best.clamp(0.0, 1.0);
        if 10.0 * libm::log10((energy / count as f64).max(1e-12)) < -45.0 { score = 0.0; }
        f0.push(SAMPLE_RATE as f64 / (best_lag * decimation) as f64);
        confidence.push(score);
    }
    let reliable: Vec<bool> = f0.iter().enumerate().map(|(index, value)| confidence[index] >= 0.6 && *value >= 65.0 && *value <= 1_000.0).collect();
    let mut change = vec![0.0; f0.len()];
    for index in 4..f0.len() { if reliable[index] && reliable[index - 4] { change[index] = (12.0 * libm::log2(f0[index] / f0[index - 4])).abs(); } }
    let change_unit = robust_unit(&change);
    for index in pick_peaks(&change, (0.25 * SAMPLE_RATE as f64 / pitch_hop as f64).round() as usize, 0.70, 1.5) {
        let delta_pitch = 12.0 * libm::log2(f0[index] / f0[index.saturating_sub(4)]);
        events.push(acoustic_event(index as f64 * pitch_hop as f64 / SAMPLE_RATE as f64, 0.35 + 0.65 * change_unit[index], if delta_pitch >= 0.0 { 8 } else { 9 }, f0[index], delta_pitch, confidence[index], 1.0));
    }
    for index in 1..reliable.len() { if reliable[index] != reliable[index - 1] { events.push(acoustic_event(index as f64 * pitch_hop as f64 / SAMPLE_RATE as f64, 0.45, if reliable[index] { 10 } else { 11 }, f0[index], 0.0, confidence[index], if reliable[index] { 1.0 } else { 0.0 })); } }
    events.sort_by(acoustic_event_sort);
    events
}

fn estimated_bytes(length: usize) -> u64 {
    let feature_frames = div_ceil(length, FEATURE_HOP) as u64;
    let variable_floats = length as u64 * 11
        + feature_frames * DEMUCS_SOURCES as u64 * FEATURE_BANDS as u64
        + feature_frames * 4;
    let fixed_floats = (2 * DEMUCS_SEGMENT_SAMPLES
        + 2 * DEMUCS_FREQUENCIES * DEMUCS_FRAMES * 2
        + DEMUCS_SOURCES * 2 * DEMUCS_FREQUENCIES * DEMUCS_FRAMES * 2
        + DEMUCS_SOURCES * 2 * DEMUCS_SEGMENT_SAMPLES
        + 2 * demucs_output_length()
        + 2 * DEMUCS_NFFT
        + DEMUCS_NFFT
        + FEATURE_FRAME) as u64;
    let dbn_bytes = feature_frames
        .saturating_mul(240)
        .saturating_mul(2)
        .saturating_add(2 * 1024 * 1024);
    (variable_floats + fixed_floats)
        .saturating_mul(4)
        .saturating_add(dbn_bytes)
        .saturating_add(16 * 1024 * 1024)
}

fn demucs_output_length() -> usize {
    DEMUCS_NFFT + DEMUCS_HOP * (DEMUCS_FRAMES + 4 - 1)
}

fn div_ceil(value: usize, divisor: usize) -> usize {
    (value + divisor - 1) / divisor
}

fn reflect_index(index: isize, length: usize) -> usize {
    if length <= 1 {
        return 0;
    }
    let period = (2 * length - 2) as isize;
    let wrapped = (index % period + period) % period;
    if wrapped < length as isize {
        wrapped as usize
    } else {
        (period - wrapped) as usize
    }
}

fn periodic_hann(size: usize) -> Vec<f32> {
    (0..size)
        .map(|sample| (0.5 - 0.5 * libm::cos(2.0 * PI * sample as f64 / size as f64)) as f32)
        .collect()
}

fn symmetric_hann(size: usize) -> Vec<f32> {
    (0..size)
        .map(|sample| (0.5 - 0.5 * libm::cos(2.0 * PI * sample as f64 / (size - 1) as f64)) as f32)
        .collect()
}

fn logarithmic_filterbank() -> FilterBank {
    let bin_frequencies: Vec<f64> = (0..FEATURE_BINS)
        .map(|index| index as f64 * SAMPLE_RATE as f64 / FEATURE_FRAME as f64)
        .collect();
    let left = libm::floor(libm::log2(30.0 / 440.0) * 12.0) as i32;
    let right = libm::ceil(libm::log2(17_000.0 / 440.0) * 12.0) as i32;
    let mut frequencies: Vec<f64> = (left..right)
        .map(|index| 440.0 * libm::exp2(index as f64 / 12.0))
        .collect();
    frequencies = frequencies[search_sorted_f64(&frequencies, 30.0, false)..].to_vec();
    frequencies.truncate(search_sorted_f64(&frequencies, 17_000.0, true));

    let mut indices = Vec::new();
    for frequency in frequencies {
        let upper =
            search_sorted_f64(&bin_frequencies, frequency, false).clamp(1, FEATURE_BINS - 1);
        let lower_value = bin_frequencies[upper - 1];
        let upper_value = bin_frequencies[upper];
        let index = upper - usize::from(frequency - lower_value < upper_value - frequency);
        if indices.last().copied() != Some(index) {
            indices.push(index);
        }
    }

    let mut starts = Vec::new();
    let mut values = Vec::new();
    for index in 0..indices.len().saturating_sub(2) {
        let start = indices[index];
        let mut center = indices[index + 1];
        let mut stop = indices[index + 2];
        if stop - start < 2 {
            center = start;
            stop = start + 1;
        }
        let width = stop - start;
        let peak = center - start;
        let mut filter = vec![0.0; width];
        for value_index in 0..peak {
            filter[value_index] = (value_index as f64 / peak as f64) as f32;
        }
        for value_index in peak..width {
            filter[value_index] =
                (1.0 - (value_index - peak) as f64 / (width - peak) as f64) as f32;
        }
        let sum: f64 = filter.iter().map(|value| *value as f64).sum();
        for value in &mut filter {
            *value = (*value as f64 / sum) as f32;
        }
        starts.push(start);
        values.push(filter);
    }
    debug_assert_eq!(starts.len(), FEATURE_BANDS);
    FilterBank { starts, values }
}

fn search_sorted_f64(values: &[f64], target: f64, right: bool) -> usize {
    let mut low = 0;
    let mut high = values.len();
    while low < high {
        let middle = (low + high) >> 1;
        if values[middle] < target || (right && values[middle] == target) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    low
}

fn fft(real: &mut [f32], imaginary: &mut [f32], inverse: bool) {
    let size = real.len();
    let mut reverse = 0_usize;
    for index in 1..size {
        let mut bit = size >> 1;
        while reverse & bit != 0 {
            reverse ^= bit;
            bit >>= 1;
        }
        reverse ^= bit;
        if index < reverse {
            real.swap(index, reverse);
            imaginary.swap(index, reverse);
        }
    }

    let mut block_size = 2;
    while block_size <= size {
        let half = block_size >> 1;
        let angle = if inverse { 2.0 } else { -2.0 } * PI / block_size as f64;
        let step_real = libm::cos(angle);
        let step_imaginary = libm::sin(angle);
        for start in (0..size).step_by(block_size) {
            let mut weight_real = 1.0_f64;
            let mut weight_imaginary = 0.0_f64;
            for offset in 0..half {
                let even = start + offset;
                let odd = even + half;
                let odd_real =
                    real[odd] as f64 * weight_real - imaginary[odd] as f64 * weight_imaginary;
                let odd_imaginary =
                    real[odd] as f64 * weight_imaginary + imaginary[odd] as f64 * weight_real;
                let even_real = real[even] as f64;
                let even_imaginary = imaginary[even] as f64;
                real[even] = (even_real + odd_real) as f32;
                imaginary[even] = (even_imaginary + odd_imaginary) as f32;
                real[odd] = (even_real - odd_real) as f32;
                imaginary[odd] = (even_imaginary - odd_imaginary) as f32;
                let next_weight_real = weight_real * step_real - weight_imaginary * step_imaginary;
                weight_imaginary = weight_real * step_imaginary + weight_imaginary * step_real;
                weight_real = next_weight_real;
            }
        }
        block_size <<= 1;
    }

    if inverse {
        for index in 0..size {
            real[index] = (real[index] as f64 / size as f64) as f32;
            imaginary[index] = (imaginary[index] as f64 / size as f64) as f32;
        }
    }
}
