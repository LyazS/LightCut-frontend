/**
 * 统一时间轴项目工厂函数
 * 支持混合类型系统的重构版本
 */

import { reactive, markRaw } from 'vue'
import { cloneDeep } from 'lodash'
import { generateUUID4 } from '@/core/utils/idGenerator'
import type { MediaType, UnifiedMediaItemData } from '@/core/mediaitem'
import type {
  VideoMediaConfig,
  ImageMediaConfig,
  AudioMediaConfig,
  TextMediaConfig,
  GetMediaConfig,
} from '@/core/timelineitem/type'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import type {
  UnifiedTimelineItemData,
  UnknownMediaConfig,
  TimelineItemStatus,
} from '@/core/timelineitem/type'
import type { AnimationConfig } from './animationtypes'
import { TimelineItemQueries } from '@/core/timelineitem/queries'
import { UnifiedMediaItemQueries } from '@/core/mediaitem'
import {
  createSpriteFromUnifiedTimelineItem,
  createSpriteFromUnifiedMediaItem,
} from '@/core/utils/spriteFactory'
import {
  createTextTimelineItem as createTextTimelineItemFromUtils,
  createSpriteForTextTimelineItem,
} from '@/core/utils/textTimelineUtils'
import { projectToWebavCoords } from '@/core/utils/coordinateUtils'

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
    config?: GetMediaConfig<T>
    timelineStatus?: 'loading' | 'ready' | 'error'
    animation?: AnimationConfig<T>
  },
): UnifiedTimelineItemData<T> {
  // 深拷贝原始对象，排除不需要克隆的 runtime 属性
  const cloned = cloneDeep({
    ...original,
    runtime: {}, // 明确排除 runtime，它需要重新创建
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

  const newConfig: GetMediaConfig<T> = {
    ...original.config,
  }

  return cloneTimelineItem(original, {
    id: generateUUID4(),
    trackId: newTrackId,
    timeRange: newTimeRange,
    config: newConfig,
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
  /** 设置精灵的函数 */
  setupTimelineItemSprite: (item: UnifiedTimelineItemData<MediaType>) => Promise<void>
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
 * 为命令场景重建时间轴项目（总是创建 loading 状态）
 * 用于命令执行和项目加载场景，确保状态转换的一致性
 *
 * @param options 重建选项
 * @returns 重建结果，TimelineItem 总是 loading 状态（文本项目除外）
 */
export async function rebuildTimelineItemForCmd(
  options: RebuildKnownTimelineItemOptions,
): Promise<RebuildKnownTimelineItemResult> {
  const { originalTimelineItemData, getMediaItem, setupTimelineItemSprite, logIdentifier } = options

  try {
    if (!originalTimelineItemData) {
      throw new Error('时间轴项目数据不存在')
    }

    console.log(`🔄 [${logIdentifier}] 开始重建时间轴项目（统一loading状态）...`)

    if (TimelineItemQueries.isTextTimelineItem(originalTimelineItemData)) {
      // 文本项目也创建 loading 状态，由 TimelineItemTransitioner 统一处理
      console.log(`🔄 [${logIdentifier}] 检测到文本时间轴项目，创建loading状态`)

      const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
        timelineStatus: 'loading',
      })

      return {
        timelineItem: newTimelineItem,
        success: true,
      }
    } else {
      // 非文本项目：总是创建 loading 状态，不再根据媒体状态决定
      console.log(`🔄 [${logIdentifier}] 创建loading状态的时间轴项目`)

      const newTimelineItem = cloneTimelineItem(originalTimelineItemData, {
        timelineStatus: 'loading',
      }) as UnifiedTimelineItemData<MediaType>

      console.log(`🔄 [${logIdentifier}] loading状态时间轴项目创建完成:`, {
        id: newTimelineItem.id,
        mediaType: originalTimelineItemData.mediaType,
        timelineStatus: newTimelineItem.timelineStatus,
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

/**
 * 重建文本时间轴项目
 * 从原始配置重新创建文本TimelineItem和sprite
 *
 * @param options 重建选项
 * @returns 重建结果
 */
export async function rebuildTextTimelineItem(
  options: RebuildTextTimelineItemOptions,
): Promise<RebuildTextTimelineItemResult> {
  const { originalTimelineItemData, videoResolution, logIdentifier } = options

  try {
    if (!originalTimelineItemData) {
      throw new Error('文本时间轴项目数据不存在')
    }

    if (originalTimelineItemData.mediaType !== 'text') {
      throw new Error('不是文本项目，无法使用文本重建方法')
    }

    console.log(`🔄 [${logIdentifier}] 开始重建文本时间轴项目...`)

    const originalConfig = originalTimelineItemData.config as TextMediaConfig
    const originalTimeRange = originalTimelineItemData.timeRange

    // 计算duration（显示时长）
    const duration = originalTimeRange.timelineEndTime - originalTimeRange.timelineStartTime

    // 直接使用 createTextTimelineItemFromUtils 重建，传入原始ID以保持一致性
    const newTimelineItem = await createTextTimelineItemFromUtils(
      originalConfig.text,
      originalConfig.style,
      originalTimeRange.timelineStartTime,
      originalTimelineItemData.trackId || '',
      duration,
      videoResolution,
      originalTimelineItemData.id, // 传入原始ID
    )

    // 恢复原始的位置、尺寸和其他属性（createTextTimelineItemFromUtils 创建的是默认位置）
    newTimelineItem.config.x = originalConfig.x
    newTimelineItem.config.y = originalConfig.y
    newTimelineItem.config.width = originalConfig.width
    newTimelineItem.config.height = originalConfig.height
    newTimelineItem.config.rotation = originalConfig.rotation
    newTimelineItem.config.opacity = originalConfig.opacity
    newTimelineItem.config.zIndex = originalConfig.zIndex
    newTimelineItem.config.originalWidth = originalConfig.originalWidth
    newTimelineItem.config.originalHeight = originalConfig.originalHeight
    newTimelineItem.config.proportionalScale = originalConfig.proportionalScale

    // 恢复动画配置（如果存在）
    if (originalTimelineItemData.animation) {
      newTimelineItem.animation = originalTimelineItemData.animation
    }

    // 同步更新sprite的属性以匹配配置（使用坐标转换）
    if (newTimelineItem.runtime.sprite) {
      const sprite = newTimelineItem.runtime.sprite as any

      // 获取画布分辨率
      const canvasWidth = videoResolution.width
      const canvasHeight = videoResolution.height

      // 使用坐标转换将项目坐标系转换为WebAV坐标系
      const webavCoords = projectToWebavCoords(
        originalConfig.x,
        originalConfig.y,
        originalConfig.width,
        originalConfig.height,
        canvasWidth,
        canvasHeight,
      )

      sprite.rect.x = webavCoords.x
      sprite.rect.y = webavCoords.y
      sprite.rect.w = originalConfig.width
      sprite.rect.h = originalConfig.height
      sprite.rect.angle = originalConfig.rotation
      sprite.opacity = originalConfig.opacity
      sprite.zIndex = originalConfig.zIndex

      // 恢复时间范围
      sprite.setTimeRange(originalTimeRange)
    }

    console.log(`🔄 [${logIdentifier}] 重建文本时间轴项目完成:`, {
      id: newTimelineItem.id,
      text: originalConfig.text.substring(0, 20) + '...',
      timeRange: originalTimeRange,
      position: { x: originalConfig.x, y: originalConfig.y },
      size: { w: originalConfig.width, h: originalConfig.height },
    })

    return {
      timelineItem: newTimelineItem,
      success: true,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ [${logIdentifier}] 重建文本时间轴项目失败:`, errorMessage)

    return {
      timelineItem: originalTimelineItemData,
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
  rebuildText: rebuildTextTimelineItem,
  rebuildForCmd: rebuildTimelineItemForCmd,
}
