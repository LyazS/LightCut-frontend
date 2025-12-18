/**
 * 统一时间范围工具函数
 * 基于新架构的统一类型系统，适用于UnifiedTimelineItemData
 */

import type { UnifiedTimelineItemData } from '@/core/timelineitem/TimelineItemData'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import { TimelineItemQueries } from '@/core/timelineitem/TimelineItemQueries'

// ==================== 时间范围同步工具 ====================

/**
 * 同步UnifiedTimelineItem和sprite的timeRange
 * 确保两者的时间范围信息保持一致
 * @param timelineItem UnifiedTimelineItemData实例
 * @param newTimeRange 新的时间范围（可选，如果不提供则从sprite获取）
 */
export function syncTimeRange(
  timelineItem: UnifiedTimelineItemData,
  newTimeRange?: Partial<UnifiedTimeRange>,
): void {
  // 只有就绪状态的时间轴项目才有sprite
  if (!TimelineItemQueries.isReady(timelineItem) || !timelineItem.runtime.sprite) {
    // 对于非就绪状态的项目，直接更新timeRange
    if (newTimeRange) {
      const completeTimeRange = {
        ...timelineItem.timeRange,
        ...newTimeRange,
      }

      // 验证时间范围有效性
      if (completeTimeRange.timelineEndTime <= completeTimeRange.timelineStartTime) {
        console.warn('⚠️ 无效的时间范围：结束时间必须大于开始时间', completeTimeRange)
        return
      }

      if (completeTimeRange.timelineStartTime < 0) {
        console.warn('⚠️ 无效的时间范围：开始时间不能为负数', completeTimeRange)
        return
      }

      timelineItem.timeRange = completeTimeRange

      console.log('🔄 同步timeRange (非就绪状态):', {
        timelineItemId: timelineItem.id,
        status: timelineItem.timelineStatus,
        timeRange: completeTimeRange,
      })
    }
    return
  }

  const sprite = timelineItem.runtime.sprite

  if (newTimeRange) {
    // 如果提供了新的时间范围，同时更新sprite和TimelineItem
    const completeTimeRange = {
      ...sprite.getTimeRange(),
      ...newTimeRange,
    }

    // 验证时间范围有效性
    if (completeTimeRange.timelineEndTime <= completeTimeRange.timelineStartTime) {
      console.warn('⚠️ 无效的时间范围：结束时间必须大于开始时间', completeTimeRange)
      return
    }

    if (completeTimeRange.timelineStartTime < 0) {
      console.warn('⚠️ 无效的时间范围：开始时间不能为负数', completeTimeRange)
      return
    }

    // sprite.setTimeRange会在内部自动计算effectiveDuration
    sprite.setTimeRange(completeTimeRange)
    // 从sprite获取更新后的完整timeRange（包含自动计算的effectiveDuration）
    timelineItem.timeRange = sprite.getTimeRange()

    console.log('🔄 同步timeRange (提供新值):', {
      timelineItemId: timelineItem.id,
      status: timelineItem.timelineStatus,
      timeRange: completeTimeRange,
    })
  } else {
    // 如果没有提供新值，从sprite同步到TimelineItem
    const spriteTimeRange = sprite.getTimeRange()
    timelineItem.timeRange = spriteTimeRange

    console.log('🔄 同步timeRange (从sprite获取):', {
      timelineItemId: timelineItem.id,
      status: timelineItem.timelineStatus,
      timeRange: spriteTimeRange,
    })
  }
}

// ==================== 时间范围计算工具 ====================

/**
 * 计算时间轴项目的持续时长（帧数）
 * @param timelineItem UnifiedTimelineItemData实例
 * @returns 持续时长（帧数）
 */
export function calculateDuration(timelineItem: UnifiedTimelineItemData): number {
  return timelineItem.timeRange.timelineEndTime - timelineItem.timeRange.timelineStartTime
}
