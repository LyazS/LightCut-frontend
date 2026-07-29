import { BEAT_THIS_HOP_LENGTH, BEAT_THIS_MEL_BINS, BEAT_THIS_SAMPLE_RATE } from './types'

const FFT_SIZE = 1024
const MEL_MIN_HZ = 30
const MEL_MAX_HZ = 11000
const REFLECT_PADDING = FFT_SIZE / 2
const FRAME_LENGTH_NORMALIZATION = Math.sqrt(FFT_SIZE)

function concatenateSamples(left: Float32Array, right: Float32Array): Float32Array {
  const merged = new Float32Array(left.length + right.length)
  merged.set(left)
  merged.set(right, left.length)
  return merged
}

/**
 * A stateful, linear PCM resampler. It keeps interpolation state between decoded samples so
 * long media does not need to be materialized before feature extraction.
 */
export class StreamingLinearResampler {
  private readonly step: number
  private pending: Float32Array<ArrayBufferLike> = new Float32Array(0)
  private position = 0

  constructor(
    private readonly sourceSampleRate: number,
    private readonly targetSampleRate = BEAT_THIS_SAMPLE_RATE,
  ) {
    if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
      throw new Error('音频采样率无效')
    }
    this.step = sourceSampleRate / targetSampleRate
  }

  push(samples: Float32Array, onSamples: (samples: Float32Array) => void): void {
    if (samples.length === 0) {
      return
    }
    if (this.sourceSampleRate === this.targetSampleRate) {
      onSamples(samples)
      return
    }

    this.pending = concatenateSamples(this.pending, samples)
    const output = new Float32Array(Math.ceil(this.pending.length / this.step))
    let outputLength = 0

    while (this.position + 1 < this.pending.length) {
      const index = Math.floor(this.position)
      const fraction = this.position - index
      const first = this.pending[index] ?? 0
      const second = this.pending[index + 1] ?? first
      output[outputLength++] = first + (second - first) * fraction
      this.position += this.step
    }

    const consumed = Math.floor(this.position)
    if (consumed > 0) {
      this.pending = this.pending.slice(consumed)
      this.position -= consumed
    }

    if (outputLength > 0) {
      onSamples(output.subarray(0, outputLength))
    }
  }

  finish(onSamples: (samples: Float32Array) => void): void {
    if (this.sourceSampleRate === this.targetSampleRate || this.pending.length === 0) {
      return
    }

    const lastSample = this.pending[this.pending.length - 1] ?? 0
    const output: number[] = []
    while (this.position < this.pending.length) {
      const index = Math.floor(this.position)
      const fraction = this.position - index
      const first = this.pending[index] ?? lastSample
      const second = this.pending[index + 1] ?? lastSample
      output.push(first + (second - first) * fraction)
      this.position += this.step
    }
    this.pending = new Float32Array(0)

    if (output.length > 0) {
      onSamples(Float32Array.from(output))
    }
  }
}

function hertzToSlaneyMel(hertz: number): number {
  const frequencySpacing = 200 / 3
  const minLogHertz = 1000
  const minLogMel = minLogHertz / frequencySpacing
  const logStep = Math.log(6.4) / 27
  return hertz < minLogHertz
    ? hertz / frequencySpacing
    : minLogMel + Math.log(hertz / minLogHertz) / logStep
}

function slaneyMelToHertz(mel: number): number {
  const frequencySpacing = 200 / 3
  const minLogHertz = 1000
  const minLogMel = minLogHertz / frequencySpacing
  const logStep = Math.log(6.4) / 27
  return mel < minLogMel
    ? mel * frequencySpacing
    : minLogHertz * Math.exp(logStep * (mel - minLogMel))
}

function createSlaneyMelFilterBank(): Float32Array {
  const filterBank = new Float32Array(BEAT_THIS_MEL_BINS * (FFT_SIZE / 2 + 1))
  const minMel = hertzToSlaneyMel(MEL_MIN_HZ)
  const maxMel = hertzToSlaneyMel(MEL_MAX_HZ)
  const melPoints = Array.from({ length: BEAT_THIS_MEL_BINS + 2 }, (_, index) =>
    slaneyMelToHertz(minMel + ((maxMel - minMel) * index) / (BEAT_THIS_MEL_BINS + 1)),
  )

  for (let melIndex = 0; melIndex < BEAT_THIS_MEL_BINS; melIndex++) {
    const lower = melPoints[melIndex] ?? 0
    const center = melPoints[melIndex + 1] ?? 0
    const upper = melPoints[melIndex + 2] ?? 0
    for (let bin = 0; bin <= FFT_SIZE / 2; bin++) {
      const hertz = (bin * BEAT_THIS_SAMPLE_RATE) / FFT_SIZE
      const rising = center > lower ? (hertz - lower) / (center - lower) : 0
      const falling = upper > center ? (upper - hertz) / (upper - center) : 0
      filterBank[melIndex * (FFT_SIZE / 2 + 1) + bin] = Math.max(0, Math.min(rising, falling))
    }
  }

  return filterBank
}

function fft(real: Float32Array, imaginary: Float32Array): void {
  const size = real.length
  for (let index = 1, reverse = 0; index < size; index++) {
    let bit = size >> 1
    while (reverse & bit) {
      reverse ^= bit
      bit >>= 1
    }
    reverse ^= bit
    if (index < reverse) {
      const realValue = real[index] ?? 0
      real[index] = real[reverse] ?? 0
      real[reverse] = realValue
      const imaginaryValue = imaginary[index] ?? 0
      imaginary[index] = imaginary[reverse] ?? 0
      imaginary[reverse] = imaginaryValue
    }
  }

  for (let width = 2; width <= size; width <<= 1) {
    const angle = (-2 * Math.PI) / width
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const halfWidth = width >> 1

    for (let start = 0; start < size; start += width) {
      let currentCosine = 1
      let currentSine = 0
      for (let offset = 0; offset < halfWidth; offset++) {
        const evenIndex = start + offset
        const oddIndex = evenIndex + halfWidth
        const oddReal = real[oddIndex] ?? 0
        const oddImaginary = imaginary[oddIndex] ?? 0
        const transformedReal = oddReal * currentCosine - oddImaginary * currentSine
        const transformedImaginary = oddReal * currentSine + oddImaginary * currentCosine
        const evenReal = real[evenIndex] ?? 0
        const evenImaginary = imaginary[evenIndex] ?? 0

        real[oddIndex] = evenReal - transformedReal
        imaginary[oddIndex] = evenImaginary - transformedImaginary
        real[evenIndex] = evenReal + transformedReal
        imaginary[evenIndex] = evenImaginary + transformedImaginary

        const nextCosine = currentCosine * cosine - currentSine * sine
        currentSine = currentCosine * sine + currentSine * cosine
        currentCosine = nextCosine
      }
    }
  }
}

/** Streams Beat This-compatible log-Mel frames with bounded PCM memory. */
export class StreamingLogMel {
  private readonly window = new Float32Array(FFT_SIZE)
  private readonly melFilterBank = createSlaneyMelFilterBank()
  private readonly real = new Float32Array(FFT_SIZE)
  private readonly imaginary = new Float32Array(FFT_SIZE)
  private initialSamples: Float32Array<ArrayBufferLike> = new Float32Array(0)
  private tailSamples: Float32Array<ArrayBufferLike> = new Float32Array(0)
  private pending: Float32Array<ArrayBufferLike> = new Float32Array(0)
  private pendingOffset = 0
  private started = false

  constructor(private readonly onFeature: (feature: Float32Array) => void) {
    for (let index = 0; index < FFT_SIZE; index++) {
      this.window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / FFT_SIZE)
    }
  }

  push(samples: Float32Array): void {
    if (samples.length === 0) {
      return
    }

    this.tailSamples = concatenateSamples(this.tailSamples, samples)
    if (this.tailSamples.length > REFLECT_PADDING + 1) {
      this.tailSamples = this.tailSamples.slice(-(REFLECT_PADDING + 1))
    }

    if (!this.started) {
      this.initialSamples = concatenateSamples(this.initialSamples, samples)
      if (this.initialSamples.length <= REFLECT_PADDING) {
        return
      }

      const leftPadding = new Float32Array(REFLECT_PADDING)
      for (let index = 0; index < REFLECT_PADDING; index++) {
        leftPadding[index] = this.initialSamples[REFLECT_PADDING - index] ?? 0
      }
      this.started = true
      this.appendToPending(leftPadding)
      this.appendToPending(this.initialSamples)
      this.initialSamples = new Float32Array(0)
      return
    }

    this.appendToPending(samples)
  }

  finish(): void {
    if (!this.started || this.tailSamples.length <= REFLECT_PADDING) {
      throw new Error('音频过短，无法提取节拍特征')
    }

    const rightPadding = new Float32Array(REFLECT_PADDING)
    const tailEnd = this.tailSamples.length - 1
    for (let index = 0; index < REFLECT_PADDING; index++) {
      rightPadding[index] = this.tailSamples[tailEnd - 1 - index] ?? 0
    }
    this.appendToPending(rightPadding)
  }

  private appendToPending(samples: Float32Array): void {
    const remaining = this.pending.subarray(this.pendingOffset)
    this.pending = concatenateSamples(remaining, samples)
    this.pendingOffset = 0

    while (this.pending.length - this.pendingOffset >= FFT_SIZE) {
      this.onFeature(this.createFeature(this.pendingOffset))
      this.pendingOffset += BEAT_THIS_HOP_LENGTH
    }

    if (this.pendingOffset > FFT_SIZE * 2) {
      this.pending = this.pending.slice(this.pendingOffset)
      this.pendingOffset = 0
    }
  }

  private createFeature(start: number): Float32Array {
    for (let index = 0; index < FFT_SIZE; index++) {
      this.real[index] = (this.pending[start + index] ?? 0) * (this.window[index] ?? 0)
      this.imaginary[index] = 0
    }
    fft(this.real, this.imaginary)

    const magnitudes = new Float32Array(FFT_SIZE / 2 + 1)
    for (let bin = 0; bin < magnitudes.length; bin++) {
      const real = this.real[bin] ?? 0
      const imaginary = this.imaginary[bin] ?? 0
      magnitudes[bin] = Math.hypot(real, imaginary) / FRAME_LENGTH_NORMALIZATION
    }

    const feature = new Float32Array(BEAT_THIS_MEL_BINS)
    for (let melIndex = 0; melIndex < BEAT_THIS_MEL_BINS; melIndex++) {
      let energy = 0
      const filterOffset = melIndex * magnitudes.length
      for (let bin = 0; bin < magnitudes.length; bin++) {
        energy += (magnitudes[bin] ?? 0) * (this.melFilterBank[filterOffset + bin] ?? 0)
      }
      feature[melIndex] = Math.log1p(1000 * energy)
    }
    return feature
  }
}
