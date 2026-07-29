import { generateCommandId } from '@/core/utils/idGenerator'
import { framesToTimecode } from '@/core/utils/timeUtils'
import type { SimpleCommand } from '@/core/modules/commands/types'
import { adjustKeyframesForDurationChange } from '@/core/utils/unifiedKeyframeUtils'
import { hasAnimation } from '@/core/utils/unifiedKeyframeUtils'
import {
  cloneAIMarks,
  resizeAIMarks,
  resizeTimelineMarkers,
} from '@/core/utils/timelineMarkerUtils'
import { historyLabels } from '@/core/modules/historyLabel'

// 类型导入
import type { AIMarks, UnifiedTimelineItemData } from '@/core/timelineitem/model/timelineItem'

import type { UnifiedMediaItemData, MediaType } from '@/core/mediaitem/types'

import type { UnifiedTimeRange } from '@/core/types/timeRange'

/**
 * 调整时间轴项目大小命令
 * 支持已知和未知时间轴项目时间范围调整（拖拽边缘）的撤销/重做操作
 * 保存调整前的时间范围，撤销时恢复原始时间范围
 */
export class ResizeTimelineItemCommand implements SimpleCommand {
  public readonly id: string
  public readonly historyLabel: ReturnType<typeof historyLabels.resizeTimelineItem>
  private originalTimeRange: UnifiedTimeRange
  private newTimeRange: UnifiedTimeRange
  private oldDurationFrames: number
  private newDurationFrames: number
  private hasAnimation: boolean = false
  private originalMarkers: number[]
  private newMarkers: number[]
  private originalAIMarks: AIMarks | undefined
  private newAIMarks: AIMarks | undefined
  private _isDisposed = false

  constructor(
    private timelineItemId: string,
    originalTimeRange: UnifiedTimeRange, // 原始时间范围
    newTimeRange: UnifiedTimeRange, // 新的时间范围
    private timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
      setTimelineItemTimeRangeForCmd: (id: string, timeRange: Partial<UnifiedTimeRange>) => void
    },
    private mediaModule: {
      getMediaItem: (id: string | null) => UnifiedMediaItemData | undefined
    },
  ) {
    this.id = generateCommandId()

    // 保存原始和新的时间范围
    this.originalTimeRange = { ...originalTimeRange }
    this.newTimeRange = { ...newTimeRange }
    const timelineItem = this.timelineModule.getTimelineItem(timelineItemId)
    this.originalMarkers = [...(timelineItem?.markers ?? [])]
    this.originalAIMarks = cloneAIMarks(timelineItem?.aiMarks)
    this.newMarkers = resizeTimelineMarkers(
      this.originalMarkers,
      this.originalTimeRange,
      this.newTimeRange,
    )
    this.newAIMarks = resizeAIMarks(
      this.originalAIMarks,
      this.originalTimeRange,
      this.newTimeRange,
    )

    // 计算时长变化
    this.oldDurationFrames =
      this.originalTimeRange.timelineEndTime - this.originalTimeRange.timelineStartTime
    this.newDurationFrames = this.newTimeRange.timelineEndTime - this.newTimeRange.timelineStartTime

    // 获取时间轴项目信息用于描述
    let itemName: string | undefined

    // 根据项目类型获取名称
    if (timelineItem) {
      const mediaItem = this.mediaModule.getMediaItem(timelineItem.mediaItemId)
      itemName = mediaItem?.name

      // 检查是否有动画
      this.hasAnimation = hasAnimation(timelineItem)
    }

    const originalStartFrames = this.originalTimeRange.timelineStartTime
    const newStartFrames = this.newTimeRange.timelineStartTime

    this.historyLabel = historyLabels.resizeTimelineItem(itemName)

    console.log(`📋 准备调整时间范围: ${itemName ?? this.timelineItemId}`, {
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
    markers: number[],
    aiMarks: AIMarks | undefined,
    isUndo: boolean = false,
  ): Promise<void> {
    const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!timelineItem) {
      throw new Error(`找不到时间轴项目: ${this.timelineItemId}`)
    }

    // 同步 timeRange 到 TimelineItem，并在模块内统一刷新转场绑定
    this.timelineModule.setTimelineItemTimeRangeForCmd(this.timelineItemId, timeRange)
    timelineItem.markers = [...markers]
    timelineItem.aiMarks = cloneAIMarks(aiMarks)

    // 如果时长有变化且有关键帧，调整关键帧位置
    if (this.hasAnimation && this.oldDurationFrames !== this.newDurationFrames) {
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

    // 如果有动画，更新动画时长
    if (this.hasAnimation) {
      // 动画时长更新已迁移到 Bunny 组件，无需手动更新
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

      await this.applyTimeRange(this.newTimeRange, this.newMarkers, this.newAIMarks, false)

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

      await this.applyTimeRange(
        this.originalTimeRange,
        this.originalMarkers,
        this.originalAIMarks,
        true,
      )

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

  /**
   * 检查命令是否已被清理
   */
  get isDisposed(): boolean {
    return this._isDisposed
  }

  /**
   * 清理命令持有的资源
   */
  dispose(): void {
    if (this._isDisposed) {
      return
    }

    this._isDisposed = true
    console.log(`🗑️ [ResizeTimelineItemCommand] 命令资源已清理: ${this.id}`)
  }
}
