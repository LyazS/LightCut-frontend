/**
 * 统一架构下的批量命令实现
 * 基于"核心数据与行为分离"的响应式重构版本
 *
 * 主要变化：
 * 1. 使用 UnifiedTimelineItemData 替代原有的 LocalTimelineItem 和 AsyncProcessingTimelineItem
 * 2. 使用 UnifiedMediaItemData 替代原有的 LocalMediaItem
 * 3. 使用 UnifiedTrackData 替代原有的 Track 类型
 * 4. 使用统一的状态管理系统（3状态：ready|loading|error）
 * 5. 保持与原有命令相同的API接口，便于迁移
 */
import type { VisibleSprite } from '@webav/av-cliper'
import type { Ref } from 'vue'
import type { VideoResolution } from '@/core/types'
import { BaseBatchCommand } from '@/core/modules/UnifiedHistoryModule'
import type { SimpleCommand } from '@/core/modules/commands/types'
import {
  RemoveTimelineItemCommand,
  MoveTimelineItemCommand,
} from '@/core/modules/commands/timelineCommands'

// ==================== 新架构类型导入 ====================
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'

import type { UnifiedMediaItemData, MediaType } from '@/core/mediaitem/types'

import type { UnifiedTrackData } from '@/core/track/TrackTypes'

/**
 * 批量删除时间轴项目命令
 * 将多个删除操作组合为一个批量操作，统一撤销/重做
 */
export class BatchDeleteCommand extends BaseBatchCommand {
  constructor(
    private timelineItemIds: string[],
    private timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
      addTimelineItem: (item: UnifiedTimelineItemData<MediaType>) => Promise<void>
      removeTimelineItem: (id: string) => Promise<void>
      setupTimelineItemSprite: (item: UnifiedTimelineItemData<MediaType>) => Promise<void>
    },
    private mediaModule: {
      getMediaItem: (id: string) => UnifiedMediaItemData | undefined
    },
    private configModule: {
      videoResolution: Ref<VideoResolution>
    },
  ) {
    super(`批量删除 ${timelineItemIds.length} 个时间轴项目`)
    this.buildDeleteCommands()
  }

  /**
   * 构建删除命令列表
   */
  private buildDeleteCommands() {
    for (const itemId of this.timelineItemIds) {
      const deleteCommand = new RemoveTimelineItemCommand(
        itemId,
        this.timelineModule,
        this.mediaModule,
        this.configModule,
      )
      this.addCommand(deleteCommand)
    }

    console.log(`📋 准备批量删除 ${this.subCommands.length} 个时间轴项目`)
  }
}

/**
 * 批量自动排列轨道命令
 * 将自动排列操作分解为多个移动命令，支持统一撤销/重做
 */
export class BatchAutoArrangeTrackCommand extends BaseBatchCommand {
  constructor(
    private trackId: string,
    private timelineItems: UnifiedTimelineItemData<MediaType>[],
    private timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
      updateTimelineItemPosition: (id: string, positionFrames: number, trackId?: string) => void
    },
    private mediaModule: {
      getMediaItem: (id: string) => UnifiedMediaItemData | undefined
    },
    private trackModule: {
      getTrack: (trackId: string) => UnifiedTrackData | undefined
    },
  ) {
    const track = trackModule.getTrack(trackId)
    super(`自动排列轨道: ${track?.name || `轨道 ${trackId}`}`)
    this.buildMoveCommands()
  }

  /**
   * 构建移动命令列表
   */
  private buildMoveCommands() {
    if (this.timelineItems.length === 0) {
      console.log(`⚠️ 轨道 ${this.trackId} 没有片段需要整理`)
      return
    }

    // 按时间轴开始时间排序
    const sortedItems = [...this.timelineItems].sort((a, b) => {
      const rangeA = a.timeRange
      const rangeB = b.timeRange
      return rangeA.timelineStartTime - rangeB.timelineStartTime
    })

    let currentPositionFrames = 0
    for (const item of sortedItems) {
      const timeRange = item.timeRange
      // 使用帧数进行所有计算
      const durationFrames = timeRange.timelineEndTime - timeRange.timelineStartTime // 帧数

      // 计算新的时间范围（使用帧数）
      const newTimeRange = {
        ...timeRange,
        timelineStartTime: currentPositionFrames, // 帧数
        timelineEndTime: currentPositionFrames + durationFrames, // 帧数
      }

      // 检查是否需要移动（避免创建无意义的命令）
      const positionChanged =
        Math.abs(timeRange.timelineStartTime - newTimeRange.timelineStartTime) > 0 // 1帧误差容忍

      if (positionChanged) {
        const moveCommand = new MoveTimelineItemCommand(
          item.id,
          timeRange.timelineStartTime, // 原始位置（帧数）
          currentPositionFrames, // 新位置（帧数）
          this.trackId, // 轨道不变
          this.trackId,
          {
            updateTimelineItemPosition: this.timelineModule.updateTimelineItemPosition,
            getTimelineItem: this.timelineModule.getTimelineItem,
          },
          {
            getMediaItem: this.mediaModule.getMediaItem,
          },
        )
        this.addCommand(moveCommand)
      }

      currentPositionFrames += durationFrames
    }

    const track = this.trackModule.getTrack(this.trackId)
    console.log(
      `📋 准备自动排列轨道: ${track?.name || `轨道 ${this.trackId}`}, 需要移动 ${this.subCommands.length} 个项目`,
    )
  }
}

/**
 * 批量属性修改命令
 * 将多个属性修改操作组合为一个批量操作
 */
export class BatchUpdatePropertiesCommand extends BaseBatchCommand {
  constructor(targetItemIds: string[], updateCommands: SimpleCommand[]) {
    super(`批量修改 ${targetItemIds.length} 个项目的属性`)

    // 添加所有更新命令
    updateCommands.forEach((command) => this.addCommand(command))

    console.log(`📋 准备批量修改 ${this.subCommands.length} 个属性`)
  }
}
