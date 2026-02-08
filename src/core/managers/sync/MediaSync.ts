/**
 * 统一的媒体同步类
 * 通过配置选项控制行为，支持一个媒体项目关联多个时间轴项目（性能优化）
 *
 * 设计理念：
 * - 使用配置选项而非继承来控制行为
 * - 支持批量场景的性能优化（一个媒体对应多个时间轴项目）
 * - 由命令自己管理生命周期，不依赖全局管理器
 * - 使用 isInitialized 字段自动判断是否需要更新时间轴项目数据
 */

import { watch } from 'vue'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import { MediaItemQueries } from '@/core/mediaitem'
import { useUnifiedStore } from '@/core/unifiedStore'
import { TimelineItemTransitioner } from './TimelineItemTransitioner'
import { sleep } from '@/utils/fetchClient'
import type { MediaSyncOptions } from './types'

/**
 * 统一的媒体同步类
 */
export class MediaSync {
  private syncId: string
  private unwatch?: () => void
  private isSetup = false

  constructor(
    private mediaItemId: string,
    private options: MediaSyncOptions,
  ) {
    this.syncId = options.syncId
  }

  /**
   * 设置媒体同步
   */
  async setup(): Promise<void> {
    if (this.isSetup) {
      console.warn(`[MediaSync] 媒体同步已设置: ${this.syncId}`)
      return
    }

    try {
      console.log(`[MediaSync] 开始设置媒体同步: ${this.syncId}`, {
        description: this.options.description,
        timelineItemCount: this.options.timelineItemIds.length,
      })

      // 1. 获取媒体项目
      const store = useUnifiedStore()
      const mediaItem = store.getMediaItem(this.mediaItemId)
      if (!mediaItem) {
        throw new Error(`找不到媒体项目: ${this.mediaItemId}`)
      }

      // 2. 检查是否需要同步
      if (MediaItemQueries.isReady(mediaItem)) {
        console.log(`[MediaSync] 媒体已就绪，直接处理: ${this.syncId}`)
        await this.handleReadyMedia(mediaItem)
        return
      }

      // 3. 设置状态监听
      this.unwatch = this.setupWatcher(mediaItem)

      this.isSetup = true
      console.log(`✅ [MediaSync] 媒体同步设置成功: ${this.syncId}`)
    } catch (error) {
      console.error(`❌ [MediaSync] 媒体同步设置失败: ${this.syncId}`, error)
      throw error
    }
  }

  /**
   * 清理媒体同步
   */
  cleanup(): void {
    if (this.unwatch) {
      this.unwatch()
      this.unwatch = undefined
    }
    this.isSetup = false
    console.log(`🧹 [MediaSync] 媒体同步已清理: ${this.syncId}`)
  }

  /**
   * 处理媒体就绪
   */
  private async handleReadyMedia(mediaItem: UnifiedMediaItemData): Promise<void> {
    console.log(`⏭️ [MediaSync] 媒体已就绪: ${mediaItem.name}`, {
      syncId: this.syncId,
      timelineItemCount: this.options.timelineItemIds.length,
    })

    // 1. 根据配置决定是否更新命令数据
    if (this.options.shouldUpdateCommand && this.options.commandId) {
      const store = useUnifiedStore()
      const command = store.getCommand(this.options.commandId)
      if (command && !command.isDisposed) {
        // 为每个时间轴项目调用 updateMediaData
        for (const timelineItemId of this.options.timelineItemIds) {
          command.updateMediaData?.(mediaItem, timelineItemId)
        }
        console.log(`🔄 [MediaSync] 已更新命令媒体数据: ${this.options.commandId}`)
      }
    }

    // 2. 转换所有相关的时间轴项目状态
    for (const timelineItemId of this.options.timelineItemIds) {
      await this.transitionTimelineItem(mediaItem, timelineItemId)
    }
  }

  /**
   * 转换时间轴项目状态
   */
  private async transitionTimelineItem(
    mediaItem: UnifiedMediaItemData,
    timelineItemId: string,
  ): Promise<void> {
    // 检查时间轴项目是否还存在（可能已被删除）
    const store = useUnifiedStore()
    const timelineItem = store.getTimelineItem(timelineItemId)

    if (!timelineItem) {
      console.log(`⏭️ [MediaSync] 时间轴项目不存在，跳过转换: ${timelineItemId}`)
      return
    }

    const transitioner = new TimelineItemTransitioner(timelineItemId, mediaItem)

    // TimelineItemTransitioner 会根据 timelineItem.runtime.isInitialized 自动判断是否需要更新
    await transitioner.transitionToReady({
      commandId: this.options.commandId,
    })
  }

  /**
   * 设置状态监听器
   */
  private setupWatcher(mediaItem: UnifiedMediaItemData): () => void {
    return watch(
      () => mediaItem.mediaStatus,
      async (newStatus, oldStatus) => {
        console.log(`🔄 [MediaSync] 媒体状态变化: ${oldStatus} → ${newStatus}`, {
          syncId: this.syncId,
          mediaItemId: this.mediaItemId,
          mediaName: mediaItem.name,
          description: this.options.description,
        })

        if (newStatus === 'ready') {
          // await sleep(5 * 1000) // 测试延迟准备 --- IGNORE ---
          await this.handleReadyMedia(mediaItem)
          // 媒体就绪后自动清理watcher
          this.cleanup()
        } else if (this.isErrorStatus(newStatus)) {
          await this.handleMediaError(mediaItem, newStatus)
          // 错误后也清理watcher
          this.cleanup()
        }
      },
      { immediate: true },
    )
  }

  /**
   * 处理媒体错误
   */
  private async handleMediaError(mediaItem: UnifiedMediaItemData, status: string): Promise<void> {
    const store = useUnifiedStore()
    for (const timelineItemId of this.options.timelineItemIds) {
      const timelineItem = store.getTimelineItem(timelineItemId)
      if (timelineItem) {
        timelineItem.timelineStatus = 'error'
        console.log(`❌ [MediaSync] 时间轴项目状态已设置为错误: ${timelineItemId}`)
      }
    }
  }

  /**
   * 判断是否为错误状态
   */
  private isErrorStatus(status: string): boolean {
    return ['error', 'cancelled', 'missing'].includes(status)
  }
}
