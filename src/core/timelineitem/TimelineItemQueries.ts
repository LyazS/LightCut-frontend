/**
 * 统一时间轴项目查询工具函数
 * 提供各种查询和计算功能的纯函数
 */

import type { MediaType } from '@/core/mediaitem'
import type {
  UnifiedTimelineItemData,
  TimelineItemStatus,
} from '@/core/timelineitem/TimelineItemData'
import { TimelineStatusDisplayUtils } from '@/core/timelineitem/TimelineStatusDisplayUtils'
import { useUnifiedStore } from '@/core/unifiedStore'

// ==================== 类型守卫函数 ====================

/**
 * 媒体类型特定的类型守卫
 */
export function isVideoTimelineItem(
  item: UnifiedTimelineItemData<MediaType>,
): item is UnifiedTimelineItemData<'video'> {
  return item.mediaType === 'video'
}

export function isImageTimelineItem(
  item: UnifiedTimelineItemData<MediaType>,
): item is UnifiedTimelineItemData<'image'> {
  return item.mediaType === 'image'
}

export function isAudioTimelineItem(
  item: UnifiedTimelineItemData<MediaType>,
): item is UnifiedTimelineItemData<'audio'> {
  return item.mediaType === 'audio'
}

export function isTextTimelineItem(
  item: UnifiedTimelineItemData<MediaType>,
): item is UnifiedTimelineItemData<'text'> {
  return item.mediaType === 'text'
}

/**
 * 检查是否为具有视觉属性的时间轴项目（video, image, text）
 */
export function hasVisualProperties(
  item: UnifiedTimelineItemData<MediaType>,
): item is
  | UnifiedTimelineItemData<'video'>
  | UnifiedTimelineItemData<'image'>
  | UnifiedTimelineItemData<'text'> {
  return isVideoTimelineItem(item) || isImageTimelineItem(item) || isTextTimelineItem(item)
}

/**
 * 检查是否为具有音频属性的时间轴项目（video, audio）
 */
export function hasAudioProperties(
  item: UnifiedTimelineItemData<MediaType>,
): item is UnifiedTimelineItemData<'video'> | UnifiedTimelineItemData<'audio'> {
  return isVideoTimelineItem(item) || isAudioTimelineItem(item)
}

// ==================== 状态查询函数 ====================

/**
 * 检查是否为就绪状态
 */
export function isReady(data: UnifiedTimelineItemData<MediaType>): boolean {
  return data.timelineStatus === 'ready' && !!data.runtime.sprite
}

/**
 * 检查是否正在加载
 */
export function isLoading(data: UnifiedTimelineItemData<MediaType>): boolean {
  return data.timelineStatus === 'loading'
}

/**
 * 检查是否有错误
 */
export function hasError(data: UnifiedTimelineItemData<MediaType>): boolean {
  return data.timelineStatus === 'error'
}

/**
 * 检查是否可以播放
 */
export function canPlay(data: UnifiedTimelineItemData<MediaType>): boolean {
  return isReady(data) && hasValidTimeRange(data)
}

/**
 * 检查是否可以编辑
 */
export function canEdit(data: UnifiedTimelineItemData<MediaType>): boolean {
  return data.timelineStatus !== 'loading'
}

/**
 * 获取状态显示文本
 */
export function getStatusText(data: UnifiedTimelineItemData<MediaType>): string {
  const unifiedStore = useUnifiedStore()
  const mediaData = unifiedStore.getMediaItem(data.mediaItemId)
  return mediaData ? TimelineStatusDisplayUtils.getStatusText(mediaData) : '未知状态'
}

/**
 * 获取进度信息
 */
export function getProgressInfo(data: UnifiedTimelineItemData<MediaType>): {
  hasProgress: boolean
  percent: number
  text: string
} {
  const unifiedStore = useUnifiedStore()
  const mediaData = unifiedStore.getMediaItem(data.mediaItemId)
  if (!mediaData) {
    return { hasProgress: false, percent: 0, text: '' }
  }

  const progressInfo = TimelineStatusDisplayUtils.getProgressInfo(mediaData)
  if (!progressInfo.hasProgress) {
    return { hasProgress: false, percent: 0, text: '' }
  }

  const text = progressInfo.speed
    ? `${progressInfo.percent}% (${progressInfo.speed})`
    : `${progressInfo.percent}%`

  return {
    hasProgress: true,
    percent: progressInfo.percent,
    text,
  }
}

/**
 * 获取错误信息
 */
export function getErrorInfo(data: UnifiedTimelineItemData<MediaType>): {
  hasError: boolean
  message: string
  recoverable: boolean
} {
  const unifiedStore = useUnifiedStore()
  const mediaData = unifiedStore.getMediaItem(data.mediaItemId)
  if (!mediaData) {
    return { hasError: false, message: '', recoverable: false }
  }

  const errorInfo = TimelineStatusDisplayUtils.getErrorInfo(mediaData)
  return {
    hasError: errorInfo.hasError,
    message: errorInfo.message || '',
    recoverable: errorInfo.recoverable || false,
  }
}

// ==================== 时间范围查询函数 ====================

/**
 * 获取项目持续时间（帧数）
 */
export function getDuration(data: UnifiedTimelineItemData<MediaType>): number {
  return data.timeRange.timelineEndTime - data.timeRange.timelineStartTime
}

/**
 * 获取项目持续时间（秒）
 */
export function getDurationInSeconds(
  data: UnifiedTimelineItemData<MediaType>,
  frameRate: number = 30,
): number {
  return getDuration(data) / frameRate
}

/**
 * 检查时间范围是否有效
 */
export function hasValidTimeRange(data: UnifiedTimelineItemData<MediaType>): boolean {
  return (
    data.timeRange.timelineEndTime > data.timeRange.timelineStartTime &&
    data.timeRange.timelineStartTime >= 0
  )
}

/**
 * 检查是否与另一个项目在时间上重叠
 */
export function isOverlapping(
  data1: UnifiedTimelineItemData<MediaType>,
  data2: UnifiedTimelineItemData<MediaType>,
): boolean {
  // 不同轨道不算重叠
  if (data1.trackId !== data2.trackId) {
    return false
  }

  const start1 = data1.timeRange.timelineStartTime
  const end1 = data1.timeRange.timelineEndTime
  const start2 = data2.timeRange.timelineStartTime
  const end2 = data2.timeRange.timelineEndTime

  return start1 < end2 && start2 < end1
}

/**
 * 检查指定时间点是否在项目范围内
 */
export function containsTime(data: UnifiedTimelineItemData<MediaType>, time: number): boolean {
  return time >= data.timeRange.timelineStartTime && time < data.timeRange.timelineEndTime
}

/**
 * 获取项目在时间轴上的位置信息
 */
export function getTimelinePosition(data: UnifiedTimelineItemData<MediaType>): {
  startTime: number
  endTime: number
  duration: number
  centerTime: number
} {
  const startTime = data.timeRange.timelineStartTime
  const endTime = data.timeRange.timelineEndTime
  const duration = endTime - startTime
  const centerTime = startTime + duration / 2

  return { startTime, endTime, duration, centerTime }
}

// ==================== 配置查询函数 ====================

/**
 * 获取变换配置
 */
export function getTransform(data: UnifiedTimelineItemData<MediaType>) {
  // 只有视觉媒体类型（video, image, text）才有变换配置
  if (hasVisualProperties(data)) {
    const config = data.config
    return {
      x: config.x ?? 0,
      y: config.y ?? 0,
      width: config.width ?? 1920,
      height: config.height ?? 1080,
      rotation: config.rotation ?? 0,
      opacity: config.opacity ?? 1,
      zIndex: config.zIndex ?? 0,
    }
  }
  return {}
}

/**
 * 获取透明度
 */
export function getOpacity(data: UnifiedTimelineItemData<MediaType>): number {
  // 只有视觉媒体类型（video, image, text）才有透明度
  if (hasVisualProperties(data)) {
    return data.config.opacity ?? 1
  }
  return 1
}

/**
 * 获取音量
 */
export function getVolume(data: UnifiedTimelineItemData<MediaType>): number {
  // 只有视频和音频类型的项目才有音量配置
  if (hasAudioProperties(data)) {
    return data.config.volume ?? 1
  }
  return 1
}

/**
 * 检查是否静音
 */
export function isMuted(data: UnifiedTimelineItemData<MediaType>): boolean {
  // 只有视频和音频类型的项目才有静音配置
  if (hasAudioProperties(data)) {
    return data.config.isMuted ?? false
  }
  return false
}

/**
 * 获取视频裁剪信息
 * 注意：当前的配置结构中，裁剪信息存储在 timeRange 中，而不是 config 中
 */
export function getVideoClip(data: UnifiedTimelineItemData<MediaType>): {
  hasClip: boolean
  startTime?: number
  endTime?: number
  duration?: number
} {
  // 只有视频类型的项目才可能有裁剪配置
  if (!isVideoTimelineItem(data)) {
    return { hasClip: false }
  }

  // 检查时间范围是否包含裁剪信息
  const timeRange = data.timeRange

  // 对于视频和音频，clipStartTime和clipEndTime不为-1表示有裁剪
  if (data.mediaType === 'video' || data.mediaType === 'audio') {
    const startTime = timeRange.clipStartTime
    const endTime = timeRange.clipEndTime
    const duration = endTime - startTime

    return {
      hasClip: true,
      startTime,
      endTime,
      duration,
    }
  }

  return { hasClip: false }
}

// ==================== 批量查询函数 ====================

/**
 * 过滤指定状态的项目
 */
export function filterByStatus(
  items: UnifiedTimelineItemData<MediaType>[],
  status: TimelineItemStatus,
): UnifiedTimelineItemData<MediaType>[] {
  return items.filter((item) => item.timelineStatus === status)
}

/**
 * 过滤指定轨道的项目
 */
export function filterByTrack(
  items: UnifiedTimelineItemData<MediaType>[],
  trackId: string,
): UnifiedTimelineItemData<MediaType>[] {
  return items.filter((item) => item.trackId === trackId)
}

/**
 * 过滤指定媒体类型的项目
 */
export function filterByMediaType(
  items: UnifiedTimelineItemData<MediaType>[],
  mediaType: string,
): UnifiedTimelineItemData<MediaType>[] {
  return items.filter((item) => item.mediaType === mediaType)
}

/**
 * 按时间排序项目
 */
export function sortByTime(
  items: UnifiedTimelineItemData<MediaType>[],
): UnifiedTimelineItemData<MediaType>[] {
  return [...items].sort((a, b) => a.timeRange.timelineStartTime - b.timeRange.timelineStartTime)
}

/**
 * 查找指定时间点的所有项目
 */
export function findItemsAtTime(
  items: UnifiedTimelineItemData<MediaType>[],
  time: number,
): UnifiedTimelineItemData<MediaType>[] {
  return items.filter((item) => containsTime(item, time))
}

/**
 * 查找与指定项目重叠的所有项目
 */
export function findOverlappingItems(
  items: UnifiedTimelineItemData<MediaType>[],
  targetItem: UnifiedTimelineItemData<MediaType>,
): UnifiedTimelineItemData<MediaType>[] {
  return items.filter((item) => item.id !== targetItem.id && isOverlapping(item, targetItem))
}

/**
 * 获取轨道的时间范围统计
 */
export function getTrackTimeStats(
  items: UnifiedTimelineItemData<MediaType>[],
  trackId: string,
): {
  itemCount: number
  totalDuration: number
  earliestStart: number
  latestEnd: number
  gaps: Array<{ start: number; end: number; duration: number }>
} {
  const trackItems = filterByTrack(items, trackId)

  if (trackItems.length === 0) {
    return {
      itemCount: 0,
      totalDuration: 0,
      earliestStart: 0,
      latestEnd: 0,
      gaps: [],
    }
  }

  const sortedItems = sortByTime(trackItems)
  const totalDuration = trackItems.reduce((sum, item) => sum + getDuration(item), 0)
  const earliestStart = sortedItems[0].timeRange.timelineStartTime
  const latestEnd = sortedItems[sortedItems.length - 1].timeRange.timelineEndTime

  // 计算间隙
  const gaps: Array<{ start: number; end: number; duration: number }> = []
  for (let i = 0; i < sortedItems.length - 1; i++) {
    const currentEnd = sortedItems[i].timeRange.timelineEndTime
    const nextStart = sortedItems[i + 1].timeRange.timelineStartTime

    if (nextStart > currentEnd) {
      gaps.push({
        start: currentEnd,
        end: nextStart,
        duration: nextStart - currentEnd,
      })
    }
  }

  return {
    itemCount: trackItems.length,
    totalDuration,
    earliestStart,
    latestEnd,
    gaps,
  }
}

// ==================== 导出查询工具集合 ====================

export const TimelineItemQueries = {
  // 类型守卫
  isVideoTimelineItem,
  isImageTimelineItem,
  isAudioTimelineItem,
  isTextTimelineItem,
  hasVisualProperties,
  hasAudioProperties,

  // 状态查询
  isReady,
  isLoading,
  hasError,
  canPlay,
  canEdit,
  getStatusText,
  getProgressInfo,
  getErrorInfo,

  // 时间查询
  getDuration,
  getDurationInSeconds,
  hasValidTimeRange,
  isOverlapping,
  containsTime,
  getTimelinePosition,

  // 配置查询
  getTransform,
  getOpacity,
  getVolume,
  isMuted,
  getVideoClip,

  // 批量查询
  filterByStatus,
  filterByTrack,
  filterByMediaType,
  sortByTime,
  findItemsAtTime,
  findOverlappingItems,
  getTrackTimeStats,
}
