import { OffscreenSprite, ImgClip } from '@webav/av-cliper'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import { framesToMicroseconds } from '@/core/utils/timeUtils'

/**
 * 自定义的图片OffscreenSprite类，继承自BaseOffscreenSprite
 * 专门用于处理图片素材，不包含视频特有的倍速功能
 */
export class ImageOffscreenSprite extends OffscreenSprite {
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
    this.#updateOffscreenSpriteTime()
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

    this.#updateOffscreenSpriteTime()
  }

  // ==================== 私有方法 ====================

  /**
   * 更新 OffscreenSprite 的 time 属性
   * 根据当前的时间范围设置同步更新父类的时间属性
   * 内部使用帧数计算，设置WebAV时转换为微秒
   */
  #updateOffscreenSpriteTime(): void {
    const { timelineStartTime, timelineEndTime } = this.#timeRange
    const timelineDuration = timelineEndTime - timelineStartTime

    // 设置 OffscreenSprite.time 属性（转换为微秒给WebAV）
    // offset: 在时间轴上的播放开始位置（微秒）
    // duration: 在时间轴上占用的时长（微秒）
    // 图片不需要playbackRate，保持默认值1.0
    this.time = {
      offset: framesToMicroseconds(timelineStartTime),
      duration: framesToMicroseconds(timelineDuration),
      playbackRate: 1.0, // 图片固定为1.0，没有倍速概念
    }
  }

  async clone() {
    return this
  }
}
