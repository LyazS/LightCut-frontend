import {
  Input,
  BlobSource,
  VideoSampleSink,
  AudioSampleSink,
  ALL_FORMATS,
  VideoSample,
  AudioSample,
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
/**
 * 媒体播放器核心类 - 统一管理视频和音频播放状态
 */
export class BunnyClip implements IClip {
  private originalFile: File | null = null
  private input: Input | null = null
  public readonly ready: Promise<void>

  private needResetVideo: boolean = false
  private needResetAudio: boolean = false

  // 视频相关属性
  private videoSink: VideoSampleSink | null = null
  private videoIteratorN: AsyncGenerator<VideoSample | null, void, unknown> | null = null
  private videoInTimeN: bigint = 0n
  private nextFrameN: VideoSample | null = null

  // 音频相关属性
  private audioSink: AudioSampleSink | null = null
  private audioIterator: AsyncGenerator<AudioSample, void, unknown> | null = null
  private audioInTime: number = 0

  // 时间相关
  public timeRange: TimeRange = {
    clipStart: 0n,
    clipEnd: 0n,
    timelineStart: 0n,
    timelineEnd: 0n,
  }
  public previewRate: number = 1.0 // 预览倍速
  public duration: number = 0
  public durationN: bigint = 0n

  constructor(file: File) {
    this.ready = this.loadFile(file)
  }

  /**
   * 加载媒体文件
   * @param file 要加载的文件
   */
  private async loadFile(file: File): Promise<void> {
    console.log('📁 开始加载文件:', file.name)
    this.originalFile = file
    try {
      // 创建 Input 实例
      this.input = new Input({
        source: new BlobSource(file),
        formats: ALL_FORMATS,
      })
      this.duration = await this.input.computeDuration()
      this.durationN = BigInt(Math.ceil(this.duration * RENDERER_FPS))
      this.setTimeRange({
        clipStart: 0n,
        clipEnd: this.durationN,
        timelineStart: 0n,
        timelineEnd: this.durationN,
      })

      // 获取视频和音频轨道
      const videoTrack = await this.input.getPrimaryVideoTrack()
      const audioTrack = await this.input.getPrimaryAudioTrack()

      console.log(
        `📊 找到视频轨道: ${videoTrack ? '是' : '否'}, 音频轨道: ${audioTrack ? '是' : '否'}`,
      )

      // 初始化视频轨道
      if (videoTrack) {
        console.log(`🎬 视频轨道信息:`, {
          codec: videoTrack.codec,
          width: videoTrack.displayWidth,
          height: videoTrack.displayHeight,
          rotation: videoTrack.rotation,
        })

        this.videoSink = new VideoSampleSink(videoTrack)
      }

      // 初始化音频轨道
      if (audioTrack) {
        console.log(`🎵 音频轨道信息:`, {
          codec: audioTrack.codec,
          channels: audioTrack.numberOfChannels,
          sampleRate: audioTrack.sampleRate,
        })

        this.audioSink = new AudioSampleSink(audioTrack)
      }
      console.log(`✅ 文件加载完成，总时长: ${this.duration.toFixed(2)}s`)
    } catch (error) {
      console.error('❌ 文件加载失败:', error)
      throw error
    }
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
    if (!this.videoIteratorN && this.videoSink) {
      this.videoIteratorN = this.videoSink.samplesAtTimestamps(this.generateTimestamps(startN))
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
    if (!this.audioIterator && this.audioSink) {
      this.audioIterator = this.audioSink.samples(startTime)
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

  /**
   * 对AudioSample应用播放速率变化
   * @param buf 原始AudioSample
   * @param rate 播放速率
   * @param clipStart clip起始帧数
   * @returns 处理后的AudioSample数组
   */
  private applyPlaybackRateToAudioSample(
    buf: AudioSample,
    rate: number,
    clipStart: number,
  ): AudioSample[] {
    const channels = buf.numberOfChannels
    const sourceSampleRate = buf.sampleRate
    const targetSampleRate = AUDIO_DEFAULT_SAMPLE_RATE // 48000Hz
    const frameCount = buf.numberOfFrames

    // 为每个声道应用重采样（同时处理倍速和采样率转换）
    const resampledChannels: Float32Array[] = []
    for (let ch = 0; ch < channels; ch++) {
      // 提取单声道数据
      const channelData = new Float32Array(frameCount)
      buf.copyTo(channelData, {
        planeIndex: ch,
        format: 'f32-planar',
      })

      // ✨ 一次性完成倍速和采样率转换
      const resampled = this.resampleWithRateAndSpeed(
        channelData,
        sourceSampleRate,
        targetSampleRate,
        rate,
      )
      resampledChannels.push(resampled)
    }

    // 计算新的时间戳（倍速影响）
    const newTimestamp =
      (buf.timestamp - clipStart / RENDERER_FPS) / rate +
      Number(this.timeRange.timelineStart) / RENDERER_FPS

    // 创建AudioBuffer，使用目标采样率
    const audioBuffer = new AudioBuffer({
      length: resampledChannels[0]?.length ?? 0,
      numberOfChannels: channels,
      sampleRate: targetSampleRate, // ✅ 使用48000Hz
    })

    // 复制重采样后的数据
    for (let ch = 0; ch < channels; ch++) {
      const channelData = resampledChannels[ch]
      if (channelData) {
        const buffer = audioBuffer.getChannelData(ch)
        buffer.set(channelData)
      }
    }

    // 创建AudioSample数组
    const newSamples = AudioSample.fromAudioBuffer(audioBuffer, newTimestamp)

    return newSamples
  }

  /**
   * 同时处理倍速和采样率转换的重采样
   * @param pcmData 原始PCM数据
   * @param sourceSampleRate 原始采样率
   * @param targetSampleRate 目标采样率（48000Hz）
   * @param playbackRate 播放速率
   * @returns 重采样后的PCM数据
   */
  private resampleWithRateAndSpeed(
    pcmData: Float32Array,
    sourceSampleRate: number,
    targetSampleRate: number,
    playbackRate: number,
  ): Float32Array {
    // 参数验证
    if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
      throw new Error('采样率必须大于0')
    }
    if (playbackRate <= 0) {
      throw new Error('播放速率必须大于0')
    }
    if (pcmData.length === 0) {
      return new Float32Array(0)
    }

    // 计算综合重采样比率
    const resampleRatio = (sourceSampleRate / targetSampleRate) * playbackRate

    // 计算输出样本数
    const outputLength = Math.floor(pcmData.length / resampleRatio)
    const output = new Float32Array(outputLength)

    // 线性插值重采样
    for (let i = 0; i < outputLength; i++) {
      // 在原始数据中的位置
      const sourceIndex = i * resampleRatio
      const intIndex = Math.floor(sourceIndex)
      const frac = sourceIndex - intIndex

      // 边界检查和插值
      if (intIndex + 1 < pcmData.length) {
        const sample1 = pcmData[intIndex]!
        const sample2 = pcmData[intIndex + 1]!
        output[i] = sample1 * (1 - frac) + sample2 * frac
      } else if (intIndex < pcmData.length) {
        output[i] = pcmData[intIndex]!
      }
    }

    return output
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

  tickInterceptor: <T>(time: number | bigint, result: T) => Promise<T> =
    async (_, result) => result

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
      this.audioSink ? this.findAudioBuffersN(timeN) : [],
      this.videoSink ? this.findVideoFrameN(timeN) : null,
    ])
    return await this.tickInterceptor(timeN, { audio, video, state: 'success' })
  }

  async clone(): Promise<IClip> {
    if (!this.originalFile) {
      throw new Error('❌ 无法克隆 BunnyClip：原始文件不存在')
    }
    const newClip = new BunnyClip(this.originalFile)
    return newClip
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
    this.videoSink = null

    // 清理音频相关资源
    await this.cleanupAudioIterator() // 等待音频迭代器清理完成
    this.audioSink = null

    // 清理 Input
    this.input?.dispose()
    this.input = null

    console.log('✅ BunnyClip 资源清理完成')
  }
}
