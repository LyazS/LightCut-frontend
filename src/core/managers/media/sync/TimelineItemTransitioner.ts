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

import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { TransitionOptions } from './types'
import { UnifiedMediaItemQueries } from '@/core/mediaitem'
import { TimelineItemFactory, TimelineItemQueries } from '@/core/timelineitem'
import { useUnifiedStore } from '@/core/unifiedStore'
import { hasAudioCapabilities } from '@/core/utils/spriteTypeGuards'
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
        await this.transitionMediaTimelineItem(timelineItem, options)
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

    // 4. 使用 setupTimelineItemBunny 创建 textBitmap
    await setupTimelineItemBunny(timelineItem)

    // 5. 设置轨道属性
    this.applyTrackProperties(timelineItem)

    // 6. 应用动画（如果有）
    await this.applyAnimation(timelineItem)

    console.log(`✅ [TimelineItemTransitioner] 文本时间轴项目转换完成: ${timelineItem.id}`)
  }

  /**
   * 处理媒体类型的状态转换（现有逻辑）
   */
  private async transitionMediaTimelineItem(
    timelineItem: UnifiedTimelineItemData,
    options: TransitionOptions,
  ): Promise<void> {
    if (!this.mediaItem) {
      throw new Error('媒体类型的时间轴项目必须提供 mediaItem')
    }

    // 现有的媒体类型处理逻辑
    if (options.scenario === 'command') {
      this.updateDimensions(timelineItem)
    }

    await this.createBunny(timelineItem)

    this.applyTrackProperties(timelineItem)
    await this.applyAnimation(timelineItem)
  }

  /**
   * 更新时间轴项目的尺寸信息
   */
  private updateDimensions(timelineItem: UnifiedTimelineItemData): void {
    if (!this.mediaItem) {
      console.warn(
        `⚠️ [TimelineItemTransitioner] 无法更新尺寸，mediaItem 不存在: ${timelineItem.id}`,
      )
      return
    }

    try {
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
        console.log(`⏱️ [TimelineItemTransitioner] 已更新时间范围: ${timelineItem.id}`, {
          duration,
          startTime,
          endTime: startTime + duration,
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
        console.log(`📐 [TimelineItemTransitioner] 更新时间轴项目尺寸: ${timelineItem.id}`, {
          originalWidth: originalSize.width,
          originalHeight: originalSize.height,
          mediaType: this.mediaItem.mediaType,
        })

        // 保留现有的配置，只更新尺寸相关字段
        const currentConfig = timelineItem.config

        // 更新宽度和高度
        currentConfig.width = originalSize.width
        currentConfig.height = originalSize.height

        // 更新原始宽度和高度
        currentConfig.originalWidth = originalSize.width
        currentConfig.originalHeight = originalSize.height

        console.log(`🖼️ [TimelineItemTransitioner] 已更新配置尺寸: ${timelineItem.id}`, {
          width: originalSize.width,
          height: originalSize.height,
        })
      } else if (!originalSize) {
        console.warn(`⚠️ [TimelineItemTransitioner] 无法获取媒体原始尺寸: ${this.mediaItem.id}`)
      }
    } catch (error) {
      console.error(
        `❌ [TimelineItemTransitioner] 更新时间轴项目尺寸失败: ${timelineItem.id}`,
        error,
      )
    }
  }

  /**
   * 创建 Sprite
   */
  private async createBunny(timelineItem: UnifiedTimelineItemData): Promise<void> {
    if (!this.mediaItem) {
      console.warn(
        `⚠️ [TimelineItemTransitioner] 无法创建Sprite，mediaItem 不存在: ${this.timelineItemId}`,
      )
      return
    }

    try {
      console.log(`🔄 [TimelineItemTransitioner] 为时间轴项目创建Sprite: ${this.timelineItemId}`)

      // 使用 setupTimelineItemBunny 创建 bunny 对象
      await setupTimelineItemBunny(timelineItem, this.mediaItem)

      console.log(
        `✅ [TimelineItemTransitioner] Sprite创建成功并存储到runtime: ${this.timelineItemId}`,
      )
    } catch (error) {
      console.error(`❌ [TimelineItemTransitioner] 创建Sprite失败: ${this.timelineItemId}`, error)
      // Sprite创建失败不影响后续操作
    }
  }

  /**
   * 为sprite设置轨道属性
   */
  private applyTrackProperties(timelineItem: UnifiedTimelineItemData): void {
    try {
      const store = useUnifiedStore()
      const track = store.tracks.find((t) => t.id === timelineItem.trackId)

      if (track && timelineItem.runtime.sprite) {
        // 设置可见性
        timelineItem.runtime.sprite.visible = track.isVisible

        // 为具有音频功能的片段设置静音状态
        if (hasAudioCapabilities(timelineItem.runtime.sprite)) {
          timelineItem.runtime.sprite.setTrackMuted(track.isMuted)
        }

        console.log(`✅ [TimelineItemTransitioner] 已设置轨道属性到sprite: ${timelineItem.id}`, {
          trackId: track.id,
          trackName: track.name,
          isVisible: track.isVisible,
          isMuted: track.isMuted,
        })
      }
    } catch (trackError) {
      console.error(
        `❌ [TimelineItemTransitioner] 设置轨道属性到sprite失败: ${timelineItem.id}`,
        trackError,
      )
      // 轨道属性设置失败不影响后续操作
    }
  }

  /**
   * 应用动画配置到sprite
   */
  private async applyAnimation(timelineItem: UnifiedTimelineItemData): Promise<void> {
    if (timelineItem.animation && timelineItem.animation.keyframes.length > 0) {
      try {
        console.log(`🎬 [TimelineItemTransitioner] 应用动画配置到sprite: ${timelineItem.id}`, {
          keyframeCount: timelineItem.animation.keyframes.length,
        })

        // 动画配置已迁移到 Bunny 组件，无需手动应用

        console.log(`✅ [TimelineItemTransitioner] 动画配置应用成功: ${timelineItem.id}`)
      } catch (animationError) {
        console.error(
          `❌ [TimelineItemTransitioner] 应用动画配置失败: ${timelineItem.id}`,
          animationError,
        )
        // 动画应用失败不影响后续操作
      }
    }
  }
}
