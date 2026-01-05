/**
 * 缩略图核心算法工具函数
 */

import type { ThumbnailLayoutItem } from '@/core/types/thumbnail'
import { calculateVisibleFrameRange } from '@/core/utils/coordinateUtils'
import { THUMBNAIL_CONSTANTS } from '@/constants/ThumbnailConstants'

/**
 * 计算缩略图布局
 * @param clipStartFrame clip开始帧
 * @param clipDurationFrames clip时长（帧数）
 * @param clipWidthPixels clip像素宽度
 * @param thumbnailWidth 单个缩略图宽度（默认50px）
 * @returns 缩略图布局数组
 */
export function calculateThumbnailLayout(
  clipStartFrame: number,
  clipDurationFrames: number,
  clipWidthPixels: number,
  timelineStartFrame: number, // 必选参数：时间轴上的开始帧
  timelineDurationFrames: number, // 必选参数：时间轴上的结束帧
  thumbnailWidth: number = THUMBNAIL_CONSTANTS.WIDTH,
): ThumbnailLayoutItem[] {
  // 计算缩略图数量（至少1个，确保所有缩略图宽度之和 >= clip宽度）
  const thumbnailCount = Math.max(1, Math.ceil(clipWidthPixels / thumbnailWidth))

  // 计算每个缩略图对应的帧位置
  const layoutItems: ThumbnailLayoutItem[] = []
  const framesPerThumbnail = clipDurationFrames / thumbnailCount
  const tlFramesPerThumbnail = timelineDurationFrames / thumbnailCount

  for (let i = 0; i < thumbnailCount; i++) {
    // 计算当前缩略图对应的帧位置（clip内的帧位置）
    const framePosition = Math.floor(clipStartFrame + i * framesPerThumbnail)

    // 计算在时间轴上的帧位置
    const timelineFramePosition = Math.floor(timelineStartFrame + i * tlFramesPerThumbnail)

    // 计算像素位置（用于CSS定位）
    const pixelPosition = i * thumbnailWidth

    layoutItems.push({
      index: i,
      framePosition,
      timelineFramePosition,
      pixelPosition,
      thumbnailUrl: null,
    })
  }

  return layoutItems
}

/**
 * 过滤可见的缩略图
 * @param layoutItems 缩略图布局项数组
 * @param clipStartFrame clip开始帧
 * @param clipDurationFrames clip时长（帧数）
 * @param viewportStartFrame 视口开始帧
 * @param viewportEndFrame 视口结束帧
 * @returns 可见的缩略图布局项数组
 */
export function filterThumbnailVisible(
  layoutItems: ThumbnailLayoutItem[],
  clipStartFrame: number,
  clipDurationFrames: number,
  viewportStartFrame: number,
  viewportEndFrame: number,
): ThumbnailLayoutItem[] {
  const clipEndFrame = clipStartFrame + clipDurationFrames

  // 计算clip与视口的帧重叠范围
  const visibleStartFrame = Math.max(clipStartFrame, viewportStartFrame)
  const visibleEndFrame = Math.min(clipEndFrame, viewportEndFrame)

  // 过滤出可见的缩略图
  return layoutItems.filter((item) => {
    return (
      item.timelineFramePosition >=
        visibleStartFrame - THUMBNAIL_CONSTANTS.VISIBILITY_BUFFER_FRAMES &&
      item.timelineFramePosition <= visibleEndFrame + THUMBNAIL_CONSTANTS.VISIBILITY_BUFFER_FRAMES
    )
  })
}

/**
 * 计算视口帧范围（使用统一store的参数）
 * @param timelineWidth 时间轴宽度
 * @param totalDurationFrames 总时长帧数
 * @param zoomLevel 缩放级别
 * @param scrollOffset 滚动偏移量
 * @param maxVisibleDurationFrames 最大可见时长帧数
 * @returns 视口开始和结束帧
 */
export function calculateViewportFrameRange(
  timelineWidth: number,
  totalDurationFrames: number,
  zoomLevel: number,
  scrollOffset: number,
  maxVisibleDurationFrames?: number,
): { startFrames: number; endFrames: number } {
  return calculateVisibleFrameRange(
    timelineWidth,
    totalDurationFrames,
    zoomLevel,
    scrollOffset,
    maxVisibleDurationFrames,
  )
}

/**
 * 计算clip的像素宽度
 * @param clipDurationFrames clip时长帧数
 * @param timelineWidth 时间轴宽度
 * @param totalDurationFrames 总时长帧数
 * @param zoomLevel 缩放级别
 * @returns clip像素宽度
 */
export function calculateClipWidthPixels(
  clipDurationFrames: number,
  timelineWidth: number,
  totalDurationFrames: number,
  zoomLevel: number,
): number {
  const pixelsPerFrame = (timelineWidth * zoomLevel) / totalDurationFrames
  return clipDurationFrames * pixelsPerFrame
}

/**
 * 验证算法结果
 * @param layoutItems 缩略图布局项
 * @param clipWidthPixels clip像素宽度
 * @param thumbnailWidth 缩略图宽度
 * @returns 验证结果
 */
export function validateThumbnailLayout(
  layoutItems: ThumbnailLayoutItem[],
  clipWidthPixels: number,
  thumbnailWidth: number = THUMBNAIL_CONSTANTS.WIDTH,
): { isValid: boolean; issues: string[] } {
  const issues: string[] = []

  // 检查缩略图数量是否合理
  const expectedCount = Math.max(1, Math.floor(clipWidthPixels / thumbnailWidth))
  if (layoutItems.length !== expectedCount) {
    issues.push(`缩略图数量不匹配: 期望 ${expectedCount}, 实际 ${layoutItems.length}`)
  }

  // 检查缩略图位置是否在clip范围内
  layoutItems.forEach((item, index) => {
    if (item.pixelPosition < 0 || item.pixelPosition > clipWidthPixels) {
      issues.push(`缩略图 ${index} 位置超出clip范围: ${item.pixelPosition}px`)
    }

    if (item.pixelPosition !== index * thumbnailWidth) {
      issues.push(
        `缩略图 ${index} 位置不正确: 期望 ${index * thumbnailWidth}, 实际 ${item.pixelPosition}`,
      )
    }
  })

  return {
    isValid: issues.length === 0,
    issues,
  }
}

/**
 * 获取缩略图槽位样式
 * @param item 缩略图布局项
 * @param thumbnailWidth 缩略图宽度（默认50px）
 * @param thumbnailHeight 缩略图高度（默认30px）
 * @returns CSS样式对象
 */
export function getThumbnailSlotStyle(
  item: ThumbnailLayoutItem,
  thumbnailWidth: number = THUMBNAIL_CONSTANTS.WIDTH,
  thumbnailHeight: number = THUMBNAIL_CONSTANTS.HEIGHT,
): Record<string, string> {
  return {
    left: `${item.pixelPosition}px`,
    width: `${thumbnailWidth}px`,
    height: `${thumbnailHeight}px`,
  }
}
