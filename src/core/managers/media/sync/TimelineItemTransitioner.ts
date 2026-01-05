/**
 * 时间轴项目状态转换器
 * 负责将时间轴项目从 loading 状态转换为 ready 状态
 *
 * 职责：
 * - 更新时间轴项目尺寸
 * - 创建和配置 Sprite
 * - 应用动画配置
 * - 设置轨道属性
 * - 初始化双向同步
 */

import type { MediaType, UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { TransitionOptions } from './types'
import { UnifiedMediaItemQueries } from '@/core/mediaitem'
import { TimelineItemFactory, TimelineItemQueries } from '@/core/timelineitem'
import { useUnifiedStore } from '@/core/unifiedStore'
import { setupTimelineItemBunny } from '@/core/bunnyUtils/timelineItemSetup'
/**
 * 时间轴项目状态转换器（增强版 - 支持文本类型）
 */
export class TimelineItemTransitioner {
  constructor(
    private timelineItemId: string,
    private mediaItem?: UnifiedMediaItemData, // 文本类型时为 undefined
  ) {}

  /**
   * 转换时间轴项目为 ready 状态（支持文本类型）
   */
  async transitionToReady(options: TransitionOptions): Promise<void> {
    try {
      const { scenario, commandId, description } = options
      console.log(`🎨 [TimelineItemTransitioner] 开始转换时间轴项目状态: ${this.timelineItemId}`, {
        scenario,
        commandId,
        mediaType: this.mediaItem?.mediaType || 'text',
      })

      const store = useUnifiedStore()
      const timelineItem = store.getTimelineItem(this.timelineItemId)

      if (!timelineItem) {
        console.log(
          `⚠️ [TimelineItemTransitioner] 找不到时间轴项目: ${this.timelineItemId}，跳过状态转换`,
        )
        return
      }

      if (timelineItem.timelineStatus !== 'loading') {
        console.log(
          `⏭️ [TimelineItemTransitioner] 跳过状态转换，时间轴项目状态不是loading: ${this.timelineItemId}`,
          {
            currentStatus: timelineItem.timelineStatus,
            scenario,
            commandId,
          },
        )
        return
      }

      // 检查是否为文本类型
      if (TimelineItemQueries.isTextTimelineItem(timelineItem)) {
        await this.transitionTextTimelineItem(timelineItem, options)
      } else {
        await this.transitionMediaTimelineItem(
          timelineItem as UnifiedTimelineItemData<Exclude<MediaType, 'text'>>,
          options,
        )
      }

      // 通用的后续处理
      timelineItem.timelineStatus = 'ready'

      console.log(`🎉 [TimelineItemTransitioner] 时间轴项目状态转换完成: ${this.timelineItemId}`)
    } catch (error) {
      console.error(
        `❌ [TimelineItemTransitioner] 转换时间轴项目状态失败: ${this.timelineItemId}`,
        error,
      )
      throw error
    }
  }

  /**
   * 处理文本类型的状态转换
   */
  private async transitionTextTimelineItem(
    timelineItem: UnifiedTimelineItemData<'text'>,
    options: TransitionOptions,
  ): Promise<void> {
    console.log(`🎨 [TimelineItemTransitioner] 转换文本时间轴项目: ${timelineItem.id}`)

    // 使用 setupTimelineItemBunny 创建 textBitmap
    await setupTimelineItemBunny(timelineItem)
    // 如果是命令加入的，还需要更新原本时间轴项目的尺寸
    if (options.scenario === 'command') {
      timelineItem.config.width = timelineItem.runtime.textBitmap?.width ?? 0
      timelineItem.config.height = timelineItem.runtime.textBitmap?.height ?? 0
    }

    console.log(`✅ [TimelineItemTransitioner] 文本时间轴项目转换完成: ${timelineItem.id}`)
  }

  /**
   * 处理媒体类型的状态转换（现有逻辑）
   */
  private async transitionMediaTimelineItem(
    timelineItem: UnifiedTimelineItemData<Exclude<MediaType, 'text'>>,
    options: TransitionOptions,
  ): Promise<void> {
    if (!this.mediaItem) {
      throw new Error('媒体类型的时间轴项目必须提供 mediaItem')
    }

    // 如果是工程加载的，时间轴项目已经同步了素材属性或者用户修改了的，因此不需要更新
    // 如果是命令加入的，由于时间轴项目还是初始化状态，因此需要使用素材属性来更新项目属性
    if (options.scenario === 'command') {
      this.updateTimelineItem(timelineItem)
    }

    await setupTimelineItemBunny(timelineItem, this.mediaItem)
  }

  /**
   * 更新时间轴项目的尺寸信息
   */
  private updateTimelineItem(timelineItem: UnifiedTimelineItemData): void {
    if (!this.mediaItem) {
      console.warn(
        `⚠️ [TimelineItemTransitioner] 无法更新尺寸，mediaItem 不存在: ${timelineItem.id}`,
      )
      return
    }

    // 更新timeRange - 使用媒体项目的duration
    if (this.mediaItem.duration && timelineItem.timeRange) {
      const duration = this.mediaItem.duration
      const startTime = timelineItem.timeRange.timelineStartTime

      // 更新时间范围，保持开始时间不变，更新结束时间
      TimelineItemFactory.setTimeRange(timelineItem, {
        ...timelineItem.timeRange,
        timelineEndTime: startTime + duration,
        clipStartTime: 0,
        clipEndTime: duration,
      })
    }

    // 获取媒体的原始尺寸
    const originalSize = UnifiedMediaItemQueries.getOriginalSize(this.mediaItem)

    // 更新config中的宽高 - 仅对视频和图片类型，并且有原始尺寸时才更新
    if (
      originalSize &&
      (TimelineItemQueries.isVideoTimelineItem(timelineItem) ||
        TimelineItemQueries.isImageTimelineItem(timelineItem))
    ) {
      // 保留现有的配置，只更新尺寸相关字段
      const currentConfig = timelineItem.config

      // 更新宽度和高度
      currentConfig.width = originalSize.width
      currentConfig.height = originalSize.height
    } else if (!originalSize) {
      console.warn(`⚠️ [TimelineItemTransitioner] 无法获取媒体原始尺寸: ${this.mediaItem.id}`)
    }
  }
}
