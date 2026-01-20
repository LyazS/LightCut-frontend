<template>
  <canvas
    ref="canvasRef"
    class="image-canvas"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
  ></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import type { ImageMediaItem, ReadyMediaItem } from '@/core'

interface Props {
  mediaItem: ImageMediaItem & ReadyMediaItem
}

const props = defineProps<Props>()

const canvasRef = ref<HTMLCanvasElement>()
const ctx = computed(() => canvasRef.value?.getContext('2d'))

// 缩放和平移状态
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const isDragging = ref(false)
const lastMouseX = ref(0)
const lastMouseY = ref(0)

// 获取 ImageBitmap
const imageBitmap = computed<ImageBitmap | undefined>(() => {
  return props.mediaItem.runtime.bunny?.imageClip
})

// 初始化画布
onMounted(() => {
  if (canvasRef.value && imageBitmap.value) {
    // 设置 canvas 尺寸为父容器尺寸
    const container = canvasRef.value.parentElement
    if (container) {
      canvasRef.value.width = container.clientWidth
      canvasRef.value.height = container.clientHeight
    }
    // 适应窗口
    fitToWindow()
    drawImage()
  }
})

// 绘制图片
function drawImage(): void {
  if (!canvasRef.value || !ctx.value || !imageBitmap.value) return

  const bitmap = imageBitmap.value
  const canvas = canvasRef.value
  const context = ctx.value

  // 清空画布
  context.clearRect(0, 0, canvas.width, canvas.height)

  // 保存当前状态
  context.save()

  // 应用平移和缩放
  context.translate(offsetX.value, offsetY.value)
  context.scale(scale.value, scale.value)

  // 绘制 ImageBitmap
  context.drawImage(bitmap, 0, 0)

  // 恢复状态
  context.restore()
}

// 适应窗口
function fitToWindow(): void {
  if (!canvasRef.value || !imageBitmap.value) return

  const canvas = canvasRef.value
  const bitmap = imageBitmap.value
  const container = canvas.parentElement

  if (!container) return

  const containerWidth = container.clientWidth
  const containerHeight = container.clientHeight

  // 计算缩放比例
  const scaleX = containerWidth / bitmap.width
  const scaleY = containerHeight / bitmap.height
  scale.value = Math.min(scaleX, scaleY, 1)

  // 居中显示（计算偏移量）
  offsetX.value = (containerWidth - bitmap.width * scale.value) / 2
  offsetY.value = (containerHeight - bitmap.height * scale.value) / 2

  drawImage()
}

// 鼠标按下开始拖拽
function handleMouseDown(event: MouseEvent): void {
  isDragging.value = true
  lastMouseX.value = event.clientX
  lastMouseY.value = event.clientY
  canvasRef.value?.style.setProperty('cursor', 'grabbing')
}

// 鼠标移动拖拽
function handleMouseMove(event: MouseEvent): void {
  if (!isDragging.value) return

  const deltaX = event.clientX - lastMouseX.value
  const deltaY = event.clientY - lastMouseY.value

  offsetX.value += deltaX
  offsetY.value += deltaY

  lastMouseX.value = event.clientX
  lastMouseY.value = event.clientY

  drawImage()
}

// 鼠标释放停止拖拽
function handleMouseUp(): void {
  isDragging.value = false
  canvasRef.value?.style.setProperty('cursor', 'grab')
}

// 清理
onBeforeUnmount(() => {
  // ImageBitmap 不需要手动清理，由浏览器垃圾回收机制处理
  // 如果需要立即释放，可以调用 imageBitmap.value?.close()
})
</script>

<style scoped>
.image-canvas {
  cursor: grab;
  max-width: 100%;
  max-height: 100%;
  display: block;
  margin: auto;
}

.image-canvas:active {
  cursor: grabbing;
}
</style>
