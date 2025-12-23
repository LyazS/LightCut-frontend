import {
  VideoSampleSink,
  AudioSampleSink,
  VideoSample,
  AudioSample,
  type AnyIterable,
} from 'mediabunny'
import {
  RENDERER_FPS,
  VIDEO_SEEK_THRESHOLD,
  VIDEO_SEEK_THRESHOLD_N,
  AUDIO_SCHEDULE_AHEAD,
  AUDIO_SCHEDULE_AHEAD_N,
  AUDIO_ANOMALY_THRESHOLD,
  AUDIO_ANOMALY_THRESHOLD_N,
  AUDIO_DEFAULT_SAMPLE_RATE,
} from './constant'
import type { TimeRange } from './types'
import type { IClip } from './IClip'
import { BunnyMedia } from './bunny-media'
/**
 * 媒体播放器核心类 - 统一管理视频和音频播放状态
 */
export class BunnyClip implements IClip {
  private needResetVideo: boolean = false
  private needResetAudio: boolean = false

  // 视频相关属性
  private videoSampleAtTSFunc:
    | ((timestamps: AnyIterable<number>) => AsyncGenerator<VideoSample | null, void, unknown>)
    | null = null
  private videoGetSampleFunc: ((timestamps: number) => Promise<VideoSample | null>) | null = null
  private videoIteratorN: AsyncGenerator<VideoSample | null, void, unknown> | null = null
  private videoInTimeN: bigint = 0n
  private nextFrameN: VideoSample | null = null

  // 音频相关属性
  private audioSampleFunc:
    | ((
        startTimestamp?: number | undefined,
        endTimestamp?: number | undefined,
      ) => AsyncGenerator<AudioSample, void, unknown>)
    | null = null
  private audioIterator: AsyncGenerator<AudioSample, void, unknown> | null = null
  private audioInTime: number = 0

  // 公开属性
  public timeRange: TimeRange = {
    clipStart: 0n,
    clipEnd: 0n,
    timelineStart: 0n,
    timelineEnd: 0n,
  }
  public previewRate: number = 1.0 // 预览倍速
  public duration: number = 0
  public durationN: bigint = 0n

  constructor(bunnyMedia: BunnyMedia) {
    this.duration = bunnyMedia.duration
    this.durationN = bunnyMedia.durationN
    this.videoSampleAtTSFunc = bunnyMedia.videoSamplesAtTimestamps()
    this.videoGetSampleFunc = bunnyMedia.videoGetSample()
    this.audioSampleFunc = bunnyMedia.audioSamplesFunc()
    this.setTimeRange({
      clipStart: 0n,
      clipEnd: this.durationN,
      timelineStart: 0n,
      timelineEnd: this.durationN,
    })
  }

  // ==================== 视频相关方法 ====================

  *generateTimestamps(startN: bigint): Generator<number> {
    const clipDuration = Number(this.timeRange.clipEnd - this.timeRange.clipStart)
    const tlDuration = Number(this.timeRange.timelineEnd - this.timeRange.timelineStart)
    const clipStart = Number(this.timeRange.clipStart)
    for (let tlN = startN; tlN <= this.timeRange.timelineEnd; tlN++) {
      // 在clip上的小数帧位置
      const clipTimeN =
        (Number(tlN - this.timeRange.timelineStart) / tlDuration) * clipDuration + clipStart
      const time = clipTimeN / RENDERER_FPS
      yield time
    }
  }

  private async ensureVideoIteratorN(startN: bigint): Promise<void> {
    if (!this.videoIteratorN && this.videoSampleAtTSFunc) {
      this.videoIteratorN = this.videoSampleAtTSFunc(this.generateTimestamps(startN))
      this.nextFrameN = (await this.videoIteratorN.next()).value ?? null
      this.videoInTimeN = startN
      console.log(`📌 [视频] 创建迭代器，起始时间: ${startN}帧`)
    }
  }

  /**
   * 获取当前视频帧 - 使用 shift + 递归策略自动清理过期帧
   * @param timeN 当前播放时间
   * @returns 当前帧或null
   */
  private async findVideoFrameN(timeN: bigint): Promise<VideoSample | null> {
    // 超出时间范围直接返回 null，这样可以确保在范围之内
    if (timeN < this.timeRange.timelineStart || timeN > this.timeRange.timelineEnd) {
      return null
    }
    if (
      this.needResetVideo ||
      !this.videoIteratorN ||
      timeN < this.videoInTimeN || // 如果是往回seek
      timeN - this.videoInTimeN > VIDEO_SEEK_THRESHOLD_N // 如果往前seek太远
    ) {
      console.log(`⏰ [视频] 时间检查 - 当前: ${timeN}帧, 上次: ${this.videoInTimeN}帧`)
      await this.resetVideoN(timeN)
    }

    if (!this.videoIteratorN) return null

    while (true) {
      // 1. 检查 nextFrameN 是否存在
      if (!this.nextFrameN) {
        // 从迭代器获取新帧
        this.nextFrameN = (await this.videoIteratorN.next()).value ?? null
        this.videoInTimeN = this.videoInTimeN + 1n
      }

      // 情况1：帧在时间点之前（过期）
      if (this.videoInTimeN < timeN) {
        this.nextFrameN?.close() // 释放过期帧
        this.nextFrameN = null // 清空缓存，下次循环会解码新帧
        continue // 继续下一个循环
      }

      // 情况2：帧在时间点之内（匹配）
      if (this.videoInTimeN === timeN) {
        const clone_frame = this.nextFrameN?.clone() ?? null
        this.nextFrameN?.close() // 释放原帧
        this.nextFrameN = null // 清空缓存，帧的所有权转移给调用者
        return clone_frame
      }

      // 情况3：帧在时间点之后（未来帧）
      // nextFrameN 保持不变，跳出循环，等待下一次调用
      return null
    }
  }

  private async resetVideoN(startN: bigint): Promise<void> {
    console.log(`⏩ 视频 Seek 到`)

    // 清理缓存的下一帧
    this.nextFrameN?.close()
    this.nextFrameN = null

    // 清理旧迭代器并创建新的
    await this.cleanupVideoIteratorN()
    await this.ensureVideoIteratorN(startN)
    this.needResetVideo = false
  }

  private async cleanupVideoIteratorN(): Promise<void> {
    await this.videoIteratorN?.return()
    this.videoIteratorN = null
  }

  // ==================== 音频相关方法 ====================

  /**
   * 确保音频迭代器存在 - 延迟初始化策略
   * @param startTime 迭代器起始时间，默认从0开始
   */
  private async ensureAudioIterator(startTime: number = 0): Promise<void> {
    if (!this.audioIterator && this.audioSampleFunc) {
      this.audioIterator = this.audioSampleFunc(startTime)
      console.log(`📌 [音频] 创建迭代器，起始时间: ${startTime.toFixed(2)}s`)
    }
  }

  private async findAudioBuffersN(timeN: bigint): Promise<AudioSample[]> {
    // 超出时间范围直接返回 null，这样可以确保在范围之内
    if (timeN < this.timeRange.timelineStart || timeN > this.timeRange.timelineEnd) {
      return []
    }
    // 将时间轴时间映射回 clip 时间（原始媒体时间）
    const clipDuration = Number(this.timeRange.clipEnd - this.timeRange.clipStart)
    const tlDuration = Number(this.timeRange.timelineEnd - this.timeRange.timelineStart)
    const clipStart = Number(this.timeRange.clipStart)
    const clipTimeN =
      (Number(timeN + AUDIO_SCHEDULE_AHEAD_N - this.timeRange.timelineStart) / tlDuration) *
        clipDuration +
      clipStart
    const anomaly_th = (Number(AUDIO_ANOMALY_THRESHOLD_N) / tlDuration) * clipDuration
    // timeN是时间轴上的帧点
    // 这是映射到clip上的时间点
    const currentTime = clipTimeN / RENDERER_FPS
    // ✨ 检测时间异常：倒退或跳跃超过阈值
    // 音频对时间连续性要求极高，超过阈值就需要重新 seek
    if (
      this.needResetAudio ||
      !this.audioIterator ||
      currentTime < this.audioInTime ||
      currentTime - this.audioInTime > anomaly_th
    ) {
      console.log(
        `⏰ [音频] 时间检查 - 当前: ${currentTime.toFixed(2)}s, 上次: ${this.audioInTime.toFixed(2)}s`,
      )
      await this.resetAudio(currentTime)
    }

    this.audioInTime = currentTime
    if (!this.audioIterator) return []
    const result: AudioSample[] = []
    while (1) {
      const result_buffer = await this.audioIterator.next()
      if (result_buffer.done || !result_buffer.value) {
        break
      }
      const audioBuffer = result_buffer.value
      result.push(audioBuffer)
      if (audioBuffer.timestamp + audioBuffer.duration >= currentTime) {
        break
      }
    }
    const rate = this.getPlaybackRate()
    const processedBuffers: AudioSample[] = []

    for (const buf of result) {
      buf.setTimestamp(
        (buf.timestamp - clipStart / RENDERER_FPS) / rate +
          Number(this.timeRange.timelineStart) / RENDERER_FPS,
      )
      processedBuffers.push(buf)
    }

    return processedBuffers
  }

  /**
   * Seek 音频到指定时间 - 清理并重建迭代器
   * @param timestamp 目标时间戳
   */
  private async resetAudio(timestamp: number): Promise<void> {
    console.log(`⏩ 音频 Seek 到: ${timestamp.toFixed(2)}s`)

    // 清理旧迭代器并创建新的
    await this.cleanupAudioIterator()
    await this.ensureAudioIterator(timestamp)
    this.needResetAudio = false
  }

  /**
   * 清理音频迭代器
   */
  private async cleanupAudioIterator(): Promise<void> {
    await this.audioIterator?.return()
    this.audioIterator = null
  }

  // ==================== 公共接口 ====================
  setTimeRange(timeRange: {
    clipStart?: bigint
    clipEnd?: bigint
    timelineStart?: bigint
    timelineEnd?: bigint
  }): void {
    // 计算新的时间范围值
    const newClipStart = timeRange.clipStart ?? this.timeRange.clipStart
    const newClipEnd = timeRange.clipEnd ?? this.timeRange.clipEnd
    const newTimelineStart = timeRange.timelineStart ?? this.timeRange.timelineStart
    const newTimelineEnd = timeRange.timelineEnd ?? this.timeRange.timelineEnd

    // 验证 clipStart 必须大于等于 0
    if (newClipStart < 0n) {
      throw new Error(`clipStart 必须大于等于 0，当前值: ${newClipStart}`)
    }

    // 验证 clipEnd 必须小于等于 durationN
    if (newClipEnd > this.durationN) {
      throw new Error(`clipEnd 必须小于等于 ${this.durationN}，当前值: ${newClipEnd}`)
    }

    // 验证 clipEnd 必须大于等于 clipStart
    if (newClipEnd < newClipStart) {
      throw new Error(`clipEnd (${newClipEnd}) 必须大于等于 clipStart (${newClipStart})`)
    }

    // 验证 timelineEnd 必须大于等于 timelineStart
    if (newTimelineEnd < newTimelineStart) {
      throw new Error(
        `timelineEnd (${newTimelineEnd}) 必须大于等于 timelineStart (${newTimelineStart})`,
      )
    }

    // 所有验证通过，更新时间范围
    this.timeRange = {
      clipStart: newClipStart,
      clipEnd: newClipEnd,
      timelineStart: newTimelineStart,
      timelineEnd: newTimelineEnd,
    }
    this.needResetVideo = true
    this.needResetAudio = true
  }

  getPlaybackRate(): number {
    const rate =
      Number(this.timeRange.clipEnd - this.timeRange.clipStart) /
      Number(this.timeRange.timelineEnd - this.timeRange.timelineStart)
    return rate
  }
  async setPreviewRate(rate: number): Promise<void> {
    this.previewRate = rate
  }

  tickInterceptor: <T>(time: number | bigint, result: T) => Promise<T> = async (_, result) => result

  /**
   * 播放时获取指定时间点的音视频帧
   * @param timeN 时间轴上的帧位置
   * @returns 包含音频样本数组、视频帧和状态
   */
  async tickN(
    timeN: bigint,
  ): Promise<{ audio: AudioSample[]; video: VideoSample | null; state: 'success' | 'outofrange' }> {
    if (timeN < this.timeRange.timelineStart || this.timeRange.timelineEnd < timeN) {
      return this.tickInterceptor(timeN, {
        audio: [],
        video: null,
        state: 'outofrange',
      })
    }
    const [audio, video] = await Promise.all([
      this.audioSampleFunc ? this.findAudioBuffersN(timeN) : [],
      this.videoSampleAtTSFunc ? this.findVideoFrameN(timeN) : null,
    ])
    return await this.tickInterceptor(timeN, { audio, video, state: 'success' })
  }

  /**
   * 获取指定时间点的视频帧（仅视频，不含音频）
   * @param clipTimeN Clip上的帧位置
   * @returns 包含视频帧和状态，音频数组始终为空
   */
  async getSampleN(
    clipTimeN: bigint,
  ): Promise<{ audio: AudioSample[]; video: VideoSample | null; state: 'success' | 'outofrange' }> {
    if (clipTimeN < 0n || this.durationN < clipTimeN) {
      return this.tickInterceptor(clipTimeN, {
        audio: [],
        video: null,
        state: 'outofrange',
      })
    }
    const video = (await this.videoGetSampleFunc?.(Number(clipTimeN) / RENDERER_FPS)) ?? null
    return await this.tickInterceptor(clipTimeN, { audio: [], video, state: 'success' })
  }

  /**
   * 批量生成缩略图的异步迭代器，用于时间轴缩略图显示
   * @param clipTimeNs 时间点数组（帧位置）
   * @yields 每次返回 { frame: VideoFrame | null, state: boolean }
   */
  async *thumbnailIter(
    clipTimeNs: bigint[],
  ): AsyncGenerator<{ frame: VideoFrame | null; state: boolean }, void, unknown> {
    if (this.videoSampleAtTSFunc) {
      const timeIter = clipTimeNs.map((n) => Number(n) / RENDERER_FPS)[Symbol.iterator]()
      for await (const sample of this.videoSampleAtTSFunc(timeIter)) {
        const frame = sample?.toVideoFrame() ?? null
        sample?.close()
        yield { frame, state: true }
      }
    } else {
      yield { frame: null, state: false }
    }
  }

  /**
   * 释放所有资源
   */
  async dispose(): Promise<void> {
    console.log('🧹 清理 BunnyClip 资源')

    // 清理视频相关资源
    this.nextFrameN?.close() // 释放缓存的视频帧
    this.nextFrameN = null
    await this.cleanupVideoIteratorN() // 清理视频迭代器

    // 清理音频相关资源
    await this.cleanupAudioIterator() // 等待音频迭代器清理完成

    console.log('✅ BunnyClip 资源清理完成')
  }
}
