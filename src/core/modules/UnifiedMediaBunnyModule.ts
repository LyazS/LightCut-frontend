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
import { throttle } from 'lodash'
import type { VideoSample } from 'mediabunny'
import { ModuleRegistry, MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedTimelineModule } from './UnifiedTimelineModule'
import type { UnifiedMediaModule } from './UnifiedMediaModule'
import type { UnifiedPlaybackModule } from './UnifiedPlaybackModule'
import type { UnifiedConfigModule } from './UnifiedConfigModule'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/TimelineItemData'
import type { MediaType } from '@/core/mediaitem/types'
import type { AudioSample } from 'mediabunny'

/**
 * 帧数据接口
 * 包含帧数和对应的 VideoSample
 */
export interface FrameData {
  frameNumber: number
  videoSample: VideoSample
}

export function createUnifiedMediaBunnyModule(
  registry: ModuleRegistry,
  totalDurationFrames: Ref<number>,
) {
  const playbackModule = registry.get<UnifiedPlaybackModule>(MODULE_NAMES.PLAYBACK)
  const timelineModule = registry.get<UnifiedTimelineModule>(MODULE_NAMES.TIMELINE)
  const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)

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
      void updateClips(
        timelineModule.timelineItems.value,
        currentTime,
        playbackModule.isPlaying.value,
      )
      if (playbackModule.isPlaying.value) {
        playbackModule.setCurrentFrame(currentTime)
      }

      // 渲染到 Canvas（使用 bunnyCurFrameMap 和 runtime 中的数据）
      renderToCanvas(timelineModule.timelineItems.value, currentTime)

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
   * 更新所有 clips
   * 调用 bunnyClip.tickN() 更新 bunnyCurFrameMap 和处理音频
   */
  async function updateClips(
    timelineItems: UnifiedTimelineItemData<MediaType>[],
    currentTime: number,
    playAudio: boolean,
  ): Promise<void> {
    if (mUpdatingClip) return
    mUpdatingClip = true

    await Promise.all(
      timelineItems.map(async (item) => {
        // 处理视频/音频
        if (item.mediaType === 'video' || item.mediaType === 'audio') {
          const bunnyClip = item.runtime.bunnyClip
          if (bunnyClip) {
            // 检查当前帧数是否需要更新
            const frameData = mBunnyCurFrameMap.get(item.id)
            if (frameData?.frameNumber === currentTime) {
              // 帧数相同，无需更新
              return
            }

            const { audio, video, state } = await bunnyClip.tickN(
              BigInt(currentTime),
              playAudio, //按需请求音频
              true, //总是请求视频帧
            )

            if (state === 'success') {
              // 更新 bunnyCurFrameMap
              if (video) {
                const oldFrame = mBunnyCurFrameMap.get(item.id)
                oldFrame?.videoSample.close()
                mBunnyCurFrameMap.set(item.id, {
                  frameNumber: currentTime,
                  videoSample: video,
                })
              }

              // 调度音频
              if (playAudio) scheduleAudioBuffers(audio, bunnyClip.getPlaybackRate())
            } else {
              // 清理无效帧
              const oldFrame = mBunnyCurFrameMap.get(item.id)
              oldFrame?.videoSample.close()
              mBunnyCurFrameMap.delete(item.id)
            }
          }
        }
      }),
    )

    mCurrentBunnyFrame.value = currentTime
    mUpdatingClip = false
  }

  /**
   * 渲染到 Canvas（网格布局）
   * 使用 bunnyCurFrameMap 和 timelineItem.runtime 中的数据：
   * - bunnyCurFrameMap.get(item.id) (视频)
   * - runtime.textBitmap (文本)
   * - mediaItem.runtime.bunny.imageClip (图片)
   * @param timelineItems 时间轴项目列表
   * @param currentTimeN 当前播放时间（帧数，bigint类型）
   */
  function renderToCanvas(
    timelineItems: UnifiedTimelineItemData<MediaType>[],
    currentTimeN: number,
  ): void {
    if (!mCanvas || !mCtx) return

    // 清空画布
    mCtx.clearRect(0, 0, mCanvas.width, mCanvas.height)

    // 收集所有可渲染的项目（需要同时满足：可渲染 + 在当前时间范围内）
    const renderableItems = timelineItems.filter((item) => {
      // 检查是否在当前播放时间范围内
      const isInTimeRange =
        currentTimeN >= item.timeRange.timelineStartTime &&
        currentTimeN <= item.timeRange.timelineEndTime

      if (!isInTimeRange) {
        return false
      }

      // 检查是否可渲染
      if (item.mediaType === 'video') {
        return mBunnyCurFrameMap.has(item.id)
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
    const cellWidth = mCanvas.width / cols
    const cellHeight = mCanvas.height / rows

    // 绘制所有项目
    renderableItems.forEach((item, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = col * cellWidth
      const y = row * cellHeight

      try {
        if (item.mediaType === 'video') {
          const frameData = mBunnyCurFrameMap.get(item.id)
          if (frameData) {
            const videoFrame = frameData.videoSample.toVideoFrame()
            mCtx!.drawImage(videoFrame, x, y, cellWidth, cellHeight)
            videoFrame.close()
          }
        } else if (item.mediaType === 'text' && item.runtime.textBitmap) {
          mCtx!.drawImage(item.runtime.textBitmap, x, y, cellWidth, cellHeight)
        } else if (item.mediaType === 'image') {
          const mediaItem = mediaModule.getMediaItem(item.mediaItemId)
          const imageClip = mediaItem?.runtime.bunny?.imageClip
          if (imageClip) {
            mCtx!.drawImage(imageClip, x, y, cellWidth, cellHeight)
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
  function scheduleAudioBuffers(audioSamples: AudioSample[], rate: number): void {
    if (!mAudioContext || !mGainNode) return

    for (const sample of audioSamples) {
      const node = mAudioContext.createBufferSource()
      node.buffer = sample.toAudioBuffer()
      node.playbackRate.value = rate
      node.connect(mGainNode)

      const startTimestamp = mAudioContextStartTime! + sample.timestamp - mPlaybackTimeAtStart
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

      sample.close()
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

    console.log('⏸️ MediaBunny 停止播放')
  }

  /**
   * 跳转到指定帧
   * 由 UnifiedPlaybackModule 调用
   */
  function seekToFrame(frames: number): void {
    stopAllAudioNodes()

    // seek只需要更新 mPlaybackTimeAtStart 即可
    // 渲染循环会不断以 mPlaybackTimeAtStart 为基准点来渲染
    const clampedFrames = Math.max(0, Math.min(mTimelineDuration, frames))
    mPlaybackTimeAtStart = clampedFrames / RENDERER_FPS

    console.log(`⏩ MediaBunny Seek 到: ${clampedFrames}帧`)
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
    console.log(`🎯 [MediaBunny] 帧数变化，已触发帧同步: ${mCurrentBunnyFrame} -> ${frame}`)
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
      totalDurationFrames,
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

    // 工具方法
    isMediaBunnyAvailable,
    resetToDefaults,
  }
}

// 导出类型定义
export type UnifiedMediaBunnyModule = ReturnType<typeof createUnifiedMediaBunnyModule>
