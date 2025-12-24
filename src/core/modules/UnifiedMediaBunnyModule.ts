/**
 * UnifiedMediaBunnyModule - MediaBunny 渲染系统模块
 *
 * 完全替代 WebAV 的渲染系统，使用 MediaBunny 实现自定义渲染循环
 *
 * 核心特点：
 * - 完全替代 WebAV 渲染
 * - 自实现渲染循环（不依赖 WebAV 的 AVCanvas）
 * - Canvas 由 Vue 组件管理，通过 setCanvas() 传入
 * - 使用 runtime.bunnyClip (视频/音频)、runtime.textBitmap (文本)、runtime.bunny.imageClip (图片)
 * - 暂不支持导出功能（未来可扩展）
 * - 优先预览性能
 *
 * 架构说明：
 * - UnifiedPlaybackModule 作为主控，管理所有播放状态
 * - UnifiedMediaBunnyModule 只负责渲染，不维护独立播放状态
 * - 通过监听 playbackModule 的状态变化来控制渲染循环
 */

import { ref, markRaw, watch, type Ref } from 'vue'
import { workerTimer } from '@/core/mediabunny/worker-timer'
import { RENDERER_FPS, AUDIO_DEFAULT_SAMPLE_RATE } from '@/core/mediabunny/constant'
import type { BunnyClip } from '@/core/mediabunny/bunny-clip'
import type { VideoSample } from 'mediabunny'
import { ModuleRegistry, MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedTimelineModule } from './UnifiedTimelineModule'
import type { UnifiedMediaModule } from './UnifiedMediaModule'
import type { UnifiedPlaybackModule } from './UnifiedPlaybackModule'
import type { UnifiedConfigModule } from './UnifiedConfigModule'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/TimelineItemData'
import type { MediaType } from '@/core/mediaitem/types'
import type { AudioSample } from 'mediabunny'

export function createUnifiedMediaBunnyModule(registry: ModuleRegistry) {
  // ==================== 状态定义 ====================

  // 模块就绪状态
  const isMediaBunnyReady = ref(false)
  const mediaBunnyError = ref<string | null>(null)

  // Canvas 相关（由外部传入）
  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null

  // 渲染循环相关
  let renderLoopCleanup: (() => void) | null = null
  let renderStart: number = 0
  let renderRunCnt: number = 0
  const expectFrameTime: number = 1000 / RENDERER_FPS
  let updating: boolean = false

  // Web Audio API 相关
  let audioContext: AudioContext | null = null
  let gainNode: GainNode | null = null

  // 音频调度相关
  const queuedAudioNodes = new Set<AudioBufferSourceNode>()

  // 时间同步锚点（用于音频调度）
  let audioContextStartTime: number | null = null
  let playbackTimeAtStart: number = 0

  // 项目时长（帧数，bigint类型）
  let durationN: bigint = 0n

  // bunnyCurFrame 映射表（key: timelineItemId, value: VideoSample）
  const bunnyCurFrameMap = new Map<string, VideoSample>()

  // ==================== 画布管理 ====================

  /**
   * 设置 Canvas 元素并初始化渲染系统
   * @param canvasElement Canvas 元素引用（从 BunnyRender.vue 传入）
   */
  async function setCanvas(canvasElement: HTMLCanvasElement): Promise<void> {
    try {
      if (!canvasElement) {
        throw new Error('Canvas 元素不能为空')
      }

      // 设置 Canvas 引用
      canvas = canvasElement
      ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('无法获取 Canvas 2D 上下文')
      }

      console.log('✅ Canvas 元素已设置', {
        width: canvas.width,
        height: canvas.height,
      })

      // 初始化音频系统
      initializeAudioSystem()

      // 设置播放监听器
      setupPlaybackListeners()

      startRenderLoop()

      // 标记为就绪
      isMediaBunnyReady.value = true
      mediaBunnyError.value = null

      console.log('✅ MediaBunny 渲染系统初始化完成')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      mediaBunnyError.value = `MediaBunny 初始化失败: ${errorMessage}`
      isMediaBunnyReady.value = false
      throw error
    }
  }

  /**
   * 销毁 MediaBunny 渲染系统
   */
  async function destroy(): Promise<void> {
    console.log('🧹 清理 MediaBunny 渲染系统资源')

    // 停止渲染循环
    stopRenderLoop()

    // 停止所有音频
    stopAllAudioNodes()

    // 清空 Canvas（如果存在）
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    // 关闭 AudioContext
    if (audioContext) {
      await audioContext.close()
      audioContext = null
    }

    // 清理 bunnyCurFrameMap 中的所有 VideoSample
    for (const [itemId, videoSample] of bunnyCurFrameMap) {
      videoSample.close()
    }
    bunnyCurFrameMap.clear()

    // 清理引用（不删除 canvas 元素，由 Vue 组件管理）
    canvas = null
    ctx = null
    gainNode = null

    // 清理状态
    isMediaBunnyReady.value = false

    console.log('✅ MediaBunny 渲染系统资源清理完成')
  }

  // ==================== 渲染循环 ====================

  /**
   * 启动渲染循环
   */
  function startRenderLoop(): void {
    if (renderLoopCleanup) {
      console.warn('⚠️ 渲染循环已在运行')
      return
    }

    renderStart = performance.now()
    renderRunCnt = 0

    renderLoopCleanup = workerTimer(() => {
      // 使用真实时间作为基准，避免音画不同步
      if ((performance.now() - renderStart) / (expectFrameTime * renderRunCnt) < 1) {
        return
      }

      // 执行渲染帧
      renderFrame()

      renderRunCnt++
    }, expectFrameTime)

    console.log('🎬 MediaBunny 渲染循环已启动')
  }

  /**
   * 停止渲染循环
   */
  function stopRenderLoop(): void {
    if (renderLoopCleanup) {
      renderLoopCleanup()
      renderLoopCleanup = null
      console.log('⏸️ MediaBunny 渲染循环已停止')
    }
  }

  /**
   * 获取当前播放时间
   * 使用 AudioContext 时钟作为基准，确保精确同步
   */
  function getCurrentPlaybackTime(): number {
    const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)
    if (!playbackModule.isPlaying.value || !audioContext || audioContextStartTime === null) {
      return playbackTimeAtStart
    }

    return audioContext.currentTime - audioContextStartTime + playbackTimeAtStart
  }

  /**
   * 渲染单帧（网格式布局）
   * 使用 bunnyCurFrameMap 和 timelineItem.runtime 中的数据进行渲染
   * 从 playbackModule 获取播放状态
   */
  function renderFrame(): void {
    if (!canvas || !ctx) {
      return
    }

    // 获取依赖模块
    const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)
    const timelineModule = registry.get<UnifiedTimelineModule>(MODULE_NAMES.TIMELINE)
    const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)

    // 从 playbackModule 获取播放状态
    const isPlaying = playbackModule.isPlaying.value

    if (!isPlaying) {
      return
    }

    // 基于真实时间计算当前播放时间（秒）
    const currentTime = getCurrentPlaybackTime()

    // 计算当前播放时间（帧数）
    let currentTimeN = BigInt(Math.floor(currentTime * RENDERER_FPS))

    // 检查是否播放结束
    if (currentTimeN >= durationN) {
      currentTimeN = durationN
      playbackModule.setPlaying(false)

      console.log('✅ 播放结束')
      return
    }

    // 更新所有 clips（调用 tickN 更新 bunnyCurFrameMap）
    updateClips(timelineModule.timelineItems.value, currentTimeN)

    // 渲染到 Canvas（使用 bunnyCurFrameMap 和 runtime 中的数据）
    renderToCanvas(timelineModule.timelineItems.value, mediaModule)

    // 更新 playbackModule.currentFrame
    playbackModule.setCurrentFrame(Number(currentTimeN))
  }

  /**
   * 更新所有 clips
   * 调用 bunnyClip.tickN() 更新 bunnyCurFrameMap 和处理音频
   */
  async function updateClips(
    timelineItems: UnifiedTimelineItemData<MediaType>[],
    currentTimeN: bigint,
  ): Promise<void> {
    if (updating) return
    updating = true
    await Promise.all(
      timelineItems.map(async (item) => {
        // 处理视频/音频
        if (item.mediaType === 'video' || item.mediaType === 'audio') {
          const bunnyClip = item.runtime.bunnyClip
          if (bunnyClip) {
            const { audio, video, state } = await bunnyClip.tickN(currentTimeN)

            if (state === 'success') {
              // 更新 bunnyCurFrameMap
              if (video) {
                // 先关闭旧帧
                const oldFrame = bunnyCurFrameMap.get(item.id)
                oldFrame?.close()
                bunnyCurFrameMap.set(item.id, video.clone())
                video.close()
              }

              // 调度音频
              scheduleAudioBuffers(audio, bunnyClip.getPlaybackRate())
            } else {
              // 清理无效帧
              const oldFrame = bunnyCurFrameMap.get(item.id)
              oldFrame?.close()
              bunnyCurFrameMap.delete(item.id)
            }
          }
        }
      }),
    )
    updating = false
  }

  /**
   * 渲染到 Canvas（网格布局）
   * 使用 bunnyCurFrameMap 和 timelineItem.runtime 中的数据：
   * - bunnyCurFrameMap.get(item.id) (视频)
   * - runtime.textBitmap (文本)
   * - mediaItem.runtime.bunny.imageClip (图片)
   */
  function renderToCanvas(
    timelineItems: UnifiedTimelineItemData<MediaType>[],
    mediaModule: UnifiedMediaModule,
  ): void {
    if (!canvas || !ctx) return

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 收集所有可渲染的项目
    const renderableItems = timelineItems.filter((item) => {
      if (item.mediaType === 'video') {
        return bunnyCurFrameMap.has(item.id)
      } else if (item.mediaType === 'text') {
        return item.runtime.textBitmap !== undefined
      } else if (item.mediaType === 'image') {
        const mediaItem = mediaModule.getMediaItem(item.mediaItemId)
        return mediaItem?.runtime.bunny?.imageClip !== undefined
      }
      return false
    })

    const itemCount = renderableItems.length
    if (itemCount === 0) return

    // 计算网格行列数（尽量接近正方形）
    const cols = Math.ceil(Math.sqrt(itemCount))
    const rows = Math.ceil(itemCount / cols)

    // 计算每个单元格的宽高
    const cellWidth = canvas.width / cols
    const cellHeight = canvas.height / rows

    // 绘制所有项目
    renderableItems.forEach((item, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = col * cellWidth
      const y = row * cellHeight

      try {
        if (item.mediaType === 'video') {
          // 渲染视频帧
          const videoSample = bunnyCurFrameMap.get(item.id)
          if (videoSample) {
            const videoFrame = videoSample.toVideoFrame()
            ctx!.drawImage(videoFrame, x, y, cellWidth, cellHeight)
            videoFrame.close()
          }
        } else if (item.mediaType === 'text' && item.runtime.textBitmap) {
          // 渲染文本
          ctx!.drawImage(item.runtime.textBitmap, x, y, cellWidth, cellHeight)
        } else if (item.mediaType === 'image') {
          // 渲染图片
          const mediaItem = mediaModule.getMediaItem(item.mediaItemId)
          const imageClip = mediaItem?.runtime.bunny?.imageClip
          if (imageClip) {
            ctx!.drawImage(imageClip, x, y, cellWidth, cellHeight)
          }
        }
      } catch (error) {
        console.error(`❌ 渲染项目失败: ${item.id}`, error)
      }
    })
  }

  // ==================== 音频系统 ====================

  /**
   * 初始化音频系统
   */
  function initializeAudioSystem(): void {
    audioContext = new AudioContext({
      sampleRate: AUDIO_DEFAULT_SAMPLE_RATE,
    })
    gainNode = audioContext.createGain()
    gainNode.connect(audioContext.destination)
    console.log(`🎧 AudioContext 已创建，采样率: ${audioContext.sampleRate}Hz`)
  }

  /**
   * 调度音频缓冲
   */
  function scheduleAudioBuffers(audioSamples: AudioSample[], rate: number): void {
    if (!audioContext || !gainNode) return

    for (const sample of audioSamples) {
      const node = audioContext.createBufferSource()
      node.buffer = sample.toAudioBuffer()
      node.playbackRate.value = rate
      node.connect(gainNode)

      const startTimestamp = audioContextStartTime! + sample.timestamp - playbackTimeAtStart

      const curTime = audioContext.currentTime
      if (startTimestamp >= curTime) {
        node.start(startTimestamp)
      } else {
        const offset = curTime - startTimestamp
        node.start(curTime, offset)
      }

      queuedAudioNodes.add(node)

      node.onended = () => {
        queuedAudioNodes.delete(node)
      }

      sample.close()
    }
  }

  /**
   * 停止所有音频节点
   */
  function stopAllAudioNodes(): void {
    for (const node of queuedAudioNodes) {
      try {
        node.stop()
      } catch (err) {
        // 忽略已停止的节点
      }
    }
    queuedAudioNodes.clear()
  }

  // ==================== 播放控制 ====================

  /**
   * 启动 MediaBunny 渲染循环
   * 由 UnifiedPlaybackModule 调用
   */
  async function startPlayback(): Promise<void> {
    if (!audioContext) {
      initializeAudioSystem()
    }

    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    // 设置音频时间锚点
    const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)
    audioContextStartTime = audioContext!.currentTime
    playbackTimeAtStart = playbackModule.currentFrame.value / RENDERER_FPS

    console.log('▶️ MediaBunny 开始播放')
  }

  /**
   * 停止 MediaBunny 渲染循环
   * 由 UnifiedPlaybackModule 调用
   */
  async function stopPlayback(): Promise<void> {
    // 停止所有音频
    stopAllAudioNodes()

    // 更新播放时间锚点
    const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)
    playbackTimeAtStart = playbackModule.currentFrame.value / RENDERER_FPS

    console.log('⏸️ MediaBunny 停止播放')
  }

  /**
   * 跳转到指定帧
   * 由 UnifiedPlaybackModule 调用
   */
  async function seekToFrame(frames: number): Promise<void> {
    // 停止所有音频
    stopAllAudioNodes()

    // 限制帧数范围
    const clampedFrames = Math.max(0, Math.min(Number(durationN), frames))

    // 获取依赖模块
    const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)
    const timelineModule = registry.get<UnifiedTimelineModule>(MODULE_NAMES.TIMELINE)
    const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)

    // 更新所有 clips
    const currentTimeN = BigInt(clampedFrames)
    await updateClips(timelineModule.timelineItems.value, currentTimeN)

    // 渲染到 Canvas
    renderToCanvas(timelineModule.timelineItems.value, mediaModule)

    console.log(`⏩ MediaBunny Seek 到: ${clampedFrames}帧`)
  }

  /**
   * 更新项目时长
   * @param newDurationN 项目时长（帧数，bigint类型）
   */
  function updateTimelineDuration(newDurationN: bigint): void {
    durationN = newDurationN
    const durationSeconds = Number(newDurationN) / RENDERER_FPS
    console.log(`🎯 更新项目时长: ${durationSeconds.toFixed(2)}s ${newDurationN}帧`)
  }

  // ==================== 事件监听 ====================

  /**
   * 设置播放监听器
   * 监听 UnifiedPlaybackModule 的状态变化
   */
  function setupPlaybackListeners(): void {
    const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)
    const timelineModule = registry.get<UnifiedTimelineModule>(MODULE_NAMES.TIMELINE)
    const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)
    const configModule = registry.get<UnifiedConfigModule>(MODULE_NAMES.CONFIG)

    // 初始化时同步时间轴时长到播放器
    updateTimelineDuration(BigInt(configModule.timelineDurationFrames.value))
    console.log(`🎯 [MediaBunny] 初始化播放器时长: ${configModule.timelineDurationFrames.value}帧`)

    // 监听帧数变化（用于 seek）
    watch(playbackModule.currentFrame, (newFrame, oldFrame) => {
      if (!playbackModule.isPlaying.value && newFrame !== oldFrame) {
        // 非播放状态下的帧数变化，需要更新渲染
        const currentTimeN = BigInt(newFrame)
        updateClips(timelineModule.timelineItems.value, currentTimeN)
        renderToCanvas(timelineModule.timelineItems.value, mediaModule)
      }
    })

    // 监听时间轴时长变化，自动更新 MediaBunny 播放器时长
    watch(
      configModule.timelineDurationFrames,
      (newDurationFrames) => {
        updateTimelineDuration(BigInt(newDurationFrames))
        console.log(`🎯 [MediaBunny] 时间轴时长变化，已更新播放器时长: ${newDurationFrames}帧`)
      },
      { immediate: true },
    )

    console.log('✅ MediaBunny 播放监听器已设置')
  }

  // ==================== 工具方法 ====================

  /**
   * 检查 MediaBunny 是否可用
   * @returns 是否可用
   */
  function isMediaBunnyAvailable(): boolean {
    return !!(canvas && ctx && isMediaBunnyReady.value && !mediaBunnyError.value)
  }

  /**
   * 获取 MediaBunny 状态摘要
   * @returns MediaBunny 状态摘要对象
   */
  function getMediaBunnySummary() {
    const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)

    return {
      hasCanvas: !!canvas,
      isReady: isMediaBunnyReady.value,
      hasError: !!mediaBunnyError.value,
      error: mediaBunnyError.value,
      isAvailable: isMediaBunnyAvailable(),
      canvasInfo: canvas
        ? {
            width: canvas.width,
            height: canvas.height,
          }
        : null,
      durationN: durationN.toString(),
      playbackState: {
        isPlaying: playbackModule.isPlaying.value,
        currentFrame: playbackModule.currentFrame.value,
      },
    }
  }

  /**
   * 重置 MediaBunny 状态为默认值
   */
  function resetToDefaults(): Promise<void> {
    return destroy()
  }

  // ==================== 导出接口 ====================

  return {
    // 状态
    isMediaBunnyReady,
    mediaBunnyError,

    // 画布管理
    setCanvas,
    destroy,

    // 播放控制
    startPlayback,
    stopPlayback,
    seekToFrame,
    updateTimelineDuration,

    // 工具方法
    isMediaBunnyAvailable,
    getMediaBunnySummary,
    resetToDefaults,
  }
}

// 导出类型定义
export type UnifiedMediaBunnyModule = ReturnType<typeof createUnifiedMediaBunnyModule>
