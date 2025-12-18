// ==================== 坐标转换工具 ====================

/**
 * 计算可见时间范围（帧数版本）
 * @param timelineWidth 时间轴宽度（像素）
 * @param totalDurationFrames 总时长（帧数）
 * @param zoomLevel 缩放级别
 * @param scrollOffset 滚动偏移量（像素）
 * @param maxVisibleDurationFrames 最大可见时长（帧数）
 * @returns 可见时间范围 { startFrames, endFrames }
 */
export function calculateVisibleFrameRange(
  timelineWidth: number,
  totalDurationFrames: number,
  zoomLevel: number,
  scrollOffset: number,
  maxVisibleDurationFrames?: number,
): { startFrames: number; endFrames: number } {
  const pixelsPerFrame = (timelineWidth * zoomLevel) / totalDurationFrames
  const startFrames = Math.floor(scrollOffset / pixelsPerFrame)
  const calculatedEndFrames = startFrames + Math.ceil(timelineWidth / pixelsPerFrame)
  const endFrames = maxVisibleDurationFrames
    ? Math.min(calculatedEndFrames, maxVisibleDurationFrames)
    : calculatedEndFrames

  return { startFrames, endFrames }
}

/**
 * 将帧数转换为像素位置（考虑缩放和滚动）
 * @param frames 帧数
 * @param timelineWidth 时间轴宽度（像素）
 * @param totalDurationFrames 总时长（帧数）
 * @param zoomLevel 缩放级别
 * @param scrollOffset 滚动偏移量（像素）
 * @returns 像素位置
 */
export function frameToPixel(
  frames: number,
  timelineWidth: number,
  totalDurationFrames: number,
  zoomLevel: number,
  scrollOffset: number,
): number {
  const pixelsPerFrame = (timelineWidth * zoomLevel) / totalDurationFrames
  const pixelPosition = frames * pixelsPerFrame - scrollOffset

  return pixelPosition
}

/**
 * 将像素位置转换为帧数（考虑缩放和滚动）
 * @param pixel 像素位置
 * @param timelineWidth 时间轴宽度（像素）
 * @param totalDurationFrames 总时长（帧数）
 * @param zoomLevel 缩放级别
 * @param scrollOffset 滚动偏移量（像素）
 * @returns 帧数
 */
export function pixelToFrame(
  pixel: number,
  timelineWidth: number,
  totalDurationFrames: number,
  zoomLevel: number,
  scrollOffset: number,
): number {
  const pixelsPerFrame = (timelineWidth * zoomLevel) / totalDurationFrames
  const frames = (pixel + scrollOffset) / pixelsPerFrame

  return frames
}
