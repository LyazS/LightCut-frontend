import { OffscreenSprite, AudioClip } from '@webav/av-cliper'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import { framesToMicroseconds } from '@/core/utils/timeUtils'
import type { AudioState } from '@/core/visiblesprite/types'

/**
 * 自定义的音频OffscreenSprite类，继承自BaseOffscreenSprite
 * 专门用于处理音频素材，采用直接属性更新模式
 * 类似VideoOffscreenSprite的实现方式，但专注于音频属性控制
 */
export class AudioOffscreenSprite extends OffscreenSprite {
  /**
   * 音频状态
   */
  #audioState: AudioState = {
    volume: 1,
    isMuted: false,
  }

  /**
   * 音频增益（dB）
   */
  #gain: number = 0

  /**
   * 轨道静音状态
   */
  #isTrackMuted: boolean = false

  /**
   * 起始偏移时间（帧数）
   * 类似VideoOffscreenSprite的startOffset，用于在preFrame和render中调整时间
   */
  #startOffset: number = 0

  /**
   * 时间范围信息（帧数版本）
   * 使用UnifiedTimeRange，与VideoOffscreenSprite保持一致
   */
  #timeRange: UnifiedTimeRange = {
    clipStartTime: 0, // 帧数
    clipEndTime: 0, // 帧数
    timelineStartTime: 0, // 帧数
    timelineEndTime: 0, // 帧数
  }

  /**
   * 构造函数
   * @param clip AudioClip实例
   */
  constructor(clip: AudioClip) {
    // 调用父类构造函数
    super(clip)
  }

  /**
   * 覆写render方法，应用startOffset
   * @param ctx 渲染上下文
   * @param time 当前时间（微秒）
   * @returns 音频数据
   */
  public async offscreenRender(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    time: number,
  ): Promise<{ audio: Float32Array[]; done: boolean }> {
    // 将startOffset（帧数）转换为微秒后应用到时间上，传递给父类
    const startOffsetMicroseconds = framesToMicroseconds(this.#startOffset)
    const adjustedTime = time + startOffsetMicroseconds

    // 调用父类的render方法获取音频数据
    const renderResult = await super.offscreenRender(ctx, adjustedTime)

    // 如果有音频数据，根据静音状态、音量和增益调整
    if (renderResult.audio && renderResult.audio.length > 0) {
      // 计算实际音量：轨道静音或片段静音时为0，否则使用当前音量
      const effectiveVolume =
        this.#audioState.isMuted || this.#isTrackMuted ? 0 : this.#audioState.volume

      // 计算增益倍数（dB转线性）
      const gainMultiplier = Math.pow(10, this.#gain / 20)

      // 最终音频倍数
      const finalVolume = effectiveVolume * gainMultiplier

      if (finalVolume !== 1) {
        // 应用音量和增益到所有声道
        for (const channel of renderResult.audio) {
          for (let i = 0; i < channel.length; i++) {
            channel[i] *= finalVolume
          }
        }
      }
    }

    return renderResult
  }

  /**
   * 设置时间范围（与其他OffscreenSprite保持一致的接口）
   * @param timeRange 新的时间范围
   */
  public setTimeRange(timeRange: Partial<UnifiedTimeRange>): void {
    // 更新时间范围属性
    if (timeRange.clipStartTime !== undefined) {
      this.#timeRange.clipStartTime = timeRange.clipStartTime
    }
    if (timeRange.clipEndTime !== undefined) {
      this.#timeRange.clipEndTime = timeRange.clipEndTime
    }
    if (timeRange.timelineStartTime !== undefined) {
      this.#timeRange.timelineStartTime = timeRange.timelineStartTime
    }
    if (timeRange.timelineEndTime !== undefined) {
      this.#timeRange.timelineEndTime = timeRange.timelineEndTime
    }

    // 更新OffscreenSprite的时间
    this.#updateOffscreenSpriteTime()
  }

  // ==================== 音频属性控制接口 ====================

  /**
   * 设置音量
   * @param volume 音量值（0-1之间）
   */
  public setVolume(volume: number): void {
    this.#audioState.volume = Math.max(0, Math.min(1, volume))
    // 音频属性变化会通过拦截器实时生效，无需重建
  }

  /**
   * 设置静音状态
   * @param muted 是否静音
   */
  public setMuted(muted: boolean): void {
    this.#audioState.isMuted = muted
    // 音频属性变化会通过拦截器实时生效，无需重建
  }

  /**
   * 获取当前播放速度
   * @returns 播放速度倍率
   */
  public getPlaybackRate(): number {
    const { clipStartTime, clipEndTime, timelineStartTime, timelineEndTime } = this.#timeRange

    const clipDurationFrames = clipEndTime - clipStartTime // 素材内部要播放的帧数
    const timelineDurationFrames = timelineEndTime - timelineStartTime // 在时间轴上占用的帧数

    if (clipDurationFrames > 0 && timelineDurationFrames > 0) {
      // playbackRate = 素材内部时长 / 时间轴时长
      let playbackRate = clipDurationFrames / timelineDurationFrames

      // 修正浮点数精度问题，避免出现1.00000001这样的值
      // 如果非常接近整数，则四舍五入到最近的0.1
      const rounded = Math.round(playbackRate * 10) / 10
      if (Math.abs(playbackRate - rounded) < 0.001) {
        playbackRate = rounded
      }

      return playbackRate
    }

    return 1 // 默认正常速度
  }

  /**
   * 设置音频增益
   * @param gainDb 增益值（dB，通常在-20到20之间）
   */
  public setGain(gainDb: number): void {
    this.#gain = Math.max(-20, Math.min(20, gainDb))
    // 音频属性变化会通过拦截器实时生效，无需重建
  }

  /**
   * 设置完整的音频状态
   * @param audioState 音频状态对象
   */
  public setAudioState(audioState: Partial<AudioState>): void {
    if (audioState.volume !== undefined) {
      this.#audioState.volume = Math.max(0, Math.min(1, audioState.volume))
    }
    if (audioState.isMuted !== undefined) {
      this.#audioState.isMuted = audioState.isMuted
    }
  }

  /**
   * 设置轨道静音状态
   * @param muted 是否静音
   */
  public setTrackMuted(muted: boolean): void {
    this.#isTrackMuted = muted
  }

  // ==================== 私有方法 ====================

  /**
   * 更新 OffscreenSprite 的 time 属性
   * 根据当前的时间范围设置同步更新父类的时间属性
   * 内部使用帧数计算，设置WebAV时转换为微秒
   */
  #updateOffscreenSpriteTime(): void {
    const { clipStartTime, clipEndTime, timelineStartTime, timelineEndTime } = this.#timeRange

    // 计算时长参数（使用帧数）
    let durationFrames = 0

    const clipDurationFrames = clipEndTime - clipStartTime // 素材内部要播放的帧数
    const timelineDurationFrames = timelineEndTime - timelineStartTime // 在时间轴上占用的帧数

    if (clipDurationFrames > 0 && timelineDurationFrames > 0) {
      // duration 是在时间轴上占用的帧数
      durationFrames = timelineDurationFrames

      // 更新 #startOffset 为素材内部的开始位置（帧数）
      this.#startOffset = clipStartTime
    }

    // 设置 OffscreenSprite.time 属性（转换为微秒给WebAV）
    // offset: 在时间轴上的播放开始位置（微秒）
    // duration: 在时间轴上占用的时长（微秒）
    // playbackRate: 音频播放的速度（通过getPlaybackRate()方法获取）
    this.time = {
      offset: framesToMicroseconds(timelineStartTime),
      duration: framesToMicroseconds(durationFrames),
      playbackRate: this.getPlaybackRate(),
    }
  }

  async clone() {
    return this
  }
}
