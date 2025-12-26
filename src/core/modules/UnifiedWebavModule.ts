import { ref, markRaw, watch, type Raw, type Ref } from 'vue'
import { throttle } from 'lodash'
import { AVCanvas } from '@webav/av-canvas'
import { MP4Clip, ImgClip, AudioClip } from '@webav/av-cliper'
import type { VisibleSprite } from '@webav/av-cliper'
import {
  framesToMicroseconds,
  microsecondsToFrames,
  framesToTimecode,
} from '@/core/utils/timeUtils'
import type { UnifiedTimelineItemData } from '@/core/timelineitem'
import { TimelineItemFactory } from '@/core/timelineitem'
import type { MediaType, UnifiedMediaItemData } from '@/core/mediaitem/types'
import { ModuleRegistry, MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedPlaybackModule } from './UnifiedPlaybackModule'
import type { UnifiedTimelineModule } from './UnifiedTimelineModule'
import type { UnifiedMediaModule } from './UnifiedMediaModule'
/**
 * 播放选项接口
 */
interface PlayOptions {
  start: number // 开始时间（帧数）
  playbackRate: number
  end?: number // 结束时间（帧数）
}

// 全局WebAV状态 - 确保单例模式
let globalAVCanvas: AVCanvas | null = null
let globalCanvasContainer: HTMLElement | null = null

/**
 * 统一WebAV集成管理模块
 * 负责管理WebAV相关的状态和方法
 *
 * 基于原有webavModule的完整实现，适配新的统一架构
 *
 * 时间控制架构：
 * UI操作 → UnifiedWebavModule.seekTo() → WebAV.previewFrame() → timeupdate事件 → unifiedStore.setCurrentTime()
 *
 * 重要原则：
 * 1. WebAV是时间状态的唯一权威源
 * 2. 所有UI时间操作都必须通过seekTo()方法
 * 3. 使用时间同步锁防止循环调用
 * 4. timeupdate事件是Store状态更新的唯一入口
 */
export function createUnifiedWebavModule(registry: ModuleRegistry) {
  // 通过注册中心获取依赖模块
  const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)
  // ==================== 状态定义 ====================

  // WebAV核心对象 - 使用markRaw避免Vue响应式包装
  const avCanvas = ref<AVCanvas | null>(null)
  const isWebAVReady = ref(false)
  const webAVError = ref<string | null>(null)

  // ==================== WebAV管理方法 ====================

  /**
   * 设置AVCanvas实例
   * @param canvas AVCanvas实例或null
   */
  function setAVCanvas(canvas: AVCanvas | null) {
    console.log('🏪 [UnifiedWebavModule] setAVCanvas:', {
      hasCanvas: !!canvas,
      canvasType: canvas?.constructor.name,
      previousState: !!avCanvas.value,
    })

    // 同步全局状态和响应式状态
    globalAVCanvas = canvas
    avCanvas.value = canvas ? markRaw(canvas) : null

    // 如果设置了新的canvas，自动设置为ready状态
    if (canvas) {
      setWebAVReady(true)
      setWebAVError(null)
    } else {
      setWebAVReady(false)
    }
  }

  /**
   * 设置WebAV就绪状态
   * @param ready 是否就绪
   */
  function setWebAVReady(ready: boolean) {
    console.log('🏪 [UnifiedWebavModule] setWebAVReady:', {
      ready,
      previousReady: isWebAVReady.value,
      stateChange: ready !== isWebAVReady.value,
    })

    isWebAVReady.value = ready

    // 如果设置为未就绪，清除错误状态
    if (!ready) {
      setWebAVError(null)
    }
  }

  /**
   * 设置WebAV错误信息
   * @param error 错误信息或null
   */
  function setWebAVError(error: string | null) {
    console.log('🏪 [UnifiedWebavModule] setWebAVError:', {
      error,
      hasError: !!error,
      previousError: webAVError.value,
    })

    webAVError.value = error

    // 如果有错误，自动设置为未就绪状态
    if (error) {
      setWebAVReady(false)
    }
  }

  /**
   * 清除WebAV状态（由useWebAVControls调用）
   * 注意：实际的销毁逻辑由useWebAVControls处理
   */
  function clearWebAVState() {
    console.log('🗑️ [UnifiedWebavModule] 清除WebAV状态')

    // 只清除状态，不执行实际的销毁逻辑
    setAVCanvas(null)
    setWebAVReady(false)
    setWebAVError(null)

    console.log('✅ [UnifiedWebavModule] WebAV状态已清除')
  }

  /**
   * 检查WebAV是否可用
   * @returns 是否可用
   */
  function isWebAVAvailable(): boolean {
    return !!(avCanvas.value && isWebAVReady.value && !webAVError.value)
  }

  /**
   * 重置WebAV状态为默认值
   */
  function resetToDefaults() {
    clearWebAVState()
    console.log('🔄 [UnifiedWebavModule] WebAV状态已重置为默认值')
  }

  /**
   * 添加sprite到画布
   * @param sprite 要添加的sprite
   */
  async function addSprite(sprite: VisibleSprite): Promise<boolean> {
    if (!isWebAVAvailable()) {
      console.warn('⚠️ [UnifiedWebavModule] WebAV不可用，无法添加sprite')
      return false
    }

    try {
      await avCanvas.value!.addSprite(sprite)
      console.log('✅ [UnifiedWebavModule] 添加sprite成功')
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('❌ [UnifiedWebavModule] 添加sprite失败:', errorMessage)
      setWebAVError(`添加sprite失败: ${errorMessage}`)
      return false
    }
  }

  /**
   * 从画布移除sprite
   * @param sprite 要移除的sprite
   */
  function removeSprite(sprite: VisibleSprite) {
    if (!isWebAVAvailable()) {
      console.warn('⚠️ [UnifiedWebavModule] WebAV不可用，无法移除sprite')
      return false
    }

    try {
      avCanvas.value!.removeSprite(sprite)
      console.log('✅ [UnifiedWebavModule] 移除sprite成功')
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('❌ [UnifiedWebavModule] 移除sprite失败:', errorMessage)
      setWebAVError(`移除sprite失败: ${errorMessage}`)
      return false
    }
  }

  // ==================== 画布容器管理 ====================

  /**
   * 创建WebAV画布容器
   * @param options 容器配置选项
   * @returns HTMLElement 创建的容器元素
   */
  function createCanvasContainer(options: {
    width: number
    height: number
    className?: string
    style?: Record<string, string>
  }): HTMLElement {
    // 创建容器元素
    const container = document.createElement('div')
    container.className = options.className || 'webav-canvas-container'

    // 设置基础样式
    container.style.width = `${options.width}px`
    container.style.height = `${options.height}px`
    container.style.position = 'relative'
    container.style.overflow = 'hidden'

    // 应用自定义样式
    if (options.style) {
      Object.assign(container.style, options.style)
    }

    // 存储全局引用
    globalCanvasContainer = container

    return container
  }

  /**
   * 初始化WebAV画布
   * @param container 画布容器元素
   * @param options 画布配置选项
   */
  async function initializeCanvas(
    container: HTMLElement,
    options: {
      width: number
      height: number
      bgColor: string
    },
  ): Promise<void> {
    try {
      // 清理现有的canvas
      if (globalAVCanvas) {
        globalAVCanvas.destroy()
        globalAVCanvas = null
      }

      // 验证容器
      if (!container || !container.parentElement) {
        throw new Error('Invalid container: container must be attached to DOM')
      }

      const targetContainer = container
      const targetOptions = {
        width: options.width,
        height: options.height,
        bgColor: options.bgColor,
      }

      // 创建AVCanvas实例 - 使用markRaw避免响应式包装
      globalAVCanvas = markRaw(new AVCanvas(targetContainer, targetOptions))

      // 将AVCanvas实例设置到store中
      setAVCanvas(globalAVCanvas)

      // 设置事件监听器
      await setupEventListeners()

      // 清除错误状态
      setWebAVError(null)

      // 预览第一帧
      globalAVCanvas.previewFrame(0)

      // 标记WebAV为就绪状态
      setWebAVReady(true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setWebAVError(`WebAV初始化失败: ${errorMessage}`)
      throw error
    }
  }

  /**
   * 设置WebAV事件监听器
   */
  async function setupEventListeners(): Promise<void> {
    if (!globalAVCanvas) {
      console.error('❌ [WebAV Events] Cannot setup listeners: globalAVCanvas is null')
      return
    }

    // // 播放状态变化事件
    // globalAVCanvas.on('playing', () => {
    //   playbackModule.setPlaying(true)
    // })

    // globalAVCanvas.on('paused', () => {
    //   playbackModule.setPlaying(false)
    // })

    // // 时间更新事件
    // globalAVCanvas.on('timeupdate', (microseconds: number) => {
    //   // 将微秒转换为帧数
    //   const frames = microsecondsToFrames(microseconds)
    //   // console.log(`[setCurrentFrame] timeupdate ${frames} ${microseconds}ms`)
    //   playbackModule.currentWebAVFrame.value = frames
    //   if (playbackModule.isPlaying.value) {
    //     playbackModule.setCurrentFrame(frames)
    //   }
    // })

    // // 创建节流函数，50ms内只执行一次
    // const throttledPreviewFrame = throttle(async (frame: number) => {
    //   if (globalAVCanvas && !playbackModule.isPlaying.value) {
    //     const microseconds2 = framesToMicroseconds(frame)
    //     await globalAVCanvas.previewFrame(microseconds2)
    //     // console.log(`[setCurrentFrame] watch previewFrame ${frame} ${microseconds2}ms`)
    //   }
    // }, 50)

    // watch(
    //   [playbackModule.currentFrame, playbackModule.currentWebAVFrame],
    //   async ([new_cf, new_cwf]) => {
    //     if (new_cf != new_cwf) {
    //       throttledPreviewFrame(new_cf)
    //     }
    //   },
    // )

    console.log('✅ [WebAV Events] Event listeners setup completed')
  }

  // ==================== 播放控制功能 ====================

  /**
   * 播放控制（帧数接口）
   * @param startFrames 开始帧数
   * @param endFrames 结束帧数，如果未提供则使用总时长作为结束时间
   * @param playbackRate 播放速度倍率
   */
  async function play(
    startFrames?: number,
    endFrames?: number,
    playbackRate?: number,
    contentEndTimeFrames?: number,
  ): Promise<void> {
    if (!globalAVCanvas) return

    // 帧数转换为微秒
    const start = framesToMicroseconds(startFrames || playbackModule.currentFrame.value)

    const playOptions: PlayOptions = {
      start,
      playbackRate: playbackRate || 1, // 默认播放速率为1
    }

    // 如果没有提供结束时间，使用总时长作为默认结束时间
    const finalEndFrames = endFrames !== undefined ? endFrames : contentEndTimeFrames

    if (finalEndFrames !== undefined) {
      const end = framesToMicroseconds(finalEndFrames)
      if (end > start) {
        playOptions.end = end
      } else {
        console.warn('结束帧必须大于开始帧，忽略end参数')
      }
    }

    globalAVCanvas.play(playOptions)

    console.log('▶️ 开始播放:', {
      startFrames: startFrames || playbackModule.currentFrame.value,
      endFrames: finalEndFrames,
      originalEndFrames: endFrames,
      playbackRate: playOptions.playbackRate,
      startTimecode: framesToTimecode(startFrames || playbackModule.currentFrame.value),
      endTimecode: finalEndFrames ? framesToTimecode(finalEndFrames) : undefined,
    })
  }

  /**
   * 暂停播放
   */
  function pause(): void {
    if (!globalAVCanvas) return
    globalAVCanvas.pause()
  }

  /**
   * 跳转到指定帧数
   * 这是时间控制的唯一入口点，所有UI时间操作都应该通过此方法
   * @param frames 帧数
   */
  async function seekTo(frames: number): Promise<void> {
    if (!globalAVCanvas) return

    playbackModule.setCurrentFrame(frames)
  }

  // ==================== 实例管理 ====================

  /**
   * 销毁WebAV实例
   */
  function destroy(): void {
    if (globalAVCanvas) {
      globalAVCanvas.destroy()
      globalAVCanvas = null
    }

    // 清理全局容器引用
    globalCanvasContainer = null

    // 清理错误状态
    setWebAVError(null)
    setAVCanvas(null)
    setWebAVReady(false)
  }

  /**
   * 获取WebAV实例（用于高级操作）
   */
  function getAVCanvas(): AVCanvas | null {
    return globalAVCanvas
  }

  /**
   * 获取画布容器DOM元素
   */
  function getCanvasContainer(): HTMLElement | null {
    return globalCanvasContainer
  }

  /**
   * 检查WebAV是否已经初始化
   */
  function isWebAVReadyGlobal(): boolean {
    return globalAVCanvas !== null
  }

  /**
   * 等待WebAV初始化完成
   * 使用Vue的watch机制监听isWebAVReady状态变化，更符合响应式编程模式
   * 由于项目必须依赖WebAV，因此不设置超时，确保一定等到初始化完成
   */
  async function waitForWebAVReady(): Promise<void> {
    // 如果已经初始化完成，直接返回
    if (isWebAVReady.value) {
      return
    }

    // 使用watch监听isWebAVReady状态变化，更优雅的响应式方式
    return new Promise<void>((resolve) => {
      const unwatch = watch(
        isWebAVReady,
        (ready) => {
          if (ready) {
            unwatch() // 停止监听
            resolve() // 完成Promise
          }
        },
        { immediate: true }, // 立即执行一次，以防在watch设置前状态已经变为true
      )
    })
  }

  // ==================== 画布销毁和重建 ====================

  // ==================== 导出接口 ====================

  return {
    // 状态
    isWebAVReady,
    webAVError,

    // 工具方法
    isWebAVAvailable,
    addSprite,
    removeSprite,

    // 画布容器管理
    createCanvasContainer,
    initializeCanvas,
    getAVCanvas,
    getCanvasContainer,

    // 播放控制
    play,
    pause,
    seekTo,

    // 实例管理
    isWebAVReadyGlobal,
    waitForWebAVReady,
  }
}

// 导出类型定义
export type UnifiedWebavModule = ReturnType<typeof createUnifiedWebavModule>
