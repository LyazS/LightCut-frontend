<template>
  <div class="webav-renderer" ref="rendererContainer">
    <!-- WebAV画布容器 - 程序化创建并插入 -->
    <div
      ref="canvasContainerWrapper"
      class="canvas-container-wrapper"
      :style="canvasContainerStyle"
    >
      <!-- WebAV画布容器会被程序化插入到这里 -->
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import {
  logRendererState,
  logComponentLifecycle,
  createPerformanceTimer,
  debugError,
} from '@/core/utils/webavDebug'

/**
 * 视频分辨率接口
 */
interface VideoResolution {
  name: string
  width: number
  height: number
  aspectRatio: string
  category?: string
}

// 扩展HTMLElement类型以包含自定义属性
interface ExtendedHTMLElement extends HTMLElement {
  _resizeObserver?: ResizeObserver
}

const unifiedStore = useUnifiedStore()

// 组件引用
const canvasContainerWrapper = ref<HTMLElement>()
const rendererContainer = ref<HTMLElement>()

// 计算属性
const error = computed(() => unifiedStore.webAVError)

// 画布原始尺寸（基于视频分辨率）
const canvasWidth = computed(() => unifiedStore.videoResolution.width)
const canvasHeight = computed(() => unifiedStore.videoResolution.height)

// 容器尺寸
const containerWidth = ref(800)
const containerHeight = ref(600)

// 计算画布显示尺寸（保持比例，适应容器）
const canvasDisplaySize = computed(() => {
  const aspectRatio = canvasWidth.value / canvasHeight.value
  const containerAspectRatio = containerWidth.value / containerHeight.value

  let displayWidth: number
  let displayHeight: number

  if (aspectRatio > containerAspectRatio) {
    // 画布更宽，以宽度为准
    displayWidth = Math.min(containerWidth.value, canvasWidth.value)
    displayHeight = displayWidth / aspectRatio
  } else {
    // 画布更高，以高度为准
    displayHeight = Math.min(containerHeight.value, canvasHeight.value)
    displayWidth = displayHeight * aspectRatio
  }

  return {
    width: Math.round(displayWidth),
    height: Math.round(displayHeight),
  }
})

// 画布容器样式
const canvasContainerStyle = computed(() => ({
  width: canvasDisplaySize.value.width + 'px',
  height: canvasDisplaySize.value.height + 'px',
}))

/**
 * 初始化WebAV画布到当前容器
 */
const initializeWebAVCanvas = async (): Promise<void> => {
  const rendererTimer = createPerformanceTimer('WebAV Renderer Initialization')

  logRendererState({
    hasWrapper: !!canvasContainerWrapper.value,
    wrapperSize: canvasContainerWrapper.value
      ? `${canvasContainerWrapper.value.clientWidth}x${canvasContainerWrapper.value.clientHeight}`
      : 'undefined',
    canvasDisplaySize: canvasDisplaySize.value,
    canvasOriginalSize: { width: canvasWidth.value, height: canvasHeight.value },
  })

  if (!canvasContainerWrapper.value) {
    console.error('❌ [WebAV Renderer] Canvas container wrapper not found')
    return
  }

  // 检查是否已经初始化
  const existingCanvas = unifiedStore.getAVCanvas()
  if (existingCanvas) {
    console.log('♻️ [WebAV Renderer] WebAV Canvas already exists, reusing existing instance')
    const existingContainer = unifiedStore.getCanvasContainer()
    if (existingContainer && !canvasContainerWrapper.value.contains(existingContainer)) {
      canvasContainerWrapper.value.appendChild(existingContainer)
      console.log('✅ [WebAV Renderer] Existing container attached successfully')
    } else {
      console.log('✅ [WebAV Renderer] Existing container already in wrapper')
    }

    const totalTime = rendererTimer.end()
    console.log('🎬 [WebAV Renderer] Renderer initialization completed (reused existing):', {
      totalTime: `${totalTime.toFixed(2)}ms`,
    })
    return
  }

  try {
    console.log('🏗️ [WebAV Renderer] Creating new WebAV canvas setup...')

    // 程序化创建画布容器
    const canvasContainer = unifiedStore.createCanvasContainer({
      width: canvasDisplaySize.value.width,
      height: canvasDisplaySize.value.height,
      className: 'webav-canvas-container',
      style: {
        borderRadius: 'var(--border-radius-medium)',
        boxShadow: 'var(--shadow-lg)',
      },
    })

    // 将容器插入到wrapper中
    canvasContainerWrapper.value.appendChild(canvasContainer)
    console.log('✅ [WebAV Renderer] Canvas container appended to wrapper')

    // 初始化WebAV画布
    await unifiedStore.initializeCanvas(canvasContainer, {
      width: canvasWidth.value,
      height: canvasHeight.value,
      bgColor: '#000000', // WebAV库要求的格式，保持不变
    })

    const totalTime = rendererTimer.end()
    console.log('🎉 [WebAV Renderer] WebAV canvas initialization completed successfully!', {
      totalTime: `${totalTime.toFixed(2)}ms`,
      containerSize: `${canvasDisplaySize.value.width}x${canvasDisplaySize.value.height}`,
      canvasSize: `${canvasWidth.value}x${canvasHeight.value}`,
    })
  } catch (err) {
    const totalTime = rendererTimer.end()
    debugError('WebAV Renderer canvas initialization failed', err as Error, {
      totalTime: `${totalTime.toFixed(2)}ms`,
      wrapperState: !!canvasContainerWrapper.value,
    })
  }
}

/**
 * 重新创建画布（当尺寸变化时）
 */
const recreateCanvasWithNewSize = async (newResolution: VideoResolution): Promise<void> => {
  if (!canvasContainerWrapper.value) {
    console.error('Canvas container wrapper not found')
    return
  }

  try {
    console.log('开始销毁旧画布并备份内容...')

    // 销毁旧画布并备份内容
    await unifiedStore.destroyCanvas(unifiedStore.timelineItems)

    console.log('开始重新创建画布...')

    // 清空wrapper中的旧容器
    canvasContainerWrapper.value.innerHTML = ''

    // 程序化创建新的画布容器
    const newCanvasContainer = unifiedStore.createCanvasContainer({
      width: canvasDisplaySize.value.width,
      height: canvasDisplaySize.value.height,
      className: 'webav-canvas-container',
      style: {
        borderRadius: 'var(--border-radius-medium)',
        boxShadow: 'var(--shadow-lg)',
      },
    })

    // 将新容器插入到wrapper中
    canvasContainerWrapper.value.appendChild(newCanvasContainer)

    // 重新创建画布
    await unifiedStore.recreateCanvas(
      newCanvasContainer,
      {
        width: newResolution.width,
        height: newResolution.height,
        bgColor: '#000000', // WebAV库要求的格式，保持不变
      },
      {
        timelineItems: unifiedStore.timelineItems,
        setupTimelineItemSprite: unifiedStore.setupTimelineItemSprite,
      },
      {
        getMediaItem: unifiedStore.getMediaItem,
      },
    )

    console.log('画布重新创建完成')
  } catch (err) {
    console.error('重新创建画布失败:', err)
    // 如果重新创建失败，尝试简单的重新初始化
    try {
      await initializeWebAVCanvas()
      console.log('使用简单初始化作为备用方案')
    } catch (fallbackErr) {
      console.error('备用初始化也失败:', fallbackErr)
    }
  }
}

/**
 * 监听分辨率变化并重新创建画布
 */
watch(
  () => unifiedStore.videoResolution,
  async (newResolution, oldResolution) => {
    console.log('Video resolution changed:', newResolution)

    // 检查是否真的需要重新创建画布
    if (
      !oldResolution ||
      newResolution.width !== oldResolution.width ||
      newResolution.height !== oldResolution.height
    ) {
      console.log('画布尺寸发生变化，开始重新创建画布...')
      await recreateCanvasWithNewSize(newResolution)
    }
  },
  { deep: true },
)

/**
 * 监听画布显示尺寸变化，同步更新实际的画布容器
 */
watch(
  canvasDisplaySize,
  (newSize) => {
    // 更新实际的WebAV画布容器尺寸
    const canvasContainer = unifiedStore.getCanvasContainer()
    if (canvasContainer) {
      canvasContainer.style.width = `${newSize.width}px`
      canvasContainer.style.height = `${newSize.height}px`

      // console.log('Canvas container size updated:', {
      //   newSize,
      //   containerElement: canvasContainer.tagName,
      //   actualSize: `${canvasContainer.clientWidth}x${canvasContainer.clientHeight}`,
      // })
    }
  },
  { deep: true },
)

/**
 * 监听播放状态变化，同步到WebAV
 */
watch(
  () => unifiedStore.isPlaying,
  (isPlaying) => {
    // 注意：这里我们不直接控制WebAV播放，因为WebAV应该是播放状态的主控
    // 这个监听主要用于调试和状态同步检查
    console.log('Video store playing state changed:', isPlaying)
  },
)

/**
 * 时间控制架构重构说明：
 *
 * 移除了currentTime的watch监听器，原因：
 * 1. 避免与WebAV的timeupdate事件形成循环调用
 * 2. 确保WebAV作为时间状态的唯一权威源
 * 3. 简化时间同步逻辑，提高性能
 *
 * 新的时间控制流程：
 * UI操作 → webAVControls.seekTo() → WebAV → timeupdate事件 → Store更新 → UI响应
 */

/**
 * 更新容器尺寸
 */
const updateContainerSize = (): void => {
  if (!rendererContainer.value) return

  const rect = rendererContainer.value.getBoundingClientRect()
  containerWidth.value = rect.width
  containerHeight.value = rect.height

  console.log('Container size updated:', {
    width: containerWidth.value,
    height: containerHeight.value,
    canvasDisplay: canvasDisplaySize.value,
  })
}

/**
 * 设置ResizeObserver监听容器尺寸变化
 */
const setupResizeObserver = (): void => {
  if (!rendererContainer.value) return

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      containerWidth.value = width
      containerHeight.value = height
    }
  })

  resizeObserver.observe(rendererContainer.value)

  // 保存observer引用以便清理
  ;(rendererContainer.value as ExtendedHTMLElement)._resizeObserver = resizeObserver
}

/**
 * 清理ResizeObserver
 */
const cleanupResizeObserver = (): void => {
  const container = rendererContainer.value as ExtendedHTMLElement | null
  if (container && container._resizeObserver) {
    container._resizeObserver.disconnect()
    delete container._resizeObserver
  }
}

// 等待项目设置就绪
async function waitForProjectSettingsReady(): Promise<void> {
  console.log('🔄 [LIFECYCLE] WebAVRenderer.waitForProjectSettingsReady 开始')

  return new Promise((resolve) => {
    if (unifiedStore.isProjectSettingsReady) {
      console.log('🔄 [LIFECYCLE] WebAVRenderer 设置已就绪，立即返回')
      resolve()
      return
    }

    console.log('🔄 [LIFECYCLE] WebAVRenderer 开始监听设置状态变化')
    const unwatch = watch(
      () => unifiedStore.isProjectSettingsReady,
      (isReady) => {
        console.log('🔄 [LIFECYCLE] WebAVRenderer 监听到设置状态变化:', isReady)
        if (isReady) {
          console.log('🔄 [LIFECYCLE] WebAVRenderer 设置就绪，继续初始化')
          unwatch()
          resolve()
        }
      },
      { immediate: true },
    )

    // 不设置超时，如果设置加载失败，应该让错误暴露出来
    // 这样可以更好地发现和调试问题
  })
}

// 生命周期
onMounted(async () => {
  console.log('🔄 [LIFECYCLE] WebAVRenderer.onMounted 开始')

  const mountTimer = createPerformanceTimer('WebAV Renderer Mount')
  logComponentLifecycle('WebAV Renderer', 'mounted', 'starting...')

  try {
    // 初始化容器尺寸
    await nextTick()
    updateContainerSize()
    console.log('✅ [WebAV Renderer] Container size updated')

    // 设置尺寸监听
    setupResizeObserver()
    console.log('✅ [WebAV Renderer] Resize observer setup completed')

    // 检查项目设置状态（应该在父组件onBeforeMount中已完成）
    console.log(
      '🔄 [LIFECYCLE] WebAVRenderer 检查项目设置状态:',
      unifiedStore.isProjectSettingsReady,
    )

    if (!unifiedStore.isProjectSettingsReady) {
      console.log('🔄 [LIFECYCLE] WebAVRenderer 等待项目设置完成')
      await waitForProjectSettingsReady()
      console.log('🔄 [LIFECYCLE] WebAVRenderer 项目设置等待完成')
    } else {
      console.log('🔄 [LIFECYCLE] WebAVRenderer 项目设置已就绪')
    }

    console.log('🔄 [LIFECYCLE] WebAVRenderer 开始初始化画布')

    // 初始化WebAV画布到容器
    await initializeWebAVCanvas()
    console.log('✅ [WebAV Renderer] WebAV canvas initialization completed')

    const totalMountTime = mountTimer.end()
    logComponentLifecycle('WebAV Renderer', 'mounted', {
      totalMountTime: `${totalMountTime.toFixed(2)}ms`,
      containerSize: containerWidth.value + 'x' + containerHeight.value,
      canvasDisplaySize: canvasDisplaySize.value,
      isWebAVReady: unifiedStore.isWebAVReady,
    })
  } catch (err) {
    const totalMountTime = mountTimer.end()
    debugError('WebAV Renderer component mount failed', err as Error, {
      totalMountTime: `${totalMountTime.toFixed(2)}ms`,
    })
  }
})

onUnmounted(() => {
  logComponentLifecycle('WebAV Renderer', 'unmounted', 'starting cleanup...')

  // 清理ResizeObserver
  cleanupResizeObserver()
  console.log('✅ [WebAV Renderer] Resize observer cleaned up')

  // 注意：不要在这里销毁WebAV，因为它是全局单例
  // webAVControls.destroy()

  logComponentLifecycle('WebAV Renderer', 'unmounted', 'completed successfully')
})

// 暴露方法给父组件
defineExpose({
  initializeWebAVCanvas,
  recreateCanvasWithNewSize,
  getAVCanvas: unifiedStore.getAVCanvas,
})
</script>

<style scoped>
.webav-renderer {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-primary);
  border-radius: var(--border-radius-medium);
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

.canvas-container-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
}

/* 程序化创建的WebAV画布容器样式 */
.canvas-container-wrapper :deep(.webav-canvas-container) {
  position: relative;
  background-color: var(--color-bg-primary);
  border-radius: var(--border-radius-medium);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  flex-shrink: 0;
  box-sizing: border-box;
  /* 禁用整个WebAV容器的鼠标事件 */
  pointer-events: none;
}

/* WebAV会在canvas-container中创建canvas元素，我们为其设置样式 */
.canvas-container-wrapper :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* 禁用所有鼠标事件，防止AVCanvas响应用户交互 */
  pointer-events: none;
}

.error-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(244, 67, 54, 0.9);
  color: var(--color-text-primary);
  padding: var(--spacing-xl) var(--spacing-xxl);
  border-radius: var(--border-radius-xlarge);
  font-size: var(--font-size-lg);
  text-align: center;
  max-width: 80%;
  word-wrap: break-word;
  z-index: 10;
}

.loading-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.8);
  color: var(--color-text-primary);
  padding: var(--spacing-xl) var(--spacing-xxl);
  border-radius: var(--border-radius-xlarge);
  font-size: var(--font-size-lg);
  text-align: center;
  z-index: 10;
}

.success-indicator {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(76, 175, 80, 0.9);
  color: var(--color-text-primary);
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--border-radius-medium);
  font-size: var(--font-size-base);
  z-index: 10;
  animation: fadeInOut 3s ease-in-out;
}

@keyframes fadeInOut {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .canvas-container-wrapper :deep(.webav-canvas-container) {
    max-width: 100%;
    max-height: 100%;
  }
}
</style>
