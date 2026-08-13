import type { AudioSample } from 'mediabunny'
import { BunnyMedia } from '@/core/mediabunny/bunny-media'
import type { OnnxModelLoadProgress } from '@/core/onnx'
import { MUSIC_ANALYSIS_HARMONIX_MODEL_IDS, loadDemucsRunner, runHarmonixFold } from './modelRunner'
import { WasmDspEngine, featureShape } from './dsp'
import { analyzeLogits } from './postprocess'
import {
  MUSIC_ANALYSIS_MAX_DURATION_SECONDS,
  MUSIC_ANALYSIS_MIN_DURATION_SECONDS,
  MUSIC_ANALYSIS_SAMPLE_RATE,
  type MusicAnalysisInboundMessage,
  type MusicAnalysisProgressEvent,
  type MusicAnalysisResult,
  type MusicAnalysisStage,
} from './types'

const workerScope = self

let aborted = false

class StreamingLinearResampler {
  private readonly step: number
  private pending: Float32Array<ArrayBufferLike> = new Float32Array(0)
  private position = 0

  constructor(sourceSampleRate: number) {
    if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
      throw new Error('音频采样率无效')
    }
    this.step = sourceSampleRate / MUSIC_ANALYSIS_SAMPLE_RATE
  }

  push(samples: Float32Array, onSamples: (samples: Float32Array) => void): void {
    if (samples.length === 0) return
    if (this.step === 1) {
      onSamples(samples)
      return
    }
    this.pending = concatenate(this.pending, samples)
    const output = new Float32Array(Math.ceil(this.pending.length / this.step))
    let outputLength = 0
    while (this.position + 1 < this.pending.length) {
      const index = Math.floor(this.position)
      const fraction = this.position - index
      const first = this.pending[index]!
      const second = this.pending[index + 1]!
      output[outputLength++] = first + (second - first) * fraction
      this.position += this.step
    }
    const consumed = Math.floor(this.position)
    if (consumed > 0) {
      this.pending = this.pending.slice(consumed)
      this.position -= consumed
    }
    if (outputLength > 0) onSamples(output.subarray(0, outputLength))
  }

  finish(onSamples: (samples: Float32Array) => void): void {
    if (this.step === 1 || this.pending.length === 0) return
    const lastSample = this.pending[this.pending.length - 1]!
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
    if (output.length > 0) onSamples(Float32Array.from(output))
  }
}

class StereoPcmCollector {
  private readonly leftChunks: Float32Array[] = []
  private readonly rightChunks: Float32Array[] = []
  private sampleCount = 0

  append(left: Float32Array, right: Float32Array): void {
    if (left.length !== right.length) {
      throw new Error('立体声重采样帧数不一致')
    }
    if (left.length === 0) return
    this.leftChunks.push(left)
    this.rightChunks.push(right)
    this.sampleCount += left.length
  }

  toPlanarStereo(): Float32Array {
    const channels = new Float32Array(this.sampleCount * 2)
    let offset = 0
    for (const chunk of this.leftChunks) {
      channels.set(chunk, offset)
      offset += chunk.length
    }
    offset = this.sampleCount
    for (const chunk of this.rightChunks) {
      channels.set(chunk, offset)
      offset += chunk.length
    }
    return channels
  }
}

function concatenate(left: Float32Array, right: Float32Array): Float32Array {
  const combined = new Float32Array(left.length + right.length)
  combined.set(left)
  combined.set(right, left.length)
  return combined
}

function throwIfAborted(): void {
  if (aborted) {
    throw new DOMException('音乐结构分析已取消', 'AbortError')
  }
}

function postProgress(stage: MusicAnalysisStage, progress: number, detail: string): void {
  const event: MusicAnalysisProgressEvent = {
    stage,
    progress: Math.max(0, Math.min(1, progress)),
    detail,
  }
  workerScope.postMessage({ type: 'progress', event })
}

function copyStereoFrames(sample: AudioSample, startSeconds: number, endSeconds: number) {
  const frameStart = Math.max(0, Math.ceil((startSeconds - sample.timestamp) * sample.sampleRate))
  const frameEnd = Math.min(
    sample.numberOfFrames,
    Math.ceil((endSeconds - sample.timestamp) * sample.sampleRate),
  )
  const frameCount = Math.max(0, frameEnd - frameStart)
  if (frameCount === 0) {
    return { left: new Float32Array(0), right: new Float32Array(0) }
  }

  const left = new Float32Array(frameCount)
  const right = new Float32Array(frameCount)
  sample.copyTo(left, {
    format: 'f32-planar',
    planeIndex: 0,
    frameOffset: frameStart,
    frameCount,
  })
  if (sample.numberOfChannels > 1) {
    sample.copyTo(right, {
      format: 'f32-planar',
      planeIndex: 1,
      frameOffset: frameStart,
      frameCount,
    })
  } else {
    right.set(left)
  }
  return { left, right }
}

function reportModelLoadProgress(
  progress: OnnxModelLoadProgress,
  stage: MusicAnalysisStage,
  progressStart: number,
  progressEnd: number,
  label: string,
): void {
  const range = progressEnd - progressStart
  if (progress.stage === 'checking-cache') {
    postProgress(stage, progressStart, `检查${label}模型缓存`)
  } else if (progress.stage === 'loading-from-cache') {
    postProgress(stage, progressStart + range * 0.1, `从浏览器缓存加载${label}模型`)
  } else if (progress.stage === 'downloading-model') {
    const percent = Math.round((progress.progress ?? 0) * 100)
    postProgress(
      stage,
      progressStart + range * (progress.progress ?? 0),
      `下载${label}模型 ${percent}%`,
    )
  } else if (progress.stage === 'initializing-session') {
    postProgress(stage, progressEnd, `初始化${label}模型`)
  }
}

async function decodeToStereo(
  file: File,
  expectedDurationSeconds: number,
): Promise<{ channels: Float32Array; duration: number }> {
  const media = new BunnyMedia(file)
  try {
    await media.ready
    throwIfAborted()
    const duration = media.duration
    if (
      duration < MUSIC_ANALYSIS_MIN_DURATION_SECONDS ||
      duration > MUSIC_ANALYSIS_MAX_DURATION_SECONDS
    ) {
      throw new Error(
        `音乐结构分析仅支持 ${MUSIC_ANALYSIS_MIN_DURATION_SECONDS}-${MUSIC_ANALYSIS_MAX_DURATION_SECONDS} 秒音频`,
      )
    }
    if (Math.abs(duration - expectedDurationSeconds) > 1) {
      throw new Error('素材时长与已就绪媒体信息不一致，请重新导入后再试')
    }

    const audioInfo = media.getAudioTrackInfo()
    const audioSamples = media.audioSamplesFunc()
    if (!audioInfo || !audioSamples) {
      throw new Error('当前素材没有可解码的音频轨道')
    }

    const leftResampler = new StreamingLinearResampler(audioInfo.sampleRate)
    const rightResampler = new StreamingLinearResampler(audioInfo.sampleRate)
    const collector = new StereoPcmCollector()
    const leftPending: Float32Array[] = []
    const rightPending: Float32Array[] = []
    const flushStereo = () => {
      while (leftPending.length && rightPending.length) {
        const nextLeft = leftPending.shift()!
        const nextRight = rightPending.shift()!
        collector.append(nextLeft, nextRight)
      }
    }
    const appendLeft = (left: Float32Array) => {
      leftPending.push(left)
      flushStereo()
    }
    const appendRight = (right: Float32Array) => {
      rightPending.push(right)
      flushStereo()
    }

    postProgress('decoding-audio', 0.07, `解码音频: ${file.name}`)
    for await (const sample of audioSamples(0, duration)) {
      try {
        throwIfAborted()
        const stereo = copyStereoFrames(sample, 0, duration)
        leftResampler.push(stereo.left, appendLeft)
        rightResampler.push(stereo.right, appendRight)

        const decodedEnd = Math.min(duration, sample.timestamp + sample.duration)
        postProgress(
          'decoding-audio',
          0.07 + (Math.max(0, decodedEnd) / duration) * 0.08,
          `解码音频 ${Math.round((Math.max(0, decodedEnd) / duration) * 100)}%`,
        )
      } finally {
        sample.close()
      }
    }

    leftResampler.finish(appendLeft)
    rightResampler.finish(appendRight)
    if (leftPending.length !== 0 || rightPending.length !== 0) {
      throw new Error('立体声重采样结果不完整')
    }
    const channels = collector.toPlanarStereo()
    if (channels.length === 0) throw new Error('未能解码出音频 PCM')
    return { channels, duration: channels.length / 2 / MUSIC_ANALYSIS_SAMPLE_RATE }
  } finally {
    await media.dispose()
  }
}

function accumulate(total: Float32Array | undefined, values: Float32Array): Float32Array {
  if (!total) return new Float32Array(values)
  if (total.length !== values.length) throw new Error('Harmonix folds 输出形状不一致')
  for (let index = 0; index < total.length; index += 1) {
    total[index] = Math.fround(total[index]! + values[index]!)
  }
  return total
}

function divideInPlace(values: Float32Array, divisor: number): void {
  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.fround(values[index]! / divisor)
  }
}

async function analyze(file: File, expectedDurationSeconds: number): Promise<MusicAnalysisResult> {
  aborted = false
  postProgress('checking-model-cache', 0, '准备本地音乐结构分析')
  const decoded = await decodeToStereo(file, expectedDurationSeconds)
  throwIfAborted()

  const dsp = await WasmDspEngine.create(decoded.channels)
  try {
    const demucs = await loadDemucsRunner({
      onProgress: (progress) =>
        reportModelLoadProgress(progress, 'separating-stems', 0.15, 0.18, 'HTDemucs'),
    })
    try {
      for (let index = 0; index < dsp.segmentCount; index += 1) {
        throwIfAborted()
        postProgress(
          'separating-stems',
          0.15 + (index / dsp.segmentCount) * 0.6,
          `分离音轨 ${index + 1}/${dsp.segmentCount}`,
        )
        const segment = dsp.prepareSegment(index)
        const outputs = await demucs.run(segment.mix, segment.stft)
        dsp.combineSegment(
          segment.offset,
          segment.currentLength,
          outputs.complexStems,
          outputs.timeStems,
        )
      }
    } finally {
      await demucs.release()
    }

    throwIfAborted()
    postProgress('extracting-features', 0.76, '提取 Harmonix 频谱特征')
    const features = dsp.extractFeatures()
    const frames = featureShape(dsp.length)[2]

    let beatSum: Float32Array | undefined
    let downbeatSum: Float32Array | undefined
    let sectionSum: Float32Array | undefined
    let functionSum: Float32Array | undefined
    for (let index = 0; index < MUSIC_ANALYSIS_HARMONIX_MODEL_IDS.length; index += 1) {
      throwIfAborted()
      const modelId = MUSIC_ANALYSIS_HARMONIX_MODEL_IDS[index]!
      postProgress(
        'running-ensemble',
        0.8 + (index / MUSIC_ANALYSIS_HARMONIX_MODEL_IDS.length) * 0.16,
        `运行 Harmonix fold ${index + 1}/${MUSIC_ANALYSIS_HARMONIX_MODEL_IDS.length}`,
      )
      const outputs = await runHarmonixFold(modelId, features, frames, {
        onProgress: (progress) =>
          reportModelLoadProgress(
            progress,
            'running-ensemble',
            0.8 + (index / MUSIC_ANALYSIS_HARMONIX_MODEL_IDS.length) * 0.16,
            0.8 + ((index + 1) / MUSIC_ANALYSIS_HARMONIX_MODEL_IDS.length) * 0.16,
            `Harmonix fold ${index + 1}`,
          ),
      })
      beatSum = accumulate(beatSum, outputs.beat)
      downbeatSum = accumulate(downbeatSum, outputs.downbeat)
      sectionSum = accumulate(sectionSum, outputs.section)
      functionSum = accumulate(functionSum, outputs.function)
    }
    if (!beatSum || !downbeatSum || !sectionSum || !functionSum) {
      throw new Error('音乐结构模型未产生有效输出')
    }

    divideInPlace(beatSum, MUSIC_ANALYSIS_HARMONIX_MODEL_IDS.length)
    divideInPlace(downbeatSum, MUSIC_ANALYSIS_HARMONIX_MODEL_IDS.length)
    divideInPlace(sectionSum, MUSIC_ANALYSIS_HARMONIX_MODEL_IDS.length)
    divideInPlace(functionSum, MUSIC_ANALYSIS_HARMONIX_MODEL_IDS.length)
    throwIfAborted()
    postProgress('decoding-structure', 0.98, '解码节拍、强拍和音乐段落')
    const result = analyzeLogits(beatSum, downbeatSum, sectionSum, functionSum, (activations) =>
      dsp.decodeDownbeats(activations),
    )
    result.input.durationSeconds = decoded.duration
    postProgress('decoding-structure', 1, '音乐结构分析完成')
    return result
  } finally {
    dsp.dispose()
  }
}

workerScope.onmessage = (event: MessageEvent<MusicAnalysisInboundMessage>) => {
  if (event.data.type === 'abort') {
    aborted = true
    return
  }

  void analyze(event.data.file, event.data.expectedDurationSeconds)
    .then((result) => workerScope.postMessage({ type: 'done', result }))
    .catch((error: unknown) => {
      workerScope.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : '音乐结构分析失败',
      })
    })
}
