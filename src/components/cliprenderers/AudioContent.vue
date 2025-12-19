<!-- AudioContentTemplate.vue -->
<template>
  <div class="audio-content" :class="{ selected: isSelected }">
    <!-- 波形Canvas容器 -->
    <!-- 音频波形Canvas - 添加拖拽事件处理 -->
    <canvas
      ref="waveformCanvas"
      :height="DEFAULT_TRACK_HEIGHTS.audio - 2 * DEFAULT_TRACK_PADDING"
      class="waveform-canvas"
      :style="{ left: canvasLeft + 'px' }"
      @dragstart.stop.prevent="handleInnerDrag"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { throttle } from 'lodash'
import type { ContentTemplateProps } from '@/core/types/clipRenderer'
import { useUnifiedStore } from '@/core/unifiedStore'
import { calculateClipWidthPixels } from '@/core/utils/thumbnailLayout'
import { DEFAULT_TRACK_HEIGHTS, DEFAULT_TRACK_PADDING } from '@/constants/TrackConstants'
import { microsecondsToFrames } from '@/core/utils/timeUtils'
import type { UnifiedTimelineItemData } from '@/core/timelineitem'

const props = defineProps<ContentTemplateProps<'audio'>>()
const unifiedStore = useUnifiedStore()

const waveformCanvas = ref<HTMLCanvasElement>()
const canvasLeft = ref(0)

// 采样波形计算属性
const sampleWaveform = computed(() => {
  const clipTLStartFrame = props.data.timeRange.timelineStartTime
  const clipTLEndFrame = props.data.timeRange.timelineEndTime
  const clipTLDurationFrames = clipTLEndFrame - clipTLStartFrame

  // 计算clip的像素宽度
  const clipWidthPixels = calculateClipWidthPixels(
    clipTLDurationFrames,
    props.timelineWidth,
    unifiedStore.totalDurationFrames,
    unifiedStore.zoomLevel,
  )

  // 检查是否在视口范围内
  const viewportStartFrame = props.viewportFrameRange.startFrames
  const viewportEndFrame = props.viewportFrameRange.endFrames

  if (clipTLStartFrame >= viewportEndFrame || clipTLEndFrame <= viewportStartFrame) {
    return null
  }

  const viewportTLStartFrame = Math.max(viewportStartFrame, clipTLStartFrame)
  const viewportTLEndFrame = Math.min(viewportEndFrame, clipTLEndFrame)

  return {
    viewportTLStartFrame,
    viewportTLEndFrame,
    clipWidthPixels: Math.floor(clipWidthPixels),
  }
})

// 核心渲染逻辑
function renderWaveformInComponent() {
  if (!waveformCanvas.value || !sampleWaveform.value) {
    return
  }

  const { viewportTLStartFrame, viewportTLEndFrame, clipWidthPixels } = sampleWaveform.value

  if (waveformCanvas.value) {
    renderWaveformDirectly(
      waveformCanvas.value,
      props.data,
      viewportTLStartFrame,
      viewportTLEndFrame,
      clipWidthPixels,
      DEFAULT_TRACK_HEIGHTS.audio - 2 * DEFAULT_TRACK_PADDING,
    )
  }
}

// 节流渲染函数（333ms，与视频缩略图一致）
const throttledRenderWaveform = throttle(renderWaveformInComponent, 333, {
  leading: false,
  trailing: true,
})

// 监听sampleWaveform变化（主要触发条件）
watch(
  () => sampleWaveform.value,
  (newValue) => {
    if (newValue && waveformCanvas.value) {
      throttledRenderWaveform()
    }
  },
  { deep: true },
)

// 组件挂载时初始渲染
onMounted(() => {
  if (sampleWaveform.value) {
    throttledRenderWaveform()
  }
})

// 组件卸载时清理
onUnmounted(() => {
  throttledRenderWaveform.cancel()
})

/**
 * 处理内部元素的拖拽事件 - 阻止浏览器默认行为
 * 确保拖拽时显示整个clip的预览，而不是Canvas元素的虚影
 */
function handleInnerDrag(event: DragEvent) {
  // 阻止Canvas元素的拖拽行为，让整个clip处理拖拽
  event.preventDefault()
  event.stopPropagation()
  return false
}

// ==================== 音频波形渲染工具函数 ====================
// 基于直接PCM数据获取的简化音频波形渲染方案

function preparePCMData(
  fullPcmData: Float32Array,
  timelineItem: UnifiedTimelineItemData,
  clipWholeDurationFrames: number, // 音频总时长(帧数)
  startFrame: number, // 帧数
  endFrame: number, // 帧数
): Float32Array {
  if (!fullPcmData || fullPcmData.length === 0) {
    return new Float32Array()
  }
  // 时间轴长度
  const tlDurationFrames =
    timelineItem.timeRange.timelineEndTime - timelineItem.timeRange.timelineStartTime
  // clip对应长度
  const clipDurationFrames =
    timelineItem.timeRange.clipEndTime - timelineItem.timeRange.clipStartTime

  // clip开始帧
  const startFrameInClip =
    timelineItem.timeRange.clipStartTime +
    Math.round(
      ((startFrame - timelineItem.timeRange.timelineStartTime) / tlDurationFrames) *
        clipDurationFrames,
    )
  // clip结束帧
  const endFrameInClip =
    timelineItem.timeRange.clipStartTime +
    Math.round(
      ((endFrame - timelineItem.timeRange.timelineStartTime) / tlDurationFrames) *
        clipDurationFrames,
    )

  const startPercent = startFrameInClip / clipWholeDurationFrames
  const endPercent = endFrameInClip / clipWholeDurationFrames

  const startIndex = Math.floor(startPercent * fullPcmData.length)
  const endIndex = Math.floor(endPercent * fullPcmData.length)

  return fullPcmData.subarray(startIndex, endIndex)
}

/**
 * 渲染波形到Canvas
 * @param ctx Canvas渲染上下文
 * @param data PCM采样数据
 * @param clipWidth clip宽度
 * @param height 画布高度
 */
function renderWaveformToCanvas(
  canvas: HTMLCanvasElement,
  timelineItem: UnifiedTimelineItemData,
  pcmData: Float32Array,
  startFrame: number,
  endFrame: number,
  clipWidth: number,
  height: number,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }

  // 保存当前Canvas状态
  ctx.save()

  const amplitude = 1.0

  // 设置基线位置，留出底部空间
  const baselineY = height - DEFAULT_TRACK_PADDING

  // 计算宽度
  const tlDurationFrames =
    timelineItem.timeRange.timelineEndTime - timelineItem.timeRange.timelineStartTime

  const sampleStartX =
    ((startFrame - timelineItem.timeRange.timelineStartTime) / tlDurationFrames) * clipWidth
  const sampleEndX =
    ((endFrame - timelineItem.timeRange.timelineStartTime) / tlDurationFrames) * clipWidth
  const sampleWidth = sampleEndX - sampleStartX
  const samplesPerPixel = pcmData.length / sampleWidth

  // 确保canvasLeft是数字类型，而不是字符串
  canvasLeft.value = Math.floor(sampleStartX)
  canvas.width = Math.floor(sampleWidth)

  // 清空画布
  ctx.clearRect(0, 0, sampleWidth, height)
  // 创建渐变色 - 从底部到顶部
  const gradient = ctx.createLinearGradient(0, baselineY, 0, 0)
  gradient.addColorStop(0, '#96ceb4')
  gradient.addColorStop(0.3, '#4ecdc4')
  gradient.addColorStop(0.6, '#45b7d1')
  gradient.addColorStop(1, '#ff6b6b')

  for (let x = 0; x < sampleWidth; x++) {
    let maxAmplitude = 0

    // 找到这个像素范围内的最大振幅（绝对值）
    const startSampleIndex = Math.floor(x * samplesPerPixel)
    const endSampleIndex = Math.floor((x + 1) * samplesPerPixel)

    for (let j = startSampleIndex; j < endSampleIndex && j < pcmData.length; j++) {
      const sample = Math.abs(pcmData[j])
      if (sample > maxAmplitude) {
        maxAmplitude = sample
      }
    }

    // 计算波形高度（从基线向上）
    const waveHeight = maxAmplitude * (baselineY - DEFAULT_TRACK_PADDING) * amplitude // 留出顶部空间
    const topY = baselineY - waveHeight

    // 绘制垂直线条（从基线向上），应用渐变色
    if (waveHeight > 1) {
      ctx.fillStyle = gradient
      ctx.fillRect(x + 0, topY, 1, waveHeight)
    }
  }

  // 绘制基线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, baselineY)
  ctx.lineTo(clipWidth, baselineY)
  ctx.stroke()

  // 恢复Canvas状态
  ctx.restore()
}

/**
 * 实时波形渲染函数
 * @param canvas Canvas元素
 * @param audioClip AudioClip实例
 * @param viewportTLStartFrame 视口开始帧
 * @param viewportTLEndFrame 视口结束帧
 * @param clipWidthPixels Clip像素宽度
 * @param options 渲染选项
 */
async function renderWaveformDirectly(
  canvas: HTMLCanvasElement,
  timelineItem: UnifiedTimelineItemData,
  viewportTLStartFrame: number,
  viewportTLEndFrame: number,
  clipWidthPixels: number,
  height: number,
): Promise<void> {
  const unifiedStore = useUnifiedStore()

  if (canvas.height !== height) {
    canvas.height = height
  }

  try {
    const mediaItem = unifiedStore.getMediaItem(timelineItem.mediaItemId)
    if (!mediaItem?.runtime.webav?.audioClip) return

    const audioClip = mediaItem.runtime.webav.audioClip
    const meta = await audioClip.ready

    // 获取完整的PCM数据
    let fullPcmData: Float32Array
    try {
      // 获取完整的PCM数据
      const pcmData = audioClip.getPCMData()

      if (!pcmData || pcmData.length === 0) {
        // 没有数据，直接返回
        return
      }

      // 返回第一个声道的数据
      fullPcmData = pcmData[0]
    } catch (error) {
      console.error('获取PCM数据失败:', error)
      return
    }

    if (fullPcmData.length === 0) {
      return
    }

    // 裁剪PCM数据到当前视口范围
    const pcmData = preparePCMData(
      fullPcmData,
      timelineItem,
      microsecondsToFrames(meta.duration),
      viewportTLStartFrame,
      viewportTLEndFrame,
    )

    // 渲染波形
    renderWaveformToCanvas(
      canvas,
      timelineItem,
      pcmData,
      viewportTLStartFrame,
      viewportTLEndFrame,
      clipWidthPixels,
      height,
    )
  } catch (error) {
    console.error('波形渲染失败:', error)
    return
  }
}
</script>

<style scoped>
.audio-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden; /* 确保canvas不会超出容器边界 */
  border-radius: var(--border-radius-medium);
}

.waveform-canvas {
  /* 使用固定尺寸避免缩放问题 */
  width: auto;
  /* height: 40px; */
  background: rgba(0, 0, 0, 0); /* 添加背景以便调试 */
  display: block; /* 确保正确显示 */
  position: absolute; /* 使用absolute定位使left生效 */
}

/* 保持向后兼容的样式 */
.sample-number {
  font-size: 12px;
  color: white;
  font-weight: bold;
}

/* 选中状态样式 */
.audio-content.selected {
  background: linear-gradient(135deg, var(--color-clip-selected), var(--color-clip-selected-dark));
}
</style>
