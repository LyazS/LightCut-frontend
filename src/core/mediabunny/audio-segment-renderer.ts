import { AudioSample } from 'mediabunny'
import type { AudioSampleSource } from 'mediabunny'
import type { IClip } from './IClip'
import { PerClipAudioBuffer } from './per-clip-audio-buffer'
import { AUDIO_DEFAULT_SAMPLE_RATE } from './constant'

/**
 * 音频分段渲染器配置
 */
export interface AudioSegmentRendererConfig {
  clips: Map<string, IClip> // 从 IClip[] 改为 Map<string, IClip>
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
  private clipBuffers: Map<string, PerClipAudioBuffer> // 键从 number 改为 string
  private currentSegmentStartTime: number = 0
  private clips: Map<string, IClip> // 从 IClip[] 改为 Map<string, IClip>
  private audioSource: AudioSampleSource | null = null

  // 跟踪每个 clip 的最后一次缓冲更新时间戳
  private lastBufferUpdateTimestamp: Map<string, number> = new Map() // 键从 number 改为 string

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
   * 收集音频样本
   * @param frameN 当前帧号
   * @param audioSamples 音频样本数组
   * @param itemId TimelineItem 的 ID（从 clipIndex 改为 itemId）
   */
  async collectAudioSamples(
    audioSamples: AudioSample[],
    itemId: string, // 从 clipIndex: number 改为 itemId: string
  ): Promise<void> {
    const buffer = this.clipBuffers.get(itemId)
    if (!buffer) {
      console.warn(`未找到 item ${itemId} 的缓冲管理器`)
      return
    }

    // 添加样本到缓冲
    for (const sample of audioSamples) {
      buffer.addSample(sample)
    }

    // 更新该 item 的最后缓冲更新时间戳
    if (!buffer.isEmpty()) {
      this.lastBufferUpdateTimestamp.set(itemId, buffer.getLatestTimestamp())
    }

    // 检查是否应该触发渲染
    if (this.shouldRenderSegment()) {
      await this.renderCurrentSegment()
    }
  }

  /**
   * 判断是否应该渲染当前分段
   * @returns 是否应该渲染
   */
  private shouldRenderSegment(): boolean {
    // 获取所有非空的 buffer
    const activeBuffers = Array.from(this.clipBuffers.values()).filter(
      (buffer) => !buffer.isEmpty(),
    )

    if (activeBuffers.length === 0) {
      return false // 没有活跃的 clip，不渲染
    }

    // 检查是否有任何一个 clip 的缓冲时长 >= segmentDuration
    // 这样即使某些 clip 已经结束，只要还有 clip 有足够的缓冲就可以渲染
    return activeBuffers.some((buffer) => buffer.getBufferedDuration() >= this.segmentDuration)
  }

  /**
   * 获取安全的渲染终点
   * 只考虑那些缓冲区仍在增长的 clip（最近有更新的）
   * @returns 安全的渲染终点时间戳
   */
  private getMinBufferedTimestamp(): number {
    const activeBuffers = Array.from(this.clipBuffers.values()).filter(
      (buffer) => !buffer.isEmpty(),
    )

    if (activeBuffers.length === 0) {
      return this.currentSegmentStartTime
    }

    // 只考虑那些缓冲区仍在增长的 clip
    // 如果一个 clip 的 latestTimestamp 没有超过 currentSegmentStartTime + segmentDuration，
    // 说明它可能已经结束或者缓冲不足，不应该限制其他 clip 的渲染
    const growingBuffers = activeBuffers.filter((buffer) => {
      const latest = buffer.getLatestTimestamp()
      return latest > this.currentSegmentStartTime + this.segmentDuration
    })

    if (growingBuffers.length === 0) {
      // 如果没有正在增长的缓冲区，使用所有活跃缓冲区中的最大值
      const timestamps = activeBuffers.map((buffer) => buffer.getLatestTimestamp())
      return Math.max(...timestamps)
    }

    // 使用正在增长的缓冲区中的最小值
    const timestamps = growingBuffers.map((buffer) => buffer.getLatestTimestamp())
    return Math.min(...timestamps)
  }

  /**
   * 渲染当前分段
   * @param forceRender 是否强制渲染（用于最后的剩余样本）
   */
  private async renderCurrentSegment(forceRender: boolean = false): Promise<void> {
    if (!this.audioSource) {
      throw new Error('AudioSource 未设置，请先调用 setAudioSource()')
    }

    try {
      // 1. 计算渲染范围
      const safeEndTime = this.getMinBufferedTimestamp()
      const renderStartTime = this.currentSegmentStartTime
      const renderEndTime = safeEndTime
      const renderDuration = renderEndTime - renderStartTime

      // 如果渲染时长太短且不是强制渲染，跳过
      if (!forceRender && renderDuration < 0.01) {
        return
      }

      // 如果是强制渲染但渲染时长为 0 或负数，直接清空所有缓冲
      if (forceRender && renderDuration <= 0) {
        for (const buffer of this.clipBuffers.values()) {
          buffer.clear()
        }
        return
      }

      // 实际渲染时长包含 overlap
      const actualRenderDuration = renderDuration + this.overlapDuration

      // 2. 创建 OfflineAudioContext
      const offlineContext = new OfflineAudioContext({
        numberOfChannels: this.numberOfChannels,
        length: Math.ceil(actualRenderDuration * this.sampleRate),
        sampleRate: this.sampleRate,
      })

      // 3. 为每个 clip 创建音频源
      for (const [itemId, buffer] of this.clipBuffers.entries()) {
        if (buffer.isEmpty()) {
          continue
        }

        // 获取该 clip 在渲染范围内的样本
        const samples = buffer.getSamplesInRange(
          renderStartTime,
          renderEndTime + this.overlapDuration,
        )

        for (const sample of samples) {
          // 创建音频源节点
          const sourceNode = offlineContext.createBufferSource()
          sourceNode.buffer = sample.toAudioBuffer()

          // 设置播放速率（考虑 clip 的倍速）
          const clip = this.clips.get(itemId) // 从 this.clips[clipIndex] 改为 this.clips.get(itemId)
          if (clip) {
            const playbackRate = clip.getPlaybackRate()
            sourceNode.playbackRate.value = playbackRate
          }

          // 计算在 OfflineAudioContext 中的起始时间
          const contextStartTime = sample.timestamp - renderStartTime

          // 连接到 destination
          sourceNode.connect(offlineContext.destination)

          // 启动播放
          if (contextStartTime >= 0) {
            sourceNode.start(contextStartTime)
          } else {
            // 如果样本开始时间早于渲染起始时间，需要偏移
            const offset = -contextStartTime
            sourceNode.start(0, offset)
          }
        }
      }

      // 4. 开始渲染
      const renderedBuffer = await offlineContext.startRendering()

      // 5. 提取主体部分的音频数据（不含 overlap）
      // 计算主体部分的样本数
      const mainPartSamples = Math.ceil(renderDuration * this.sampleRate)

      // 创建只包含主体部分的 AudioBuffer
      const mainPartBuffer = new AudioBuffer({
        numberOfChannels: this.numberOfChannels,
        length: mainPartSamples,
        sampleRate: this.sampleRate,
      })

      // 复制主体部分的数据
      for (let channel = 0; channel < this.numberOfChannels; channel++) {
        const sourceData = renderedBuffer.getChannelData(channel)
        const targetData = mainPartBuffer.getChannelData(channel)
        targetData.set(sourceData.subarray(0, mainPartSamples))
      }

      // 7. 使用 MediaBunny API 将 AudioBuffer 转换为 AudioSample
      const audioSamples = AudioSample.fromAudioBuffer(
        mainPartBuffer,
        renderStartTime, // 起始时间戳
      )

      // 8. 立即添加到 audioSource 并释放
      for (const sample of audioSamples) {
        await this.audioSource.add(sample)
        sample.close() // 立即释放，避免内存累积
      }

      // 9. 清理已处理的样本并更新起始时间
      // 无论是否强制渲染，都只清理主体部分，保留 overlap
      const clearTimestamp = renderEndTime - this.overlapDuration

      for (const buffer of this.clipBuffers.values()) {
        buffer.clearSamplesBeforeTimestamp(clearTimestamp)
      }

      // 更新下次渲染的起始时间为当前渲染的结束时间（不含 overlap）
      this.currentSegmentStartTime = renderEndTime
    } catch (error) {
      console.error('OfflineAudioContext 渲染失败:', error)

      // 尝试减小分段大小重试
      if (this.segmentDuration > 0.5) {
        this.segmentDuration /= 2
        console.log(`减小分段大小至 ${this.segmentDuration} 秒，重试...`)
        return this.renderCurrentSegment(forceRender)
      }

      // 如果仍然失败，抛出错误
      throw new Error(`音频渲染失败: ${(error as Error).message}`)
    }
  }

  /**
   * 检查所有缓冲是否为空
   * @returns 是否所有缓冲都为空
   */
  private allBuffersEmpty(): boolean {
    return Array.from(this.clipBuffers.values()).every((buffer) => buffer.isEmpty())
  }

  /**
   * 设置 AudioSource（必须在收集样本前调用）
   * @param audioSource 音频源
   */
  setAudioSource(audioSource: AudioSampleSource): void {
    this.audioSource = audioSource
  }

  /**
   * 完成渲染，强制渲染所有剩余样本
   */
  async finalize(): Promise<void> {
    if (!this.audioSource) {
      throw new Error('AudioSource 未设置，请先调用 setAudioSource()')
    }

    // 强制渲染所有剩余样本
    while (!this.allBuffersEmpty()) {
      await this.renderCurrentSegment(true) // forceRender = true
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
