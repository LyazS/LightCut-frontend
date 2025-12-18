import { ImgClip } from '@webav/av-cliper'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import { framesToMicroseconds } from '@/core/utils/timeUtils'
import { BaseVisibleSprite } from '@/core/visiblesprite/BaseVisibleSprite'

/**
 * 自定义的图片VisibleSprite类，继承自BaseVisibleSprite
 * 专门用于处理图片素材，不包含视频特有的倍速功能
 */
export class ImageVisibleSprite extends BaseVisibleSprite {
  /**
   * 时间范围信息（帧数版本）
   * 对于图片，clipStartTime 和 clipEndTime 都设置为 -1，不使用
   * 所有时间计算都基于 timelineStartTime 和 timelineEndTime
   */
  #timeRange: UnifiedTimeRange = {
    timelineStartTime: 0, // 帧数
    timelineEndTime: 150, // 默认150帧（5秒@30fps）
    clipStartTime: -1, // 图片不使用此属性
    clipEndTime: -1, // 图片不使用此属性
  }

  /**
   * 默认显示时长（帧数） - 150帧（5秒@30fps）
   */
  public static readonly DEFAULT_DURATION = 150

  /**
   * 构造函数
   * @param clip ImgClip实例
   */
  constructor(clip: ImgClip) {
    // 调用父类构造函数
    super(clip)

    // 初始化时间设置
    this.#updateVisibleSpriteTime()
  }

  // ==================== 时间轴接口 ====================

  /**
   * 设置在时间轴上的开始时间（图片在整个项目时间轴上的位置）
   * @param startTime 时间轴开始时间（帧数）
   */
  public setTimelineStartTime(startTime: number): void {
    this.#timeRange.timelineStartTime = Math.round(startTime)
    this.#updateVisibleSpriteTime()
  }

  /**
   * 设置在时间轴上的结束时间
   * @param endTime 时间轴结束时间（帧数）
   */
  public setTimelineEndTime(endTime: number): void {
    this.#timeRange.timelineEndTime = Math.round(endTime)
    this.#updateVisibleSpriteTime()
  }

  /**
   * 获取在时间轴上的开始时间
   * @returns 时间轴开始时间（帧数）
   */
  public getTimelineStartTime(): number {
    return this.#timeRange.timelineStartTime
  }

  /**
   * 获取在时间轴上的结束时间
   * @returns 时间轴结束时间（帧数）
   */
  public getTimelineEndTime(): number {
    return this.#timeRange.timelineEndTime
  }

  /**
   * 同时设置时间轴的时间范围
   * @param options 时间范围配置
   */
  public setTimeRange(options: {
    timelineStartTime?: number
    timelineEndTime?: number
    clipStartTime?: number
    clipEndTime?: number
  }): void {
    if (options.timelineStartTime !== undefined) {
      this.#timeRange.timelineStartTime = Math.round(options.timelineStartTime)
    }
    if (options.timelineEndTime !== undefined) {
      this.#timeRange.timelineEndTime = Math.round(options.timelineEndTime)
    }
    // 对于图片，忽略 clipStartTime 和 clipEndTime 参数，保持为 -1

    this.#updateVisibleSpriteTime()
  }

  /**
   * 获取完整的时间范围信息
   * @returns 时间范围信息
   */
  public getTimeRange(): UnifiedTimeRange {
    return { ...this.#timeRange }
  }

  /**
   * 重置时间范围到默认状态
   */
  public resetTimeRange(): void {
    this.#timeRange = {
      timelineStartTime: 0,
      timelineEndTime: ImageVisibleSprite.DEFAULT_DURATION,
      clipStartTime: -1,
      clipEndTime: -1,
    }
    this.#updateVisibleSpriteTime()
  }

  /**
   * 检查时间范围是否有效
   * @returns 是否有效
   */
  public isTimeRangeValid(): boolean {
    const { timelineStartTime, timelineEndTime, clipStartTime, clipEndTime } = this.#timeRange

    // 检查时间轴时间范围是否有效
    if (timelineStartTime < 0 || timelineEndTime < 0) return false
    if (timelineStartTime >= timelineEndTime) return false

    // 对于图片，clipStartTime 和 clipEndTime 应该都是 -1
    if (clipStartTime !== -1 || clipEndTime !== -1) return false

    return true
  }

  /**
   * 获取图片的原始尺寸信息
   * @returns 图片尺寸信息
   */
  public async getImageMeta(): Promise<{ width: number; height: number }> {
    const clip = this.getClip() as ImgClip
    if (clip && 'meta' in clip) {
      const meta = clip.meta
      return {
        width: meta.width,
        height: meta.height,
      }
    }
    return { width: -1, height: -1 }
  }

  // ==================== 私有方法 ====================

  /**
   * 更新 VisibleSprite 的 time 属性
   * 根据当前的时间范围设置同步更新父类的时间属性
   * 内部使用帧数计算，设置WebAV时转换为微秒
   */
  #updateVisibleSpriteTime(): void {
    const { timelineStartTime, timelineEndTime } = this.#timeRange
    const timelineDuration = timelineEndTime - timelineStartTime

    // 设置 VisibleSprite.time 属性（转换为微秒给WebAV）
    // offset: 在时间轴上的播放开始位置（微秒）
    // duration: 在时间轴上占用的时长（微秒）
    // 图片不需要playbackRate，保持默认值1.0
    this.time = {
      offset: framesToMicroseconds(timelineStartTime),
      duration: framesToMicroseconds(timelineDuration),
      playbackRate: 1.0, // 图片固定为1.0，没有倍速概念
    }
  }
}
