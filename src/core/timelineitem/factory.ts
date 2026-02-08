/**
 * 统一时间轴项目工厂函数
 * 支持混合类型系统的重构版本
 */

import { reactive, markRaw } from 'vue'
import { cloneDeep } from 'lodash'
import { generateTimelineItemId } from '@/core/utils/idGenerator'
import type { MediaType, UnifiedMediaItemData } from '@/core/mediaitem'
import type {
  VideoMediaConfig,
  ImageMediaConfig,
  AudioMediaConfig,
  TextMediaConfig,
  GetConfigs,
} from '@/core/timelineitem/type'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import type { UnifiedTimelineItemData, TimelineItemStatus } from '@/core/timelineitem/type'
import type { GetAnimation } from './bunnytype'
import { TimelineItemQueries } from '@/core/timelineitem/queries'
import { MediaItemQueries } from '@/core/mediaitem'
import { createTextTimelineItem as createTextTimelineItemFromUtils } from '@/core/utils/textTimelineUtils'
import { setupTimelineItemBunny } from '@/core/bunnyUtils/timelineItemSetup'

// ==================== 克隆和复制函数 ====================

/**
 * 克隆时间轴项目（深拷贝）
 * 使用 lodash.cloneDeep 确保完整的深拷贝
 */
export function cloneTimelineItem<T extends MediaType>(
  original: UnifiedTimelineItemData<T>,
  overrides?: {
    id?: string
    mediaItemId?: string
    trackId?: string
    timeRange?: UnifiedTimeRange
    config?: GetConfigs<T>
    timelineStatus?: 'loading' | 'ready' | 'error'
    animation?: GetAnimation<T>
  },
): UnifiedTimelineItemData<T> {
  // 深拷贝原始对象，排除不需要克隆的 runtime 属性
  const cloned = cloneDeep({
    ...original,
    runtime: {
      // ✅ 只保留 isInitialized，其他 runtime 字段（bunnyClip、textBitmap 等）会在后续重建
      isInitialized: original.runtime.isInitialized,
    },
  })

  // 应用覆盖值
  const result = {
    ...cloned,
    id: overrides?.id || cloned.id,
    mediaItemId: overrides?.mediaItemId || cloned.mediaItemId,
    trackId: overrides?.trackId || cloned.trackId,
    timelineStatus: overrides?.timelineStatus || cloned.timelineStatus,
    timeRange: overrides?.timeRange ? cloneDeep(overrides.timeRange) : cloned.timeRange,
    config: overrides?.config ? cloneDeep(overrides.config) : cloned.config,
    animation: overrides?.animation ? cloneDeep(overrides.animation) : cloned.animation,
  }

  return reactive(result) as UnifiedTimelineItemData<T>
}

export function setTimeRange(item: UnifiedTimelineItemData, timerange: Partial<UnifiedTimeRange>) {
  if (timerange.timelineStartTime !== undefined && timerange.timelineStartTime !== null)
    item.timeRange.timelineStartTime = timerange.timelineStartTime
  if (timerange.timelineEndTime !== undefined && timerange.timelineEndTime !== null)
    item.timeRange.timelineEndTime = timerange.timelineEndTime
  if (timerange.clipStartTime !== undefined && timerange.clipStartTime !== null)
    item.timeRange.clipStartTime = timerange.clipStartTime
  if (timerange.clipEndTime !== undefined && timerange.clipEndTime !== null)
    item.timeRange.clipEndTime = timerange.clipEndTime
  item.runtime.bunnyClip?.setTimeRange({
    clipStart: BigInt(item.timeRange.clipStartTime),
    clipEnd: BigInt(item.timeRange.clipEndTime),
    timelineStart: BigInt(item.timeRange.timelineStartTime),
    timelineEnd: BigInt(item.timeRange.timelineEndTime),
  })
}

/**
 * 复制时间轴项目到新轨道
 */
export function duplicateTimelineItem<T extends MediaType>(
  original: UnifiedTimelineItemData<T>,
  newTrackId: string,
  timeOffset: number = 0,
): UnifiedTimelineItemData<T> {
  const newTimeRange: UnifiedTimeRange = {
    ...original.timeRange,
    timelineStartTime: original.timeRange.timelineStartTime + timeOffset,
    timelineEndTime: original.timeRange.timelineEndTime + timeOffset,
  }

  return cloneTimelineItem(original, {
    id: generateTimelineItemId(),
    trackId: newTrackId,
    timeRange: newTimeRange,
  })
}

// ==================== 验证函数 ====================

/**
 * 验证时间轴项目数据的有效性
 */
export function validateTimelineItem<T extends MediaType>(
  item: UnifiedTimelineItemData<T>,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  // 检查必需字段
  if (!item.id) {
    errors.push('缺少ID')
  }

  if (!item.mediaItemId) {
    errors.push('缺少关联的媒体项目ID')
  }

  if (!item.trackId) {
    errors.push('缺少轨道ID')
  }

  // 配置验证（根据媒体类型进行不同的验证）
  if (!item.config) {
    errors.push('缺少配置信息')
  }

  // 检查时间范围
  if (item.timeRange.timelineStartTime < 0) {
    errors.push('时间轴开始时间不能为负数')
  }

  if (item.timeRange.timelineEndTime <= item.timeRange.timelineStartTime) {
    errors.push('时间轴结束时间必须大于开始时间')
  }

  // 检查媒体类型特定的配置
  // 已知媒体类型的额外验证
  const knownItem = item as UnifiedTimelineItemData<MediaType>

  if (knownItem.mediaType === 'video' || knownItem.mediaType === 'audio') {
    const timeRange = knownItem.timeRange
    if (timeRange.clipStartTime < 0) {
      errors.push('素材开始时间不能为负数')
    }
    if (timeRange.clipEndTime <= timeRange.clipStartTime) {
      errors.push('素材结束时间必须大于开始时间')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// ==================== 重建时间轴项目函数 ====================

/**
 * 重建已知时间轴项目的选项接口
 */
export interface RebuildKnownTimelineItemOptions {
  /** 原始时间轴项目数据 */
  originalTimelineItemData: UnifiedTimelineItemData<MediaType>
  /** 获取媒体项目的函数 */
  getMediaItem: (id: string) => UnifiedMediaItemData | undefined
  /** 日志标识符，用于区分不同调用方的日志 */
  logIdentifier: string
}

/**
 * 重建已知时间轴项目的结果接口
 */
export interface RebuildKnownTimelineItemResult {
  /** 重建后的时间轴项目 */
  timelineItem: UnifiedTimelineItemData<MediaType>
  /** 是否成功 */
  success: boolean
  /** 错误信息（如果有） */
  error?: string
}

/**
 * 重建文本时间轴项目的选项接口
 */
export interface RebuildTextTimelineItemOptions {
  /** 原始时间轴项目数据 */
  originalTimelineItemData: UnifiedTimelineItemData<'text'>
  /** 视频分辨率配置 */
  videoResolution: { width: number; height: number }
  /** 日志标识符，用于区分不同调用方的日志 */
  logIdentifier: string
}

/**
 * 重建文本时间轴项目的结果接口
 */
export interface RebuildTextTimelineItemResult {
  /** 重建后的时间轴项目 */
  timelineItem: UnifiedTimelineItemData<'text'>
  /** 是否成功 */
  success: boolean
  /** 错误信息（如果有） */
  error?: string
}

/**
 * 为命令场景重建时间轴项目（智能决定初始状态）
 * 用于命令执行和项目加载场景，根据原始数据初始化状态和媒体状态智能决定 TimelineItem 的初始状态
 *
 * 状态决策逻辑：
 * 1. 文本项目 → 直接返回 ready 状态（不依赖外部媒体）
 * 2. originalData.isInitialized === true && mediaItem.ready → 返回 ready 状态
 * 3. 其他所有情况 → 返回 loading 状态（需要 MediaSync）
 *
 * 决策矩阵：
 * | originalData.isInitialized | mediaItem状态 | 返回状态 | isInitialized | 说明 |
 * |---------------------------|--------------|---------|---------------|------|
 * | false | ready   | loading | false | 需要同步数据，即使媒体已就绪 |
 * | false | loading | loading | false | 需要等待并同步 |
 * | true  | ready   | ready   | true  | 已初始化且媒体就绪，直接完成 |
 * | true  | loading | loading | true  | 已初始化，只需等待媒体就绪，不需要重新同步数据 |
 *
 * @param options 重建选项
 * @returns 重建结果，TimelineItem 状态根据两个维度智能决定
 */
export async function rebuildTimelineItemForCmd(
  options: RebuildKnownTimelineItemOptions,
): Promise<RebuildKnownTimelineItemResult> {
  const { originalTimelineItemData, getMediaItem, logIdentifier } = options

  try {
    if (!originalTimelineItemData) {
      throw new Error('时间轴项目数据不存在')
    }

    console.log(`🔄 [${logIdentifier}] 开始重建时间轴项目（智能状态决策）...`)

    // 1. 文本项目特殊处理：直接返回 ready 状态
    if (TimelineItemQueries.isTextTimelineItem(originalTimelineItemData)) {
      console.log(`✅ [${logIdentifier}] 文本项目直接创建为 ready 状态`)

      const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
        timelineStatus: 'ready',
      })
      await setupTimelineItemBunny(newTimelineItem)
      newTimelineItem.runtime.isInitialized = true

      return {
        timelineItem: newTimelineItem,
        success: true,
      }
    }

    // 2. 非文本项目：检查媒体状态
    const mediaItem = getMediaItem(originalTimelineItemData.mediaItemId)

    if (!mediaItem) {
      throw new Error(`找不到媒体项目: ${originalTimelineItemData.mediaItemId}`)
    }

    // 3. 同时考虑原始数据的初始化状态和媒体状态
    const isOriginalInitialized = originalTimelineItemData.runtime.isInitialized
    const isMediaReady = MediaItemQueries.isReady(mediaItem)

    // 只有当原始数据已初始化 AND 媒体已就绪时，才返回 ready 状态
    if (isOriginalInitialized && isMediaReady) {
      const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
        timelineStatus: 'ready',
      }) as UnifiedTimelineItemData<MediaType>

      // 为 ready 状态的 TimelineItem 设置 bunny 对象
      // 这一步不能省略，否则 TimelineItem 无法渲染
      await setupTimelineItemBunny(newTimelineItem, mediaItem)
      newTimelineItem.runtime.isInitialized = true

      return {
        timelineItem: newTimelineItem,
        success: true,
      }
    } else {
      // ⚠️ 其他所有情况：返回 loading 状态，等待 MediaSync 处理
      // - originalData未初始化 + media已ready → loading（需要同步数据）
      // - originalData未初始化 + media未ready → loading（需要等待并同步）
      // - originalData已初始化 + media未ready → loading（只需等待媒体就绪，不需要同步）

      let reason = ''
      if (!isOriginalInitialized && isMediaReady) {
        reason = '原始数据未初始化，需要从媒体同步数据'
      } else if (!isOriginalInitialized && !isMediaReady) {
        reason = '原始数据未初始化且媒体未就绪，需要等待并同步'
      } else if (isOriginalInitialized && !isMediaReady) {
        reason = '原始数据已初始化但媒体未就绪，只需等待媒体加载（不需要同步数据）'
      }

      console.log(`🔄 [${logIdentifier}] 创建 loading 状态: ${reason}`, {
        isOriginalInitialized,
        mediaStatus: mediaItem.mediaStatus,
      })

      const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
        timelineStatus: 'loading',
      }) as UnifiedTimelineItemData<MediaType>

      // ⚠️ 关键：保持原始数据的 isInitialized 状态
      // - 如果原始数据未初始化 → isInitialized = false（需要同步）
      // - 如果原始数据已初始化 → isInitialized = true（只需等待，不需要同步）
      newTimelineItem.runtime.isInitialized = isOriginalInitialized

      console.log(`🔄 [${logIdentifier}] loading 状态时间轴项目创建完成:`, {
        id: newTimelineItem.id,
        mediaType: originalTimelineItemData.mediaType,
        timelineStatus: newTimelineItem.timelineStatus,
        isInitialized: newTimelineItem.runtime.isInitialized,
        mediaStatus: mediaItem.mediaStatus,
      })

      return {
        timelineItem: newTimelineItem,
        success: true,
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ [${logIdentifier}] 重建时间轴项目失败:`, errorMessage)

    return {
      timelineItem: originalTimelineItemData as UnifiedTimelineItemData<MediaType>,
      success: false,
      error: errorMessage,
    }
  }
}

// ==================== 导出工厂对象 ====================

export const TimelineItemFactory = {
  // 工具函数
  clone: cloneTimelineItem,
  setTimeRange: setTimeRange,
  duplicate: duplicateTimelineItem,
  validate: validateTimelineItem,
  rebuildForCmd: rebuildTimelineItemForCmd,
}
