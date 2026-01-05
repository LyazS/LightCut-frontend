import type { WrappedAudioBuffer, AudioSampleSource } from 'mediabunny'
import { AudioSample } from 'mediabunny'
import type { IClip } from './IClip'
import { PerClipAudioBuffer } from './per-clip-audio-buffer'
import { AUDIO_DEFAULT_SAMPLE_RATE } from './constant'

/**
 * 音频分段渲染器配置
 */
export interface AudioSegmentRendererConfig {
  clips: Map<string, IClip>
  segmentDuration?: number // 分段时长（秒），默认 1.0
  overlapDuration?: number // 重叠时长（秒），默认 0.1
  sampleRate?: number // 采样率，默认 48000
  numberOfChannels?: number // 声道数，默认 2
}

/**
 * 音频分段渲染器
 * 负责协调所有 clip 的音频收集和分段渲染
 */
export class AudioSegmentRenderer {
  // 配置
  private segmentDuration: number
  private overlapDuration: number
  private sampleRate: number
  private numberOfChannels: number

  // 状态
  private clipBuffers: Map<string, PerClipAudioBuffer>
  private clips: Map<string, IClip>
  private audioSource: AudioSampleSource | null = null

  constructor(config: AudioSegmentRendererConfig) {
    this.clips = config.clips
    this.segmentDuration = config.segmentDuration ?? 1.0
    this.overlapDuration = config.overlapDuration ?? 0.1
    this.sampleRate = config.sampleRate ?? AUDIO_DEFAULT_SAMPLE_RATE
    this.numberOfChannels = config.numberOfChannels ?? 2

    // 为每个 clip 创建缓冲管理器（使用 item.id 作为键）
    this.clipBuffers = new Map()
    for (const [itemId, clip] of this.clips.entries()) {
      this.clipBuffers.set(itemId, new PerClipAudioBuffer(itemId))
    }
  }

  /**
   * 收集音频缓冲（仅收集，不触发渲染）
   * @param wrappedBuffers 包装的音频缓冲数组
   * @param itemId TimelineItem 的 ID
   * @param volume 音量值 (0-1)，默认为 1.0
   */
  async collectAudioBuffers(wrappedBuffers: WrappedAudioBuffer[], itemId: string, volume: number = 1.0): Promise<void> {
    const buffer = this.clipBuffers.get(itemId)
    if (!buffer) {
      console.warn(`未找到 item ${itemId} 的缓冲管理器`)
      return
    }

    // 只负责添加缓冲，同时传递音量信息
    for (const wrapped of wrappedBuffers) {
      buffer.addBuffer(wrapped, volume)
    }
  }

  /**
   * 渲染固定时长的音频段
   * @param segmentStartTime 段开始时间（秒）
   * @param customDuration 自定义渲染时长（秒），如果不提供则使用默认的 segmentDuration
   */
  async renderFixedSegment(segmentStartTime: number, customDuration?: number): Promise<void> {
    if (!this.audioSource) {
      throw new Error('AudioSource 未设置，请先调用 setAudioSource()')
    }

    const renderDuration = customDuration ?? this.segmentDuration
    const segmentEndTime = segmentStartTime + renderDuration
    const actualRenderDuration = renderDuration + this.overlapDuration // 包含overlap

    // 创建 OfflineAudioContext
    const offlineContext = new OfflineAudioContext({
      numberOfChannels: this.numberOfChannels,
      length: Math.ceil(actualRenderDuration * this.sampleRate),
      sampleRate: this.sampleRate,
    })

    // 为每个 clip 添加音频源
    for (const [itemId, buffer] of this.clipBuffers.entries()) {
      if (buffer.isEmpty()) continue

      // 获取该时间段内的缓冲
      const buffers = buffer.getBuffersInRange(
        segmentStartTime,
        segmentEndTime + this.overlapDuration,
      )

      // 添加缓冲到 OfflineAudioContext
      for (const bufferWithVolume of buffers) {
        const sourceNode = offlineContext.createBufferSource()
        sourceNode.buffer = bufferWithVolume.wrapped.buffer  // 直接使用 AudioBuffer

        // 设置播放速率
        const clip = this.clips.get(itemId)
        if (clip) {
          sourceNode.playbackRate.value = clip.getPlaybackRate()
        }

        // 创建音量控制节点
        const gainNode = offlineContext.createGain()
        gainNode.gain.value = bufferWithVolume.volume

        // 连接音频节点：sourceNode -> gainNode -> destination
        sourceNode.connect(gainNode)
        gainNode.connect(offlineContext.destination)

        // 计算在 context 中的起始时间
        const contextStartTime = bufferWithVolume.wrapped.timestamp - segmentStartTime

        if (contextStartTime >= 0) {
          sourceNode.start(contextStartTime)
        } else {
          const offset = -contextStartTime
          sourceNode.start(0, offset)
        }
      }
    }

    // 渲染音频
    const renderedBuffer = await offlineContext.startRendering()

    // 提取主体部分（不含overlap）
    const mainPartSamples = Math.ceil(renderDuration * this.sampleRate)
    const mainPartBuffer = new AudioBuffer({
      numberOfChannels: this.numberOfChannels,
      length: mainPartSamples,
      sampleRate: this.sampleRate,
    })

    for (let channel = 0; channel < this.numberOfChannels; channel++) {
      const sourceData = renderedBuffer.getChannelData(channel)
      const targetData = mainPartBuffer.getChannelData(channel)
      targetData.set(sourceData.subarray(0, mainPartSamples))
    }

    // 转换为 AudioSample 并添加到 audioSource
    const audioSamples = AudioSample.fromAudioBuffer(mainPartBuffer, segmentStartTime)
    for (const sample of audioSamples) {
      await this.audioSource.add(sample)
      sample.close()
    }

    // 清理已处理的缓冲
    const clearTimestamp = segmentEndTime - this.overlapDuration
    for (const buffer of this.clipBuffers.values()) {
      buffer.clearBuffersBeforeTimestamp(clearTimestamp)
    }
  }

  /**
   * 设置 AudioSource（必须在收集样本前调用）
   * @param audioSource 音频源
   */
  setAudioSource(audioSource: AudioSampleSource): void {
    this.audioSource = audioSource
  }

  /**
   * 完成渲染，处理最后一个不完整的段
   */
  async finalize(finalSegmentStartTime: number, totalDuration: number): Promise<void> {
    if (!this.audioSource) {
      throw new Error('AudioSource 未设置，请先调用 setAudioSource()')
    }

    // 检查是否还有未处理的样本
    const hasRemainingSamples = Array.from(this.clipBuffers.values()).some(
      buffer => !buffer.isEmpty()
    )

    if (hasRemainingSamples) {
      // 计算最后一段的实际长度
      const remainingDuration = totalDuration - finalSegmentStartTime
      if (remainingDuration > 0) {
        // 渲染最后一个段，使用实际剩余长度
        await this.renderFixedSegment(finalSegmentStartTime, remainingDuration)
      }
    }
  }

  /**
   * 清理所有资源
   */
  dispose(): void {
    for (const buffer of this.clipBuffers.values()) {
      buffer.clear()
    }
    this.clipBuffers.clear()
    this.audioSource = null
  }
}
