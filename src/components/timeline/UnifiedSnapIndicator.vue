<template>
  <div>
    <div v-if="shouldShowIndicator" class="snap-indicator-line" :style="indicatorStyle" />
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import { frameToPixel } from '@/core/utils/timelineScaleUtils'
import { useUnifiedStore } from '@/core/unifiedStore'
import type { SnapPoint } from '@/types/snap'

// Props
interface Props {
  snapResult?: {
    snapped: boolean
    frame: number
    snapPoint?: SnapPoint
    distance?: number
  } | null
  timelineWidth: number
  totalDurationFrames: number
  zoomLevel: number
  scrollOffset: number
}

const props = withDefaults(defineProps<Props>(), {
  snapResult: null,
  timelineWidth: 0,
  totalDurationFrames: 0,
  zoomLevel: 1,
  scrollOffset: 0,
})

// Store
const unifiedStore = useUnifiedStore()

// Computed
const shouldShowIndicator = computed(() => {
  // 检查是否需要显示吸附指示器
  if (!unifiedStore.snapConfig.enabled) return false
  if (!unifiedStore.snapConfig.visualFeedback) return false
  if (!props.snapResult) return false

  // 检查是否发生了吸附（通过snapPoint存在性判断）
  return !!props.snapResult.snapPoint
})

const indicatorStyle = computed((): CSSProperties => {
  if (!props.snapResult) return {}

  const pixel = frameToPixel(
    props.snapResult.frame,
    props.timelineWidth,
    props.totalDurationFrames,
    props.zoomLevel,
    props.scrollOffset,
  )

  // 统一的吸附指示器样式，不区分开始或尾部吸附
  return {
    left: `${pixel}px`,
  }
})
</script>

<style scoped>
.snap-indicator-line {
  position: absolute;
  top: 0px;
  width: 1px; /* 细线设计 */
  height: 100%; /* 使用父容器高度 */
  background-color: #a5d6a5; /* 淡淡的绿色 */
  background: #a5d6a5; /* 淡淡的绿色 */
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.6); /* 增强发光效果 */
  border-radius: 1px; /* 圆角边缘 */
  opacity: 0.9; /* 稍微透明以避免过于突兀 */
  transition: opacity 0.2s ease;
}
</style>
