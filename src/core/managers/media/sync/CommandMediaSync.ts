/**
 * 命令场景的媒体同步
 * 负责命令执行过程中的媒体状态同步
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
 * 命令场景的媒体同步
 */
export class CommandMediaSync extends BaseMediaSync {
  constructor(
    private commandId: string,
    mediaItemId: string,
    timelineItemId?: string,
    private setupTimelineItemSprite?: (item: any) => Promise<void>, // 支持文本类型
  ) {
    super(mediaItemId, timelineItemId)
  }

  protected generateSyncId(): string {
    return this.commandId
  }

  protected getMediaItem(): UnifiedMediaItemData | undefined {
    const store = useUnifiedStore()
    return store.getMediaItem(this.mediaItemId)
  }

  protected shouldSkipSync(mediaItem: UnifiedMediaItemData): boolean {
    return UnifiedMediaItemQueries.isReady(mediaItem)
  }

  protected async handleReadyMedia(mediaItem: UnifiedMediaItemData): Promise<void> {
    console.log(`⏭️ [CommandMediaSync] 媒体已就绪: ${mediaItem.name}`)

    // 1. 更新命令中的媒体数据
    const store = useUnifiedStore()
    const command = store.getCommand(this.commandId)
    if (command && !command.isDisposed) {
      command.updateMediaData?.(mediaItem, this.timelineItemId)
      console.log(`🔄 [CommandMediaSync] 已更新命令媒体数据: ${this.commandId}`)
    }

    // 2. 转换时间轴项目状态
    if (this.timelineItemId) {
      await this.transitionTimelineItem(mediaItem)
    }
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
        console.log(`🎨 [CommandMediaSync] 检测到文本类型，立即触发状态转换: ${this.timelineItemId}`)
        
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
      scenario: 'command',
      commandId: this.commandId,
    })

    // 文本类型转换完成后自动清理
    this.autoCleanup()
  }

  protected setupWatcher(mediaItem: UnifiedMediaItemData): () => void {
    return watch(
      () => mediaItem.mediaStatus,
      async (newStatus, oldStatus) => {
        console.log(`🔄 [CommandMediaSync] 媒体状态变化: ${oldStatus} → ${newStatus}`, {
          commandId: this.commandId,
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
    manager.register(this.syncId, this.mediaItemId, () => this.cleanup(), 'command', {
      commandId: this.commandId,
      timelineItemId: this.timelineItemId,
      description: `Command: ${this.commandId}`,
    })
  }


  private async handleMediaError(
    mediaItem: UnifiedMediaItemData,
    status: string,
  ): Promise<void> {
    if (this.timelineItemId) {
      const store = useUnifiedStore()
      const timelineItem = store.getTimelineItem(this.timelineItemId)
      if (timelineItem) {
        timelineItem.timelineStatus = 'error'
        console.log(`❌ [CommandMediaSync] 时间轴项目状态已设置为错误: ${this.timelineItemId}`)
      }
    }

    // 自动清理
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
      scenario: 'command',
      commandId: this.commandId,
    })
  }

  private isErrorStatus(status: string): boolean {
    return ['error', 'cancelled', 'missing'].includes(status)
  }

  private autoCleanup(): void {
    const manager = MediaSyncManager.getInstance()
    manager.cleanupByCommandId(this.commandId)
    console.log(`🧹 [CommandMediaSync] 命令媒体同步已自动清理: ${this.commandId}`)
  }
}