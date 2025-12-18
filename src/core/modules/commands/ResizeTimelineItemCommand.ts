import { generateCommandId } from '@/core/utils/idGenerator'
import { framesToTimecode } from '@/core/utils/timeUtils'
import type { SimpleCommand } from '@/core/modules/commands/types'
import { updateWebAVAnimation } from '@/core/utils/webavAnimationManager'

// 类型导入
import type { UnifiedTimelineItemData } from '@/core/timelineitem/TimelineItemData'

import type { UnifiedMediaItemData, MediaType } from '@/core/mediaitem/types'

import type { UnifiedTimeRange } from '@/core/types/timeRange'

import { TimelineItemQueries } from '@/core/timelineitem/TimelineItemQueries'

/**
 * 调整时间轴项目大小命令
 * 支持已知和未知时间轴项目时间范围调整（拖拽边缘）的撤销/重做操作
 * 保存调整前的时间范围，撤销时恢复原始时间范围
 */
export class ResizeTimelineItemCommand implements SimpleCommand {
  public readonly id: string
  public readonly description: string
  private originalTimeRange: UnifiedTimeRange
  private newTimeRange: UnifiedTimeRange
  private oldDurationFrames: number
  private newDurationFrames: number
  private hasAnimation: boolean = false

  constructor(
    private timelineItemId: string,
    originalTimeRange: UnifiedTimeRange, // 原始时间范围
    newTimeRange: UnifiedTimeRange, // 新的时间范围
    private timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
    },
    private mediaModule: {
      getMediaItem: (id: string) => UnifiedMediaItemData | undefined
    },
  ) {
    this.id = generateCommandId()

    // 保存原始和新的时间范围
    this.originalTimeRange = { ...originalTimeRange }
    this.newTimeRange = { ...newTimeRange }

    // 计算时长变化
    this.oldDurationFrames =
      this.originalTimeRange.timelineEndTime - this.originalTimeRange.timelineStartTime
    this.newDurationFrames = this.newTimeRange.timelineEndTime - this.newTimeRange.timelineStartTime

    // 获取时间轴项目信息用于描述
    const timelineItem = this.timelineModule.getTimelineItem(timelineItemId)
    let itemName = '未知素材'

    // 根据项目类型获取名称
    if (timelineItem) {
      const mediaItem = this.mediaModule.getMediaItem(timelineItem.mediaItemId)
      itemName = mediaItem?.name || '未知素材'

      // 检查是否有动画
      this.hasAnimation = !!(timelineItem.animation && timelineItem.animation.keyframes.length > 0)
    }

    const originalStartFrames = this.originalTimeRange.timelineStartTime
    const newStartFrames = this.newTimeRange.timelineStartTime

    this.description = `调整时间范围: ${itemName} (${framesToTimecode(this.oldDurationFrames)} → ${framesToTimecode(this.newDurationFrames)})`

    console.log(`📋 准备调整时间范围: ${itemName}`, {
      原始时长: framesToTimecode(this.oldDurationFrames),
      新时长: framesToTimecode(this.newDurationFrames),
      原始位置: framesToTimecode(originalStartFrames),
      新位置: framesToTimecode(newStartFrames),
      hasAnimation: this.hasAnimation,
    })
  }

  /**
   * 应用时间范围到sprite和timelineItem
   */
  private async applyTimeRange(
    timeRange: UnifiedTimeRange,
    isUndo: boolean = false,
  ): Promise<void> {
    const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!timelineItem) {
      throw new Error(`找不到时间轴项目: ${this.timelineItemId}`)
    }

    const sprite = timelineItem.runtime.sprite
    if (!sprite) {
      throw new Error(`时间轴项目没有sprite: ${this.timelineItemId}`)
    }

    // 根据媒体类型设置时间范围
    if (
      TimelineItemQueries.isVideoTimelineItem(timelineItem) ||
      TimelineItemQueries.isAudioTimelineItem(timelineItem)
    ) {
      // 视频和音频类型：保持clipStartTime和clipEndTime，更新timeline时间
      const clipStartTime = timeRange.clipStartTime
      const clipEndTime = timeRange.clipEndTime

      sprite.setTimeRange({
        clipStartTime,
        clipEndTime,
        timelineStartTime: timeRange.timelineStartTime,
        timelineEndTime: timeRange.timelineEndTime,
      })
    } else if (
      TimelineItemQueries.isImageTimelineItem(timelineItem) ||
      TimelineItemQueries.isTextTimelineItem(timelineItem)
    ) {
      // 图片和文本类型：只设置时间轴时间，clipStartTime和clipEndTime保持为-1
      sprite.setTimeRange({
        timelineStartTime: timeRange.timelineStartTime,
        timelineEndTime: timeRange.timelineEndTime,
        clipStartTime: -1,
        clipEndTime: -1,
      })
    } else {
      throw new Error('不支持的媒体类型')
    }

    // 同步timeRange到TimelineItem
    timelineItem.timeRange = sprite.getTimeRange()

    // 如果时长有变化且有关键帧，调整关键帧位置
    if (this.hasAnimation && this.oldDurationFrames !== this.newDurationFrames) {
      const { adjustKeyframesForDurationChange } = await import(
        '@/core/utils/unifiedKeyframeUtils'
      )

      // 根据是执行还是撤销操作，确定参数顺序
      if (isUndo) {
        // 撤销操作：从新时长恢复到原时长
        adjustKeyframesForDurationChange(
          timelineItem,
          this.newDurationFrames,
          this.oldDurationFrames,
        )
      } else {
        // 执行操作：从原时长调整到新时长
        adjustKeyframesForDurationChange(
          timelineItem,
          this.oldDurationFrames,
          this.newDurationFrames,
        )
      }
      console.log(
        `🎬 [ResizeTimelineItemCommand] Keyframes adjusted for duration change (${isUndo ? 'undo' : 'execute'})`,
      )
    }

    // 如果有动画，更新WebAV动画时长
    if (this.hasAnimation) {
      await updateWebAVAnimation(timelineItem)
      console.log(
        `🎬 [ResizeTimelineItemCommand] Animation duration updated after clip resize (${isUndo ? 'undo' : 'execute'})`,
      )
    }
  }

  /**
   * 执行命令：应用新的时间范围
   */
  async execute(): Promise<void> {
    try {
      console.log(`🔄 执行调整时间范围操作: ${this.timelineItemId}...`)

      await this.applyTimeRange(this.newTimeRange, false)

      const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
      const mediaItem = timelineItem
        ? this.mediaModule.getMediaItem(timelineItem.mediaItemId)
        : null

      console.log(
        `✅ 已调整时间范围: ${mediaItem?.name || '未知素材'} → ${framesToTimecode(this.newDurationFrames)}`,
      )
    } catch (error) {
      const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
      const mediaItem = timelineItem
        ? this.mediaModule.getMediaItem(timelineItem.mediaItemId)
        : null
      console.error(`❌ 调整时间范围失败: ${mediaItem?.name || '未知素材'}`, error)
      throw error
    }
  }

  /**
   * 撤销命令：恢复原始时间范围
   */
  async undo(): Promise<void> {
    try {
      console.log(`🔄 撤销调整时间范围操作：恢复 ${this.timelineItemId} 的原始时间范围...`)

      await this.applyTimeRange(this.originalTimeRange, true)

      const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
      const mediaItem = timelineItem
        ? this.mediaModule.getMediaItem(timelineItem.mediaItemId)
        : null

      console.log(
        `↩️ 已撤销调整时间范围: ${mediaItem?.name || '未知素材'} → ${framesToTimecode(this.oldDurationFrames)}`,
      )
    } catch (error) {
      const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
      const mediaItem = timelineItem
        ? this.mediaModule.getMediaItem(timelineItem.mediaItemId)
        : null
      console.error(`❌ 撤销调整时间范围失败: ${mediaItem?.name || '未知素材'}`, error)
      throw error
    }
  }
}
