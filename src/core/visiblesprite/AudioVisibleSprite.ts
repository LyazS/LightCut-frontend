import { AudioClip } from '@webav/av-cliper'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import { framesToMicroseconds } from '@/core/utils/timeUtils'
import { BaseVisibleSprite } from '@/core/visiblesprite/BaseVisibleSprite'
import type { AudioState } from '@/core/visiblesprite/types'

/**
 * 自定义的音频VisibleSprite类，继承自BaseVisibleSprite
 * 专门用于处理音频素材，采用直接属性更新模式
 * 类似VideoVisibleSprite的实现方式，但专注于音频属性控制
 */
export class AudioVisibleSprite extends BaseVisibleSprite {
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
   * 类似VideoVisibleSprite的startOffset，用于在preFrame和render中调整时间
   */
  #startOffset: number = 0

  /**
   * 时间范围信息（帧数版本）
   * 使用UnifiedTimeRange，与VideoVisibleSprite保持一致
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
   * 覆写preFrame方法，应用startOffset
   * @param time 当前时间（微秒）
   */
  public async preFrame(time: number): Promise<void> {
    // 将startOffset（帧数）转换为微秒后应用到时间上，传递给父类
    const startOffsetMicroseconds = framesToMicroseconds(this.#startOffset)
    const adjustedTime = time + startOffsetMicroseconds
    return super.preFrame(adjustedTime)
  }

  /**
   * 覆写render方法，应用startOffset
   * @param ctx 渲染上下文
   * @param time 当前时间（微秒）
   * @returns 音频数据
   */
  public render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    time: number,
  ): { audio: Float32Array[] } {
    // 将startOffset（帧数）转换为微秒后应用到时间上，传递给父类
    const startOffsetMicroseconds = framesToMicroseconds(this.#startOffset)
    const adjustedTime = time + startOffsetMicroseconds

    // 调用父类的render方法获取音频数据
    const renderResult = super.render(ctx, adjustedTime)

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

  // ==================== 时间轴接口 ====================

  /**
   * 设置素材内部的开始时间（从素材的哪个时间点开始播放）
   * @param startTime 开始时间（帧数）
   */
  public setClipStartTime(startTime: number): void {
    this.#timeRange.clipStartTime = startTime
    this.#updateVisibleSpriteTime()
  }

  /**
   * 设置素材内部的结束时间（播放到素材的哪个时间点结束）
   * @param endTime 结束时间（帧数）
   */
  public setClipEndTime(endTime: number): void {
    this.#timeRange.clipEndTime = endTime
    this.#updateVisibleSpriteTime()
  }

  /**
   * 设置在时间轴上的开始时间
   * @param startTime 开始时间（帧数）
   */
  public setTimelineStartTime(startTime: number): void {
    this.#timeRange.timelineStartTime = startTime
    this.#updateVisibleSpriteTime()
  }

  /**
   * 设置在时间轴上的结束时间
   * @param endTime 结束时间（帧数）
   */
  public setTimelineEndTime(endTime: number): void {
    this.#timeRange.timelineEndTime = endTime
    this.#updateVisibleSpriteTime()
  }

  /**
   * 设置显示时长（在时间轴上占用的时长）
   * @param duration 时长（帧数）
   */
  public setDisplayDuration(duration: number): void {
    this.#timeRange.timelineEndTime = this.#timeRange.timelineStartTime + duration
    this.#updateVisibleSpriteTime()
  }

  /**
   * 获取当前时间范围
   * @returns 时间范围对象
   */
  public getTimeRange(): UnifiedTimeRange {
    return { ...this.#timeRange }
  }

  /**
   * 设置时间范围（与其他VisibleSprite保持一致的接口）
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

    // 更新VisibleSprite的时间
    this.#updateVisibleSpriteTime()
  }

  /**
   * 重置时间范围到默认状态
   */
  public resetTimeRange(): void {
    this.#timeRange = {
      clipStartTime: 0,
      clipEndTime: 0,
      timelineStartTime: 0,
      timelineEndTime: 0,
    }
    this.#updateVisibleSpriteTime()
  }

  /**
   * 检查时间范围是否有效
   * @returns 是否有效
   */
  public isTimeRangeValid(): boolean {
    const { clipStartTime, clipEndTime, timelineStartTime, timelineEndTime } = this.#timeRange

    // 检查素材内部时间范围是否有效
    if (clipStartTime < 0 || clipEndTime < 0) return false
    if (clipStartTime >= clipEndTime) return false

    // 检查时间轴时间范围是否有效
    if (timelineStartTime < 0 || timelineEndTime < 0) return false
    if (timelineStartTime >= timelineEndTime) return false

    return true
  }

  /**
   * 获取原始素材的完整时长（不受任何设置影响）
   * @returns 原始素材时长（微秒）
   */
  public async getOriginalClipDuration(): Promise<number> {
    const clip = this.getClip()
    if (clip && 'meta' in clip) {
      const meta = clip.meta
      return meta.duration
    }
    return 0
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
   * 设置播放速度
   * @param speed 播放速度倍率（1.0为正常速度，2.0为2倍速，0.5为0.5倍速）
   */
  public setPlaybackRate(speed: number): void {
    if (speed <= 0) {
      throw new Error('播放速度必须大于0')
    }

    const { clipStartTime, clipEndTime, timelineStartTime } = this.#timeRange
    const clipDuration = clipEndTime - clipStartTime

    if (clipDuration > 0) {
      // 根据新的播放速度计算时间轴结束时间
      // 时间轴时长 = 素材时长 / 播放速度
      const newTimelineDuration = clipDuration / speed

      // 🔧 确保时间轴结束时间是整数帧数（避免小数点时长显示）
      const newTimelineEndTime = timelineStartTime + Math.round(newTimelineDuration)

      // 通过设置时间范围来实现播放速度调整
      // playbackRate 会在 #updateVisibleSpriteTime() 中根据时间范围自动计算
      this.#timeRange.timelineEndTime = newTimelineEndTime
      this.#updateVisibleSpriteTime()
    }
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
   * 获取音频增益
   * @returns 增益值（dB）
   */
  public getGain(): number {
    return this.#gain
  }

  /**
   * 获取当前音频状态
   * @returns 音频状态对象
   */
  public getAudioState(): AudioState {
    return { ...this.#audioState }
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

  /**
   * 检查是否因轨道静音而被静音
   * @returns 是否因轨道静音而被静音
   */
  public isTrackMuted(): boolean {
    return this.#isTrackMuted
  }

  /**
   * 检查是否被静音（包括片段静音和轨道静音）
   * @returns 是否被静音
   */
  public isEffectivelyMuted(): boolean {
    return this.#audioState.isMuted || this.#isTrackMuted
  }

  // ==================== 私有方法 ====================

  /**
   * 更新 VisibleSprite 的 time 属性
   * 根据当前的时间范围设置同步更新父类的时间属性
   * 内部使用帧数计算，设置WebAV时转换为微秒
   */
  #updateVisibleSpriteTime(): void {
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

    // 设置 VisibleSprite.time 属性（转换为微秒给WebAV）
    // offset: 在时间轴上的播放开始位置（微秒）
    // duration: 在时间轴上占用的时长（微秒）
    // playbackRate: 音频播放的速度（通过getPlaybackRate()方法获取）
    this.time = {
      offset: framesToMicroseconds(timelineStartTime),
      duration: framesToMicroseconds(durationFrames),
      playbackRate: this.getPlaybackRate(),
    }
  }
}
