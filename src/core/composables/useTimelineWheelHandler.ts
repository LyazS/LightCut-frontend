import { useUnifiedStore } from '@/core/unifiedStore'
import type { Ref } from 'vue'

/**
 * 时间轴滚轮处理来源类型
 */
export enum TimelineWheelSource {
  /** 时间刻度区域 */
  TIME_SCALE = 'time_scale',
  /** 时间轴主体区域 */
  TIMELINE_BODY = 'timeline_body',
}

/**
 * 统一的时间轴滚轮处理模块
 * 提供时间轴和时间刻度区域的统一滚轮事件处理
 */
export function useTimelineWheelHandler(
  container: Ref<HTMLElement | undefined>,
  options?: {
    /** 滚轮事件来源（用于区分不同的处理逻辑） */
    source?: TimelineWheelSource
  },
) {
  const unifiedStore = useUnifiedStore()

  const defaultOptions = {
    source: TimelineWheelSource.TIME_SCALE,
    ...options,
  }

  /**
   * 统一的滚轮事件处理
   */
  function handleWheel(event: WheelEvent) {
    if (event.altKey) {
      // Alt + 滚轮：缩放
      event.preventDefault()
      const rect = container.value?.getBoundingClientRect()
      if (!rect) return

      // 计算鼠标在时间轴上的位置
      let mouseX = event.clientX - rect.left

      // 根据来源类型决定是否需要减去轨道控制区域宽度
      if (defaultOptions.source === TimelineWheelSource.TIMELINE_BODY) {
        mouseX -= 150 // 时间轴主体区域需要减去轨道控制区域宽度
      }

      const mouseFrames = unifiedStore.pixelToFrame(mouseX, unifiedStore.timelineWidth)

      // 统一使用1.1的缩放因子
      if (event.deltaY < 0) {
        // 向上滚动：放大
        unifiedStore.zoomIn(1.1, unifiedStore.timelineWidth)
      } else {
        // 向下滚动：缩小
        unifiedStore.zoomOut(1.1, unifiedStore.timelineWidth)
      }

      // 调整滚动偏移量，使鼠标位置保持在相同的帧数点
      const newMousePixel = unifiedStore.frameToPixel(mouseFrames, unifiedStore.timelineWidth)
      const offsetAdjustment = newMousePixel - mouseX
      const newScrollOffset = unifiedStore.scrollOffset + offsetAdjustment

      unifiedStore.setScrollOffset(newScrollOffset, unifiedStore.timelineWidth)
    } else if (event.shiftKey) {
      // Shift + 滚轮：水平滚动
      event.preventDefault()

      // 跨平台兼容：macOS 上 deltaX 有值，Windows 上 deltaY 有值
      const scrollAmount = event.deltaX !== 0 ? event.deltaX : event.deltaY

      if (scrollAmount < 0) {
        // 向左滚动
        unifiedStore.scrollLeft(-scrollAmount, unifiedStore.timelineWidth)
      } else if (scrollAmount > 0) {
        // 向右滚动
        unifiedStore.scrollRight(scrollAmount, unifiedStore.timelineWidth)
      }
    } else if (defaultOptions.source === TimelineWheelSource.TIME_SCALE) {
      // 时间刻度区域：普通滚轮不处理（保持原有行为）
      // 时间轴主体区域：普通滚轮允许垂直滚动（不阻止默认行为）
      // 这里不阻止默认行为，让浏览器处理垂直滚动
    }
  }

  return {
    handleWheel,
  }
}
