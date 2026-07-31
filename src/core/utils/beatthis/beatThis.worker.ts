import type { AudioSample } from 'mediabunny'
import { BunnyMedia } from '@/core/mediabunny/bunny-media'
import { RENDERER_FPS } from '@/core/mediabunny/constant'
import type { AIMark } from '@/core/timelineitem/model/timelineItem'
import type { OnnxModelLoadProgress } from '@/core/onnx'
import { StreamingLinearResampler, StreamingLogMel } from './audioPreprocess'
import { loadBeatThisRunner } from './modelRunner'
import { collectChunkPeaks, labelBeatFrames, postprocessBeatFrames } from './postprocess'
import {
  BEAT_THIS_BORDER_SIZE,
  BEAT_THIS_CHUNK_SIZE,
  BEAT_THIS_CHUNK_STEP,
  BEAT_THIS_FEATURE_FPS,
  BEAT_THIS_MEL_BINS,
  type BeatThisMarks,
  type BeatThisProgressEvent,
} from './types'

const MODEL_LOADING_PROGRESS_END = 20
const FEATURE_PROGRESS_END = 80
const INFERENCE_PROGRESS_END = 95

interface BeatDetectionMessage {
  type: 'detect'
  file: File
  sourceRange: {
    sourceStartFrame: number
    sourceEndFrame: number
  }
}

type InboundMessage = BeatDetectionMessage | { type: 'abort' }

class FeatureFrameStore {
  private activeFrames: Float32Array[] = []
  private activeStartFrame = 0
  private tailFrames: Float32Array[] = []
  private _frameCount = 0

  get frameCount(): number {
    return this._frameCount
  }

  append(feature: Float32Array): void {
    this.activeFrames.push(feature)
    this.tailFrames.push(feature)
    if (this.tailFrames.length > BEAT_THIS_CHUNK_SIZE) {
      this.tailFrames.splice(0, this.tailFrames.length - BEAT_THIS_CHUNK_SIZE)
    }
    this._frameCount += 1
  }

  discardBefore(frame: number): void {
    const count = Math.max(0, Math.min(frame - this.activeStartFrame, this.activeFrames.length))
    if (count > 0) {
      this.activeFrames.splice(0, count)
      this.activeStartFrame += count
    }
  }

  createModelInput(startFrame: number, frameCount: number): Float32Array {
    const input = new Float32Array(frameCount * BEAT_THIS_MEL_BINS)
    for (let offset = 0; offset < frameCount; offset++) {
      const frame = startFrame + offset
      if (frame < 0 || frame >= this._frameCount) {
        continue
      }

      const feature = this.get(frame)
      if (!feature) {
        throw new Error(`节拍特征窗口缺失: ${frame}`)
      }
      input.set(feature, offset * BEAT_THIS_MEL_BINS)
    }
    return input
  }

  private get(frame: number): Float32Array | undefined {
    const activeIndex = frame - this.activeStartFrame
    if (activeIndex >= 0 && activeIndex < this.activeFrames.length) {
      return this.activeFrames[activeIndex]
    }

    const tailStartFrame = this._frameCount - this.tailFrames.length
    const tailIndex = frame - tailStartFrame
    return tailIndex >= 0 && tailIndex < this.tailFrames.length
      ? this.tailFrames[tailIndex]
      : undefined
  }
}

let aborted = false

function throwIfAborted(): void {
  if (aborted) {
    throw new DOMException('自动节拍已取消', 'AbortError')
  }
}

function postProgress(event: BeatThisProgressEvent): void {
  self.postMessage({ type: 'progress', event })
}

function reportModelLoadProgress(progress: OnnxModelLoadProgress): void {
  let current = 0
  let stage: BeatThisProgressEvent['stage'] = 'loading-model'

  switch (progress.stage) {
    case 'checking-cache':
      current = 2
      stage = 'checking-cache'
      break
    case 'loading-from-cache':
      current = 8
      stage = 'loading-from-cache'
      break
    case 'downloading-model':
      current = Math.round((progress.progress ?? 0) * (MODEL_LOADING_PROGRESS_END - 4)) + 4
      stage = 'downloading-model'
      break
    case 'initializing-session':
      current = 18
      stage = 'initializing-model'
      break
    case 'ready':
      current = MODEL_LOADING_PROGRESS_END
      stage = 'model-ready'
      break
  }

  postProgress({
    current,
    total: 100,
    stage,
    progress: progress.progress,
    loadedBytes: progress.loadedBytes,
    totalBytes: progress.totalBytes,
  })
}

function copyMonoFrames(
  sample: AudioSample,
  startSeconds: number,
  endSeconds: number,
): Float32Array {
  const frameStart = Math.max(0, Math.ceil((startSeconds - sample.timestamp) * sample.sampleRate))
  const frameEnd = Math.min(
    sample.numberOfFrames,
    Math.ceil((endSeconds - sample.timestamp) * sample.sampleRate),
  )
  const frameCount = Math.max(0, frameEnd - frameStart)
  if (frameCount === 0) {
    return new Float32Array(0)
  }

  const mono = new Float32Array(frameCount)
  for (let channel = 0; channel < sample.numberOfChannels; channel++) {
    const channelFrames = new Float32Array(frameCount)
    sample.copyTo(channelFrames, {
      format: 'f32-planar',
      planeIndex: channel,
      frameOffset: frameStart,
      frameCount,
    })
    for (let frame = 0; frame < frameCount; frame++) {
      mono[frame] = (mono[frame] ?? 0) + (channelFrames[frame] ?? 0) / sample.numberOfChannels
    }
  }
  return mono
}

function mapMarksToSource(
  beatMarks: Array<{ frame: number; beat: AIMark['beat'] }>,
  sourceRange: BeatDetectionMessage['sourceRange'],
): BeatThisMarks {
  if (sourceRange.sourceEndFrame <= sourceRange.sourceStartFrame) {
    return []
  }

  const marksBySourceFrame = new Map<number, AIMark>()
  for (const mark of beatMarks) {
    const sourceFrame =
      sourceRange.sourceStartFrame + Math.round((mark.frame / BEAT_THIS_FEATURE_FPS) * RENDERER_FPS)
    if (
      sourceFrame < sourceRange.sourceStartFrame ||
      sourceFrame >= sourceRange.sourceEndFrame
    ) {
      continue
    }

    const existing = marksBySourceFrame.get(sourceFrame)
    if (!existing || mark.beat === 1) {
      marksBySourceFrame.set(sourceFrame, { sourceFrame, beat: mark.beat })
    }
  }

  return Array.from(marksBySourceFrame.values()).sort(
    (left, right) => left.sourceFrame - right.sourceFrame,
  )
}

async function detect(message: BeatDetectionMessage): Promise<void> {
  aborted = false
  const { file, sourceRange } = message
  const sourceStartSeconds = sourceRange.sourceStartFrame / RENDERER_FPS
  const sourceEndSeconds = sourceRange.sourceEndFrame / RENDERER_FPS
  const sourceDurationSeconds = sourceEndSeconds - sourceStartSeconds

  if (sourceDurationSeconds <= 0) {
    throw new Error('片段音频区间无效')
  }

  postProgress({ current: 0, total: 100, stage: 'loading-model' })
  const runner = await loadBeatThisRunner({ onProgress: reportModelLoadProgress })
  throwIfAborted()

  const featureStore = new FeatureFrameStore()
  const beatPeakFrames: number[] = []
  const downbeatPeakFrames: number[] = []
  let nextPermanentChunkStart = -BEAT_THIS_BORDER_SIZE
  let permanentEndFrame = 0

  const runChunk = async (
    startFrame: number,
    inputFrameCount: number,
    firstFrameToKeep: number,
  ): Promise<void> => {
    throwIfAborted()
    const output = await runner.run(
      featureStore.createModelInput(startFrame, inputFrameCount),
      inputFrameCount,
    )
    const totalFrames = featureStore.frameCount
    beatPeakFrames.push(
      ...collectChunkPeaks(output.beat, startFrame, firstFrameToKeep, totalFrames),
    )
    downbeatPeakFrames.push(
      ...collectChunkPeaks(output.downbeat, startFrame, firstFrameToKeep, totalFrames),
    )
  }

  const runPermanentChunks = async (): Promise<void> => {
    while (featureStore.frameCount >= nextPermanentChunkStart + BEAT_THIS_CHUNK_SIZE) {
      await runChunk(nextPermanentChunkStart, BEAT_THIS_CHUNK_SIZE, permanentEndFrame)
      permanentEndFrame = nextPermanentChunkStart + BEAT_THIS_CHUNK_SIZE - BEAT_THIS_BORDER_SIZE
      nextPermanentChunkStart += BEAT_THIS_CHUNK_STEP
      featureStore.discardBefore(nextPermanentChunkStart)
      postProgress({
        current: FEATURE_PROGRESS_END,
        total: 100,
        stage: 'detecting-beats',
        audioCurrentSeconds: featureStore.frameCount / BEAT_THIS_FEATURE_FPS,
        audioTotalSeconds: sourceDurationSeconds,
      })
    }
  }

  const bunnyMedia = new BunnyMedia(file)
  try {
    await bunnyMedia.ready
    throwIfAborted()

    const audioInfo = bunnyMedia.getAudioTrackInfo()
    const audioSamples = bunnyMedia.audioSamplesFunc()
    if (!audioInfo || !audioSamples) {
      throw new Error('当前媒体没有可解码的音频轨道')
    }

    const logMel = new StreamingLogMel((feature) => featureStore.append(feature))
    const resampler = new StreamingLinearResampler(audioInfo.sampleRate)
    const consumeResampledAudio = (samples: Float32Array) => logMel.push(samples)

    postProgress({
      current: MODEL_LOADING_PROGRESS_END,
      total: 100,
      stage: 'decoding-audio',
      audioCurrentSeconds: 0,
      audioTotalSeconds: sourceDurationSeconds,
    })

    for await (const sample of audioSamples(sourceStartSeconds, sourceEndSeconds)) {
      try {
        throwIfAborted()
        const mono = copyMonoFrames(sample, sourceStartSeconds, sourceEndSeconds)
        resampler.push(mono, consumeResampledAudio)
        await runPermanentChunks()

        const decodedEnd = Math.min(sourceEndSeconds, sample.timestamp + sample.duration)
        const decodedSeconds = Math.max(0, decodedEnd - sourceStartSeconds)
        postProgress({
          current: Math.round(
            MODEL_LOADING_PROGRESS_END +
              (decodedSeconds / sourceDurationSeconds) *
                (FEATURE_PROGRESS_END - MODEL_LOADING_PROGRESS_END),
          ),
          total: 100,
          stage: 'extracting-features',
          audioCurrentSeconds: decodedSeconds,
          audioTotalSeconds: sourceDurationSeconds,
        })
      } finally {
        sample.close()
      }
    }

    throwIfAborted()
    resampler.finish(consumeResampledAudio)
    logMel.finish()
    await runPermanentChunks()

    const totalFrames = featureStore.frameCount
    if (totalFrames === 0) {
      throw new Error('未能从音频中提取节拍特征')
    }

    postProgress({ current: INFERENCE_PROGRESS_END, total: 100, stage: 'finalizing-beats' })
    const finalStartFrame =
      totalFrames > BEAT_THIS_CHUNK_STEP
        ? totalFrames - (BEAT_THIS_CHUNK_SIZE - BEAT_THIS_BORDER_SIZE)
        : -BEAT_THIS_BORDER_SIZE
    const finalInputFrameCount =
      totalFrames > BEAT_THIS_CHUNK_STEP
        ? BEAT_THIS_CHUNK_SIZE
        : totalFrames + BEAT_THIS_BORDER_SIZE * 2
    await runChunk(finalStartFrame, finalInputFrameCount, permanentEndFrame)

    const { beatFrames, downbeatFrames } = postprocessBeatFrames(beatPeakFrames, downbeatPeakFrames)
    const rawBeats = labelBeatFrames(beatFrames, downbeatFrames)
    const marks = mapMarksToSource(rawBeats, sourceRange)

    self.postMessage({ type: 'done', marks, rawBeats })
  } finally {
    await bunnyMedia.dispose()
  }
}

self.onmessage = async (event: MessageEvent<InboundMessage>) => {
  if (event.data.type === 'abort') {
    aborted = true
    return
  }

  try {
    await detect(event.data)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      self.postMessage({ type: 'error', message: '自动节拍已取消' })
      return
    }
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
