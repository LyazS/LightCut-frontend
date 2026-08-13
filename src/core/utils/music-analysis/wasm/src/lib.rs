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
