/**
 * 项目加载场景的媒体同步
 * 负责项目加载过程中的媒体状态同步
 */

import { watch } from 'vue'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import { UnifiedMediaItemQueries } from '@/core/mediaitem'
import { TimelineItemQueries } from '@/core/timelineitem/TimelineItemQueries'
import { useUnifiedStore } from '@/core/unifiedStore'
import { BaseMediaSync } from './BaseMediaSync'
import { TimelineItemTransitioner } from './TimelineItemTransitioner'
import { MediaSyncManager } from './MediaSyncManager'

/**
 * 项目加载场景的媒体同步
 */
export class ProjectLoadMediaSync extends BaseMediaSync {
  constructor(
    mediaItemId: string,
    timelineItemId: string, // 项目加载场景必须有 timelineItemId
    private setupTimelineItemSprite?: (item: any) => Promise<void>, // 支持文本类型
  ) {
    super(mediaItemId, timelineItemId)
  }

  /**
   * 设置同步，对于文本类型立即触发转换
   */
  async setup(): Promise<void> {
    // 检查是否为文本类型的时间轴项目
    if (this.timelineItemId) {
      const store = useUnifiedStore()
      const timelineItem = store.getTimelineItem(this.timelineItemId)
      
      if (timelineItem && TimelineItemQueries.isTextTimelineItem(timelineItem)) {
        console.log(`🎨 [ProjectLoadMediaSync] 检测到文本类型，立即触发状态转换: ${this.timelineItemId}`)
        
        // 文本类型立即转换，不需要等待媒体加载
        await this.transitionTextTimelineItem()
        return
      }
    }

    // 非文本类型使用父类的设置逻辑
    await super.setup()
  }

  /**
   * 转换文本类型的时间轴项目
   */
  private async transitionTextTimelineItem(): Promise<void> {
    if (!this.timelineItemId) return

    const transitioner = new TimelineItemTransitioner(
      this.timelineItemId,
      undefined,
      this.setupTimelineItemSprite
    )

    await transitioner.transitionToReady({
      scenario: 'projectLoad',
    })

    // 文本类型转换完成后自动清理
    this.autoCleanup()
  }

  protected generateSyncId(): string {
    return this.timelineItemId!
  }

  protected getMediaItem(): UnifiedMediaItemData | undefined {
    const store = useUnifiedStore()
    return store.getMediaItem(this.mediaItemId)
  }

  protected shouldSkipSync(mediaItem: UnifiedMediaItemData): boolean {
    return UnifiedMediaItemQueries.isReady(mediaItem)
  }

  protected async handleReadyMedia(mediaItem: UnifiedMediaItemData): Promise<void> {
    console.log(`⏭️ [ProjectLoadMediaSync] 媒体已就绪，直接转换时间轴项目: ${mediaItem.name}`)
    await this.transitionTimelineItem(mediaItem)
  }

  protected setupWatcher(mediaItem: UnifiedMediaItemData): () => void {
    return watch(
      () => mediaItem.mediaStatus,
      async (newStatus, oldStatus) => {
        console.log(`🔄 [ProjectLoadMediaSync] 媒体状态变化: ${oldStatus} → ${newStatus}`, {
          timelineItemId: this.timelineItemId,
          mediaItemId: this.mediaItemId,
          mediaName: mediaItem.name,
        })

        if (newStatus === 'ready') {
          await this.handleReadyMedia(mediaItem)
          this.autoCleanup()
        } else if (this.isErrorStatus(newStatus)) {
          await this.handleMediaError(mediaItem, newStatus)
        }
      },
      { immediate: true },
    )
  }

  protected registerToManager(): void {
    const manager = MediaSyncManager.getInstance()
    manager.register(this.syncId, this.mediaItemId, () => this.cleanup(), 'projectLoad', {
      timelineItemId: this.timelineItemId,
      description: `ProjectLoad: ${this.timelineItemId}`,
    })
  }


  private async handleMediaError(
    mediaItem: UnifiedMediaItemData,
    status: string,
  ): Promise<void> {
    const store = useUnifiedStore()
    const timelineItem = store.getTimelineItem(this.timelineItemId!)
    if (timelineItem) {
      timelineItem.timelineStatus = 'error'
      console.log(
        `❌ [ProjectLoadMediaSync] 时间轴项目状态已设置为错误: ${this.timelineItemId}`,
      )
    }

    this.autoCleanup()
  }

  private async transitionTimelineItem(mediaItem: UnifiedMediaItemData): Promise<void> {
    if (!this.timelineItemId) return

    const store = useUnifiedStore()
    const timelineItem = store.getTimelineItem(this.timelineItemId)
    
    if (!timelineItem) return

    // 根据时间轴项目类型创建不同的 transitioner
    let transitioner: TimelineItemTransitioner
    
    if (TimelineItemQueries.isTextTimelineItem(timelineItem)) {
      // 文本类型需要 setupTimelineItemSprite 函数
      transitioner = new TimelineItemTransitioner(
        this.timelineItemId,
        undefined,
        this.setupTimelineItemSprite
      )
    } else {
      // 媒体类型需要 mediaItem
      transitioner = new TimelineItemTransitioner(this.timelineItemId, mediaItem)
    }

    await transitioner.transitionToReady({
      scenario: 'projectLoad',
    })
  }

  private isErrorStatus(status: string): boolean {
    return ['error', 'cancelled', 'missing'].includes(status)
  }

  private autoCleanup(): void {
    const manager = MediaSyncManager.getInstance()
    manager.cleanupByTimelineItemId(this.timelineItemId!)
    console.log(`🧹 [ProjectLoadMediaSync] 项目加载媒体同步已自动清理: ${this.timelineItemId}`)
  }
}