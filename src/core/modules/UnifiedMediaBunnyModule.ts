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

import { ref, watch, type Ref } from 'vue'
import { workerTimer } from '@/core/mediabunny/worker-timer'
import { RENDERER_FPS, AUDIO_DEFAULT_SAMPLE_RATE } from '@/core/mediabunny/constant'
import { throttle } from 'lodash'
import { canEncodeAudio } from 'mediabunny'
import { registerMp3Encoder } from '@mediabunny/mp3-encoder'
import { ModuleRegistry, MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedTimelineModule } from './UnifiedTimelineModule'
import type { UnifiedMediaModule } from './UnifiedMediaModule'
import type { UnifiedPlaybackModule } from './UnifiedPlaybackModule'
import type { UnifiedConfigModule } from './UnifiedConfigModule'
import type { UnifiedTrackModule } from './UnifiedTrackModule'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { MediaType } from '@/core/mediaitem/types'
import type { WrappedAudioBuffer } from 'mediabunny'
import { applyAnimationToConfig } from '@/core/utils/animationInterpolation'
import { TimelineItemQueries } from '@/core/timelineitem/queries'
import {
  renderToCanvas,
  type FrameData,
  type RenderContext,
} from '@/core/bunnyUtils/canvasRenderer'
import { TimelineItemsBufferManager } from '@/core/mediabunny/TimelineItemsBufferManager'

if (!(await canEncodeAudio('mp3'))) {
  registerMp3Encoder()
  console.log('已注册mp3编码器')
}

export function createUnifiedMediaBunnyModule(
  registry: ModuleRegistry,
  contentEndTimeFrames: Ref<number>,
) {
  const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)
  const timelineModule = registry.get<UnifiedTimelineModule>(MODULE_NAMES.TIMELINE)
  const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)
  const trackModule = registry.get<UnifiedTrackModule>(MODULE_NAMES.TRACK)

  // ==================== 状态定义 ====================

  // 模块就绪状态
  const isMediaBunnyReady = ref(false)
  const mediaBunnyError = ref<string | null>(null)

  // Canvas 相关（由外部传入）
  let mCanvas: HTMLCanvasElement | null = null
  let mCtx: CanvasRenderingContext2D | null = null

  // 渲染循环相关
  let mRenderLoopCleanup: (() => void) | null = null
  const mExpectFrameTime: number = 1000 / RENDERER_FPS
  let mUpdatingClip: boolean = false

  // ✨ 双缓冲管理器
  let mBufferManager: TimelineItemsBufferManager | null = null

  // Web Audio API 相关
  let mAudioContext: AudioContext | null = null
  let mGainNode: GainNode | null = null

  // 音频调度相关
  const mQueuedAudioNodes = new Set<AudioBufferSourceNode>()

  // 时间同步锚点（用于音频调度）
  let mAudioContextStartTime: number | null = null
  let mPlaybackTimeAtStart: number = 0

  // 当前bunny播放帧数（整数）
  const mCurrentBunnyFrame = ref(0)
  // 项目时长（帧数）
  let mTimelineDuration: number = 0

  // bunnyCurFrame 映射表（key: timelineItemId, value: FrameData）
  const mBunnyCurFrameMap = new Map<string, FrameData>()

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
      mCanvas = canvasElement
      mCtx = mCanvas.getContext('2d')

      if (!mCtx) {
        throw new Error('无法获取 Canvas 2D 上下文')
      }

      console.log('✅ Canvas 元素已设置', {
        width: mCanvas.width,
        height: mCanvas.height,
      })

      // ✨ 初始化缓冲管理器
      mBufferManager = new TimelineItemsBufferManager(RENDERER_FPS)

      // 初始化音频系统
      initializeAudioSystem()
      // 设置播放监听器
      setupPlaybackListeners()
      // 初始化就启动渲染循环
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
    if (mCanvas && mCtx) {
      mCtx.clearRect(0, 0, mCanvas.width, mCanvas.height)
    }

    // 关闭 AudioContext
    if (mAudioContext) {
      await mAudioContext.close()
      mAudioContext = null
    }

    // 清理 bunnyCurFrameMap 中的所有 VideoSample
    for (const [itemId, frameData] of mBunnyCurFrameMap) {
      frameData.videoSample.close()
    }
    mBunnyCurFrameMap.clear()

    // ✨ 清理缓冲管理器
    if (mBufferManager) {
      mBufferManager.clearBuffers()
      mBufferManager = null
    }

    // 清理引用（不删除 canvas 元素，由 Vue 组件管理）
    mCanvas = null
    mCtx = null
    mGainNode = null

    // 清理状态
    isMediaBunnyReady.value = false

    console.log('✅ MediaBunny 渲染系统资源清理完成')
  }

  // ==================== 渲染循环 ====================

  /**
   * 启动渲染循环
   */
  function startRenderLoop(): void {
    if (mRenderLoopCleanup) {
      console.warn('⚠️ 渲染循环已在运行')
      return
    }

    const renderStart = performance.now()
    let renderRunCnt = 0
    mRenderLoopCleanup = workerTimer(() => {
      // 使用真实时间作为基准，避免音画不同步
      if ((performance.now() - renderStart) / (mExpectFrameTime * renderRunCnt) < 1) {
        return
      }

      // 播放的情况下，会基于真实时间单调增长获取当前播放时间（秒）
      // 暂停的情况下，会使用mPlaybackTimeAtStart作为基准，即seek的时候只需要更新mPlaybackTimeAtStart就行了
      // 然后再来计算当前播放帧数
      let currentTime = Math.floor(getCurrentPlaybackTime() * RENDERER_FPS)

      // 检查是否播放结束
      if (playbackModule.isPlaying.value && currentTime >= mTimelineDuration) {
        playbackModule.setPlaying(false)
        playbackModule.setCurrentFrame(mTimelineDuration)
        console.log('✅ 播放结束')
        return
      }

      // 不断更新clip帧数据,如果是播放则需要解码音频
      updateClips(timelineModule.timelineItems.value, currentTime, playbackModule.isPlaying.value)
      if (playbackModule.isPlaying.value) {
        playbackModule.setCurrentFrame(currentTime)
      }

      // 渲染到 Canvas（使用 bunnyCurFrameMap 和 runtime 中的数据）
      renderToCanvasWrapper(timelineModule.timelineItems.value, currentTime)

      renderRunCnt++
    }, mExpectFrameTime)

    console.log('🎬 MediaBunny 渲染循环已启动')
  }

  /**
   * 停止渲染循环
   */
  function stopRenderLoop(): void {
    if (mRenderLoopCleanup) {
      mRenderLoopCleanup()
      mRenderLoopCleanup = null
      console.log('⏸️ MediaBunny 渲染循环已停止')
    }
  }

  /**
   * 获取当前播放时间
   * 使用 AudioContext 时钟作为基准，确保精确同步
   */
  function getCurrentPlaybackTime(): number {
    if (!playbackModule.isPlaying.value || !mAudioContext || mAudioContextStartTime === null) {
      return mPlaybackTimeAtStart
    }

    return mAudioContext.currentTime - mAudioContextStartTime + mPlaybackTimeAtStart
  }

  /**
   * 更新单个 clip 的帧数据
   * 异步调用 bunnyClip.tickN() 更新 bunnyCurFrameMap 和处理音频
   * @param item 时间轴项目
   * @param currentTime 当前时间（帧数）
   * @param shouldPlayAudio 是否应该播放音频（考虑轨道和项目静音状态）
   */
  async function updateClipFrame(
    item: UnifiedTimelineItemData<MediaType>,
    currentTime: number,
    shouldPlayAudio: boolean,
    volume: number,
  ): Promise<void> {
    const bunnyClip = item.runtime.bunnyClip
    if (!bunnyClip) return

    // 检查当前帧数是否需要更新
    const frameData = mBunnyCurFrameMap.get(item.id)
    if (frameData?.frameNumber === currentTime) {
      // 帧数相同，跳过更新
      return
    }

    // 异步更新帧数据
    // tickN 内部限制必须解码完才能解码下一个
    // 未解码完就再次执行 tickN 会返回 ‘skip’
    // 这是第二层频率限制
    const { audio, video, state } = await bunnyClip.tickN(
      BigInt(currentTime),
      shouldPlayAudio, //根据轨道和项目静音状态决定是否请求音频
      true, //总是请求视频帧
    )
    if (state === 'skip') {
      // 什么都不做，调用 tickN 太频繁了
    } else if (state === 'success') {
      // 更新 bunnyCurFrameMap
      if (video) {
        const oldFrame = mBunnyCurFrameMap.get(item.id)
        oldFrame?.videoSample.close()
        mBunnyCurFrameMap.set(item.id, {
          frameNumber: currentTime,
          clockwiseRotation: bunnyClip.clockwiseRotation,
          videoSample: video,
        })
      }

      // 调度音频（只在需要播放音频时）
      if (shouldPlayAudio && audio) {
        scheduleAudioBuffers(audio, bunnyClip.getPlaybackRate(), volume)
      }
    } else {
      // 清理无效帧
      const oldFrame = mBunnyCurFrameMap.get(item.id)
      oldFrame?.videoSample.close()
      mBunnyCurFrameMap.delete(item.id)
    }
  }

  /**
   * 更新所有 clips
   * 调用 bunnyClip.tickN() 更新 bunnyCurFrameMap 和处理音频
   */
  function updateClips(
    timelineItems: UnifiedTimelineItemData<MediaType>[],
    currentTime: number,
    playAudio: boolean,
  ): void {
    // mUpdatingClip 可以防止过度更新
    // 这是第一层防御，第二层在clip内部来限制过度更新
    if (mUpdatingClip) return
    mUpdatingClip = true

    // ✨ 使用缓冲管理器获取要处理的 items
    const itemsToProcess =
      mBufferManager && playbackModule.isPlaying.value
        ? mBufferManager.getItemsForRendering(timelineItems, currentTime)
        : timelineItems

    // ✨ 检查是否需要更新后台缓冲
    if (
      playbackModule.isPlaying.value &&
      mBufferManager &&
      mBufferManager.shouldUpdateBuffer(currentTime)
    ) {
      // 异步更新后台缓冲，不阻塞当前渲染
      void mBufferManager.updateBackBuffer(timelineItems, currentTime)
    }

    for (const item of itemsToProcess) {
      // 应用动画插值到 config
      applyAnimationToConfig(item, currentTime)

      // 处理视频/音频
      if (
        TimelineItemQueries.isVideoTimelineItem(item) ||
        TimelineItemQueries.isAudioTimelineItem(item)
      ) {
        const track = trackModule.getTrack(item.trackId || '')
        const isTrackMuted = track?.isMuted ?? false

        // ✅ 使用辅助函数获取渲染配置（包含动画插值后的音量）
        const config = TimelineItemQueries.getRenderConfig(item)
        const isItemMuted = config.isMuted ?? false
        const itemVolume = config.volume ?? 1.0
        const shouldPlayAudio = playAudio && !isTrackMuted && !isItemMuted

        // 更新 clip 帧数据（不等待完成，使用 void）
        // 这里不等待，因此会后台执行，飞快地跳过这里，导致整个 updateClips 都会快速执行一遍
        // 按照 workerTimer 频率来执行，可能会在解码慢跟不上的时候多次重复执行
        // 因此内部也需要一些策略来限制频率
        void updateClipFrame(item, currentTime, shouldPlayAudio, itemVolume)
      }
    }

    mCurrentBunnyFrame.value = currentTime
    mUpdatingClip = false
  }

  /**
   * 渲染到 Canvas 的包装函数
   * 调用独立的 renderToCanvas 工具函数
   *
   * @param timelineItems 时间轴项目列表
   * @param currentTimeN 当前播放时间（帧数）
   */
  function renderToCanvasWrapper(
    timelineItems: UnifiedTimelineItemData<MediaType>[],
    currentTimeN: number,
  ): void {
    if (!mCanvas || !mCtx) return

    // 构建渲染上下文
    const renderContext: RenderContext = {
      canvas: mCanvas,
      ctx: mCtx,
      bunnyCurFrameMap: mBunnyCurFrameMap,
      getTrack: (trackId: string) => trackModule.getTrack(trackId),
      getMediaItem: (mediaItemId: string) => mediaModule.getMediaItem(mediaItemId),
      trackIndexMap: trackModule.trackIndexMap.value,
    }

    // 调用独立的渲染函数
    renderToCanvas(renderContext, timelineItems, currentTimeN)
  }

  // ==================== 音频系统 ====================

  /**
   * 初始化音频系统
   */
  function initializeAudioSystem(): void {
    mAudioContext = new AudioContext({
      sampleRate: AUDIO_DEFAULT_SAMPLE_RATE,
    })
    mGainNode = mAudioContext.createGain()
    mGainNode.connect(mAudioContext.destination)
    console.log(`🎧 AudioContext 已创建，采样率: ${mAudioContext.sampleRate}Hz`)
  }

  /**
   * 调度音频缓冲
   */
  function scheduleAudioBuffers(
    wrappedBuffers: WrappedAudioBuffer[],
    rate: number,
    volume: number,
  ): void {
    if (!mAudioContext || !mGainNode) return

    for (const wrapped of wrappedBuffers) {
      const node = mAudioContext.createBufferSource()
      node.buffer = wrapped.buffer // 直接使用 AudioBuffer，无需转换
      node.playbackRate.value = rate

      // 为每个音频节点创建独立的增益节点以控制音量
      const gainNode = mAudioContext.createGain()
      gainNode.gain.value = volume
      node.connect(gainNode)
      gainNode.connect(mGainNode)

      const startTimestamp = mAudioContextStartTime! + wrapped.timestamp - mPlaybackTimeAtStart
      const curTime = mAudioContext.currentTime
      if (startTimestamp >= curTime) {
        node.start(startTimestamp)
      } else {
        node.start(curTime, curTime - startTimestamp)
      }
      mQueuedAudioNodes.add(node)
      node.onended = () => {
        mQueuedAudioNodes.delete(node)
      }

      // ✅ 不需要 close()，AudioBuffer 由浏览器自动管理
    }
  }

  /**
   * 停止所有音频节点
   */
  function stopAllAudioNodes(): void {
    for (const node of mQueuedAudioNodes) {
      try {
        node.stop()
      } catch (err) {
        // 忽略已停止的节点
      }
    }
    mQueuedAudioNodes.clear()
  }

  // ==================== 播放控制 ====================

  /**
   * 启动 MediaBunny 渲染循环
   * 由 UnifiedPlaybackModule 调用
   */
  async function startPlayback(): Promise<void> {
    if (!mAudioContext) {
      console.error('未初始化 AudioContext')
      return
    }

    if (mAudioContext && mAudioContext.state === 'suspended') {
      await mAudioContext.resume()
    }

    // 设置音频时间锚点
    mAudioContextStartTime = mAudioContext!.currentTime
    mPlaybackTimeAtStart = playbackModule.currentFrame.value / RENDERER_FPS

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
    mPlaybackTimeAtStart = playbackModule.currentFrame.value / RENDERER_FPS
  }

  /**
   * 跳转到指定帧
   * 由 UnifiedPlaybackModule 调用
   */
  function seekToFrame(frames: number): void {
    stopAllAudioNodes()

    // ✨ Seek 时清空所有缓冲
    if (mBufferManager) {
      mBufferManager.clearBuffers()
    }

    // seek只需要更新 mPlaybackTimeAtStart 即可
    // 渲染循环会不断以 mPlaybackTimeAtStart 为基准点来渲染
    const clampedFrames = Math.max(0, Math.min(mTimelineDuration, frames))
    mPlaybackTimeAtStart = clampedFrames / RENDERER_FPS
  }

  /**
   * 更新项目时长
   * @param newDurationN 项目时长（帧数，number类型）
   */
  function updateTimelineDuration(newDurationN: number): void {
    mTimelineDuration = newDurationN
    const durationSeconds = newDurationN / RENDERER_FPS
    console.log(`🎯 更新项目时长: ${durationSeconds.toFixed(2)}s ${newDurationN}帧`)
  }

  // ==================== 事件监听 ====================

  // 创建节流函数，100ms内只执行一次
  const throttledSeekToFrame = throttle(async (frame: number) => {
    seekToFrame(frame)
  }, 100)
  /**
   * 设置播放监听器
   * 监听 UnifiedPlaybackModule 的状态变化
   */
  function setupPlaybackListeners(): void {
    // 监听帧数变化（用于 seek）
    watch([playbackModule.currentFrame, mCurrentBunnyFrame], ([new_cf, new_cbf]) => {
      if (new_cf != new_cbf && !playbackModule.isPlaying.value) {
        throttledSeekToFrame(new_cf)
      }
    })

    // 监听时间轴时长变化，自动更新 MediaBunny 播放器时长
    watch(
      contentEndTimeFrames,
      (newDurationFrames) => {
        updateTimelineDuration(newDurationFrames)
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
    return !!(mCanvas && mCtx && isMediaBunnyReady.value && !mediaBunnyError.value)
  }

  /**
   * 重置 MediaBunny 状态为默认值
   */
  function resetToDefaults(): Promise<void> {
    return destroy()
  }

  // ==================== 截帧功能 ====================

  /**
   * 截取当前画布画面并下载
   * @param filename 下载文件名（可选，默认为 'screenshot-时间戳.png'）
   * @returns Promise<Blob> 返回截取的 Blob 对象
   */
  async function captureCanvasFrame(filename?: string): Promise<Blob> {
    if (!mCanvas || !mCtx) {
      throw new Error('Canvas 未初始化，无法截帧')
    }

    try {
      // 将 Canvas 内容转换为 Blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        mCanvas!.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Canvas 转换为 Blob 失败'))
            }
          },
          'image/png',
          1.0, // 最高质量
        )
      })

      // 生成文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const defaultFilename = `screenshot-${timestamp}.png`
      const finalFilename = filename || defaultFilename

      // 创建下载链接并触发下载
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = finalFilename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      console.log(`📸 画布截帧成功: ${finalFilename}`)
      return blob
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('❌ 画布截帧失败:', errorMessage)
      throw error
    }
  }

  // ==================== 导出接口 ====================

  return {
    // 状态
    isMediaBunnyReady,
    mediaBunnyError,
    currentBunnyFrame: mCurrentBunnyFrame,

    // 画布管理
    setCanvas,
    destroy,

    // 播放控制
    startPlayback,
    stopPlayback,
    seekToFrame,
    updateTimelineDuration,

    // 截帧功能
    captureCanvasFrame,

    // 工具方法
    isMediaBunnyAvailable,
    resetToDefaults,
  }
}

// 导出类型定义
export type UnifiedMediaBunnyModule = ReturnType<typeof createUnifiedMediaBunnyModule>
