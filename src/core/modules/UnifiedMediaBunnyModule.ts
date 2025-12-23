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
 */

import { ref, markRaw, watch, type Ref } from 'vue'
import { workerTimer } from '@/core/mediabunny/worker-timer'
import { RENDERER_FPS, AUDIO_DEFAULT_SAMPLE_RATE } from '@/core/mediabunny/constant'
import type { PlaybackState } from '@/core/mediabunny/types'
import type { BunnyClip } from '@/core/mediabunny/bunny-clip'
import { ModuleRegistry, MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedTimelineModule } from './UnifiedTimelineModule'
import type { UnifiedMediaModule } from './UnifiedMediaModule'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/TimelineItemData'
import type { MediaType } from '@/core/mediaitem/types'
import type { AudioSample } from 'mediabunny'

export function createUnifiedMediaBunnyModule(registry: ModuleRegistry) {
  // ==================== 状态定义 ====================
  
  // 播放状态
  const playbackState = ref<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentTimeN: 0n,
    durationN: 0n,
  })
  
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
  
  // Web Audio API 相关
  let audioContext: AudioContext | null = null
  let gainNode: GainNode | null = null
  
  // 时间同步锚点
  let audioContextStartTime: number | null = null
  let playbackTimeAtStart: number = 0
  
  // 音频调度相关
  const queuedAudioNodes = new Set<AudioBufferSourceNode>()
  
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
      
      // 启动渲染循环
      startRenderLoop()
      
      // 设置事件监听器
      setupEventListeners()
      
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
    if (renderLoopCleanup) {
      renderLoopCleanup()
      renderLoopCleanup = null
    }
    
    // 停止播放
    playbackState.value.isPlaying = false
    
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
   * 渲染单帧（网格式布局）
   * 直接使用 timelineItem.runtime 中的数据进行渲染
   */
  async function renderFrame(): Promise<void> {
    if (!canvas || !ctx || !playbackState.value.isPlaying) {
      return
    }
    
    // 获取依赖模块
    const timelineModule = registry.get<UnifiedTimelineModule>(MODULE_NAMES.TIMELINE)
    const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)
    
    // 计算当前播放时间
    const currentTime = getCurrentPlaybackTime()
    const currentTimeN = BigInt(Math.floor(currentTime * RENDERER_FPS))
    playbackState.value.currentTime = currentTime
    playbackState.value.currentTimeN = currentTimeN
    
    // 检查是否播放结束
    if (currentTimeN >= playbackState.value.durationN) {
      playbackState.value.currentTimeN = playbackState.value.durationN
      playbackState.value.isPlaying = false
      console.log('✅ 播放结束')
      return
    }
    
    // 更新所有 clips（调用 tickN 更新 runtime.bunnyCurFrame）
    await updateClips(timelineModule.timelineItems.value, currentTimeN)
    
    // 渲染到 Canvas（使用 runtime 中的数据）
    renderToCanvas(timelineModule.timelineItems.value, mediaModule)
  }
  
  /**
   * 更新所有 clips
   * 调用 bunnyClip.tickN() 更新 runtime.bunnyCurFrame 和处理音频
   */
  async function updateClips(
    timelineItems: UnifiedTimelineItemData<MediaType>[],
    currentTimeN: bigint
  ): Promise<void> {
    await Promise.all(
      timelineItems.map(async (item) => {
        // 检查是否在时间范围内
        if (
          currentTimeN < item.timeRange.timelineStartTime ||
          currentTimeN > item.timeRange.timelineEndTime
        ) {
          // 清理过期帧
          if (item.runtime.bunnyCurFrame) {
            item.runtime.bunnyCurFrame.close()
            item.runtime.bunnyCurFrame = undefined
          }
          return
        }
        
        // 处理视频/音频
        if (item.mediaType === 'video' || item.mediaType === 'audio') {
          const bunnyClip = item.runtime.bunnyClip
          if (bunnyClip) {
            const { audio, video, state } = await bunnyClip.tickN(currentTimeN)
            
            if (state === 'success') {
              // 更新 runtime.bunnyCurFrame
              if (video && item.mediaType === 'video') {
                // 先关闭旧帧
                if (item.runtime.bunnyCurFrame) {
                  item.runtime.bunnyCurFrame.close()
                }
                item.runtime.bunnyCurFrame = video
              }
              
              // 调度音频
              if (audio.length > 0) {
                scheduleAudioBuffers(audio, bunnyClip.getPlaybackRate())
              }
            } else {
              // 清理无效帧
              if (item.runtime.bunnyCurFrame) {
                item.runtime.bunnyCurFrame.close()
                item.runtime.bunnyCurFrame = undefined
              }
            }
          }
        }
      })
    )
  }
  
  /**
   * 渲染到 Canvas（网格布局）
   * 使用 timelineItem.runtime 中的数据：
   * - runtime.bunnyCurFrame (视频)
   * - runtime.textBitmap (文本)
   * - mediaItem.runtime.bunny.imageClip (图片)
   */
  function renderToCanvas(
    timelineItems: UnifiedTimelineItemData<MediaType>[],
    mediaModule: UnifiedMediaModule
  ): void {
    if (!canvas || !ctx) return
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // 收集所有可渲染的项目
    const renderableItems = timelineItems.filter((item) => {
      if (item.mediaType === 'video') {
        return item.runtime.bunnyCurFrame !== undefined
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
        if (item.mediaType === 'video' && item.runtime.bunnyCurFrame) {
          // 渲染视频帧
          const videoFrame = item.runtime.bunnyCurFrame.toVideoFrame()
          ctx!.drawImage(videoFrame, x, y, cellWidth, cellHeight)
          videoFrame.close()
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
      
      const startTimestamp =
        audioContextStartTime! + sample.timestamp - playbackTimeAtStart
      
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
   * 开始播放
   */
  async function play(): Promise<void> {
    if (!audioContext) {
      initializeAudioSystem()
    }
    
    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    
    audioContextStartTime = audioContext!.currentTime
    playbackState.value.isPlaying = true
    
    console.log('▶️ MediaBunny 开始播放')
  }
  
  /**
   * 暂停播放
   */
  function pause(): void {
    const currentTimeN = BigInt(Math.floor(getCurrentPlaybackTime() * RENDERER_FPS))
    playbackTimeAtStart = Number(currentTimeN) / RENDERER_FPS
    
    playbackState.value.isPlaying = false
    stopAllAudioNodes()
    
    console.log('⏸️ MediaBunny 暂停播放')
  }
  
  /**
   * 跳转到指定帧
   */
  async function seekTo(timestampN: bigint): Promise<void> {
    playbackState.value.isPlaying = false
    stopAllAudioNodes()
    
    const durationN = playbackState.value.durationN
    timestampN = timestampN < 0n ? 0n : timestampN
    timestampN = timestampN > durationN ? durationN : timestampN
    
    playbackTimeAtStart = Number(timestampN) / RENDERER_FPS
    playbackState.value.currentTimeN = timestampN
    
    console.log(`⏩ MediaBunny Seek 到: ${timestampN}帧`)
  }
  
  /**
   * 获取当前播放时间
   */
  function getCurrentPlaybackTime(): number {
    if (!playbackState.value.isPlaying || !audioContext) {
      return playbackTimeAtStart
    }
    
    return audioContext.currentTime - audioContextStartTime! + playbackTimeAtStart
  }
  
  /**
   * 更新项目时长
   * @param durationN 项目时长（帧数，bigint类型）
   */
  function updateTimelineDuration(durationN: bigint): void {
    const durationSeconds = Number(durationN) / RENDERER_FPS
    playbackState.value.duration = durationSeconds
    playbackState.value.durationN = durationN
    console.log(`🎯 更新项目时长: ${durationSeconds.toFixed(2)}s ${durationN}帧`)
  }
  
  // ==================== 事件监听 ====================
  
  /**
   * 设置事件监听器
   */
  function setupEventListeners(): void {
    // 可以在这里添加其他事件监听器
    console.log('✅ MediaBunny 事件监听器已设置')
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
      playbackState: {
        isPlaying: playbackState.value.isPlaying,
        currentTime: playbackState.value.currentTime,
        duration: playbackState.value.duration,
        currentTimeN: playbackState.value.currentTimeN.toString(),
        durationN: playbackState.value.durationN.toString(),
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
    playbackState,
    isMediaBunnyReady,
    mediaBunnyError,
    
    // 画布管理
    setCanvas,
    destroy,
    
    // 播放控制
    play,
    pause,
    seekTo,
    updateTimelineDuration,
    
    // 工具方法
    isMediaBunnyAvailable,
    getMediaBunnySummary,
    resetToDefaults,
  }
}

// 导出类型定义
export type UnifiedMediaBunnyModule = ReturnType<typeof createUnifiedMediaBunnyModule>