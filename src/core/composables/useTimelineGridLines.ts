import { computed, type Ref } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { calculateVisibleFrameRange } from '@/core/utils/timelineScaleUtils'
import { RENDERER_FPS } from '@/core/mediabunny/constant'

/**
 * 时间轴网格线计算模块
 * 提供时间轴网格线相关的计算功能，根据缩放级别和时间轴宽度计算网格线位置
 */
export function useTimelineGridLines() {
  const unifiedStore = useUnifiedStore()

  /**
   * 计算网格线
   * 根据缩放级别和时间轴宽度计算网格线的位置和类型
   */
  const gridLines = computed(() => {
    const lines = []
    const totalDurationFrames = unifiedStore.totalDurationFrames
    const pixelsPerFrame =
      (unifiedStore.TimelineContentWidth * unifiedStore.zoomLevel) / totalDurationFrames
    const pixelsPerSecond = pixelsPerFrame * RENDERER_FPS

    // 根据缩放级别决定网格间隔（基于帧数）
    let intervalFrames = 150 // 默认每5秒一条网格线（150帧）
    let frameIntervalFrames = 0 // 帧间隔
    let isFrameLevel = false

    if (pixelsPerSecond >= 100) {
      // 降低帧级别的阈值
      intervalFrames = 30 // 高缩放：每秒一条线（30帧）
      frameIntervalFrames = 1 // 同时显示帧级别的线
      isFrameLevel = true
    } else if (pixelsPerSecond >= 50) {
      intervalFrames = 60 // 中等缩放：每2秒一条线（60帧）
    } else if (pixelsPerSecond >= 20) {
      intervalFrames = 150 // 正常缩放：每5秒一条线（150帧）
    } else {
      intervalFrames = 300 // 低缩放：每10秒一条线（300帧）
    }

    // 计算可见时间范围（使用帧数版本）
    const { startFrames, endFrames } = calculateVisibleFrameRange(
      unifiedStore.TimelineContentWidth,
      totalDurationFrames,
      unifiedStore.zoomLevel,
      unifiedStore.scrollOffset,
    )

    // 生成主网格线（基于帧数）
    const startLineFrames = Math.floor(startFrames / intervalFrames) * intervalFrames
    const endLineFrames = Math.ceil(endFrames / intervalFrames) * intervalFrames

    for (
      let i = startLineFrames;
      i <= Math.min(endLineFrames, totalDurationFrames);
      i += intervalFrames
    ) {
      if (i >= 0) {
        lines.push({ time: i, isFrame: false }) // 直接使用帧数
      }
    }

    // 在帧级别缩放时，添加帧网格线
    if (isFrameLevel && frameIntervalFrames > 0) {
      const frameStartFrames = Math.floor(startFrames / frameIntervalFrames) * frameIntervalFrames
      const frameEndFrames = Math.ceil(endFrames / frameIntervalFrames) * frameIntervalFrames

      for (
        let i = frameStartFrames;
        i <= Math.min(frameEndFrames, totalDurationFrames);
        i += frameIntervalFrames
      ) {
        if (i >= 0 && Math.abs(i % intervalFrames) > 0.5) {
          // 避免与主网格线重复（使用帧数容差）
          lines.push({ time: i, isFrame: true }) // 直接使用帧数
        }
      }
    }

    return lines.sort((a, b) => a.time - b.time)
  })

  return {
    // 计算属性
    gridLines,
  }
}
