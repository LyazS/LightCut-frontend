/**
 * 项目导出工具
 * 提供视频项目导出为 MP4 文件的功能
 * 以及单个素材导出功能
 */

import {
  Output,
  Mp4OutputFormat,
  Mp3OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioSampleSource,
  QUALITY_VERY_LOW,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_HIGH,
  QUALITY_VERY_HIGH,
  type Quality,
  type WrappedAudioBuffer,
} from 'mediabunny'

/**
 * 带音量信息的音频缓冲
 */
export interface AudioBufferWithVolume {
  /** 音频缓冲数组 */
  buffers: WrappedAudioBuffer[]
  /** 对应的音量值 (0-1) */
  volume: number
}
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { MediaType } from '@/core/mediaitem'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { IClip } from '@/core/mediabunny/IClip'
import { TimelineItemFactory } from '@/core/timelineitem/factory'
import { TimelineItemQueries } from '@/core/timelineitem/queries'
import { AudioSegmentRenderer } from '@/core/mediabunny/audio-segment-renderer'
import { RENDERER_FPS, AUDIO_DEFAULT_SAMPLE_RATE } from '@/core/mediabunny/constant'
import { applyAnimationToConfig } from '@/core/utils/animationInterpolation'
import {
  renderToCanvas,
  type FrameData,
  type RenderContext,
} from '@/core/bunnyUtils/canvasRenderer'
import { setupTimelineItemBunny } from '@/core/bunnyUtils/timelineItemSetup'

/**
 * 导出类型
 */
export type ExportType = 'video' | 'audio'

/**
 * 导出项目参数接口
 */
export interface ExportProjectOptions {
  /** 导出类型（视频或仅音频） */
  exportType: ExportType
  /** 视频分辨率宽度 */
  videoWidth: number
  /** 视频分辨率高度 */
  videoHeight: number
  /** 项目名称 */
  projectName: string
  /** 时间轴项目列表 */
  timelineItems: UnifiedTimelineItemData<MediaType>[]
  /** 轨道列表 */
  tracks: { id: string; isVisible: boolean; isMuted: boolean }[]
  /** 获取媒体项目的函数 */
  getMediaItem: (id: string) => UnifiedMediaItemData | undefined
  /** 进度更新回调函数（可选） */
  onProgress?: (stage: string, progress: number, details?: string) => void
  /** 视频质量 */
  videoQuality: Quality
  /** 音频质量 */
  audioQuality: Quality
  /** 导出帧率（可选，默认 30fps） */
  frameRate?: number
}

/**
 * 导出单个媒体项目参数
 */
export interface ExportMediaItemOptions {
  /** 媒体项目数据 */
  mediaItem: UnifiedMediaItemData
  /** 进度更新回调（可选） */
  onProgress?: (progress: number) => void
  /** 导出帧率（可选，默认 30fps，仅视频有效） */
  frameRate?: number
}

/**
 * 导出单个时间轴项目参数
 */
export interface ExportTimelineItemOptions {
  /** 时间轴项目数据 */
  timelineItem: UnifiedTimelineItemData
  /** 获取媒体项目的函数 */
  getMediaItem: (id: string) => UnifiedMediaItemData | undefined
  /** 进度更新回调（可选） */
  onProgress?: (progress: number) => void
  /** 导出类型（可选，仅视频时间轴项目支持音频导出） */
  exportType?: ExportType
  /** 导出帧率（可选，默认 30fps，仅视频有效） */
  frameRate?: number
}

/**
 * 导出取消错误类
 * 用于区分取消操作和其他错误
 */
export class ExportCancelledError extends Error {
  constructor() {
    super('导出已取消')
    this.name = 'ExportCancelledError'
  }
}

/**
 * 导出管理器类
 * 封装所有导出逻辑
 */
export class ExportManager {
  // Canvas 相关
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  // MediaBunny 组件
  private output: Output | null = null
  private canvasSource: CanvasSource | null = null
  private audioSource: AudioSampleSource | null = null

  // 音频渲染器
  private audioSegmentRenderer: AudioSegmentRenderer | null = null

  // 克隆的时间轴项目
  private clonedTimelineItems: UnifiedTimelineItemData<MediaType>[] = []

  // Clip 映射表（使用 TimelineItem ID 作为键）
  private clipsMap: Map<string, IClip> = new Map()

  // 帧数据映射（类似 UnifiedMediaBunnyModule 的 bunnyCurFrameMap）
  private bunnyCurFrameMap: Map<string, FrameData> = new Map()

  // 导出配置
  private config: ExportProjectOptions

  // 帧率配置
  private frameRate: number

  // 控制标志
  private isExporting: boolean = false
  private shouldCancel: boolean = false

  constructor(config: ExportProjectOptions) {
    this.config = config
    this.frameRate = config.frameRate ?? RENDERER_FPS
    console.log(`✅ 导出帧率设置为: ${this.frameRate}fps`)
  }

  /**
   * 创建 Canvas
   */
  private createCanvas(width: number, height: number): void {
    // 创建离屏 Canvas（不添加到 DOM）
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height

    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      throw new Error('无法创建 Canvas 2D 上下文')
    }
    this.ctx = ctx

    console.log(`✅ 创建导出 Canvas: ${width}x${height}`)
  }

  /**
   * 克隆并重建时间轴项目
   */
  private async cloneAndRebuildTimelineItems(
    originalItems: UnifiedTimelineItemData<MediaType>[],
    getMediaItem: (id: string) => UnifiedMediaItemData | undefined,
  ): Promise<UnifiedTimelineItemData<MediaType>[]> {
    const clonedItems: UnifiedTimelineItemData<MediaType>[] = []
    this.clipsMap = new Map() // 初始化 clipsMap

    for (const originalItem of originalItems) {
      // 1. 使用 TimelineItemFactory.clone 克隆项目
      const clonedItem = TimelineItemFactory.clone(originalItem)

      // 2. 获取关联的媒体项目（如果需要）
      let mediaItem: UnifiedMediaItemData | undefined
      if (
        TimelineItemQueries.isVideoTimelineItem(clonedItem) ||
        TimelineItemQueries.isAudioTimelineItem(clonedItem) ||
        TimelineItemQueries.isImageTimelineItem(clonedItem)
      ) {
        mediaItem = getMediaItem(clonedItem.mediaItemId)
        if (!mediaItem) {
          throw new Error(`找不到媒体项目: ${clonedItem.mediaItemId}`)
        }
      }

      // 3. 使用 setupTimelineItemBunny 重建 runtime
      await setupTimelineItemBunny(clonedItem, mediaItem)

      // 4. 如果是音视频项目，添加到 clipsMap
      if (clonedItem.runtime.bunnyClip) {
        this.clipsMap.set(clonedItem.id, clonedItem.runtime.bunnyClip)
      }

      clonedItems.push(clonedItem)
    }

    return clonedItems
  }

  /**
   * 渲染帧并收集音频
   */
  private async renderFrameAndCollectAudio(
    currentTimeN: number,
  ): Promise<Map<string, AudioBufferWithVolume>> {
    const audioBuffersMap = new Map<string, AudioBufferWithVolume>()

    // 🔴 关键转换：目标帧率 → 30fps
    const frameIn30fps = Math.round(currentTimeN * (RENDERER_FPS / this.frameRate))

    // 1. 更新所有 clips 的帧数据
    await Promise.all(
      this.clonedTimelineItems.map(async (item) => {
        // 应用动画插值（使用 30fps 的帧数）
        applyAnimationToConfig(item, frameIn30fps)

        // 处理视频/音频项目
        if (
          TimelineItemQueries.isVideoTimelineItem(item) ||
          TimelineItemQueries.isAudioTimelineItem(item)
        ) {
          const bunnyClip = item.runtime.bunnyClip
          if (!bunnyClip) return

          // 检查是否在时间范围内（使用 30fps 的帧数）
          if (
            frameIn30fps < item.timeRange.timelineStartTime ||
            frameIn30fps > item.timeRange.timelineEndTime
          ) {
            return
          }

          // 获取轨道静音状态
          const track = this.config.tracks.find((t) => t.id === item.trackId)
          const isTrackMuted = track?.isMuted ?? false
          const isItemMuted = item.config.isMuted ?? false
          const shouldRequestAudio = !isTrackMuted && !isItemMuted

          // 调用 tickN 获取音视频数据（使用 30fps 的帧数）
          const { audio, video, state } = await bunnyClip.tickN(
            BigInt(frameIn30fps),
            true,
            true,
            0n,
          )

          if (state === 'success') {
            // 更新视频帧
            if (video) {
              const oldFrame = this.bunnyCurFrameMap.get(item.id)
              oldFrame?.videoSample.close()
              this.bunnyCurFrameMap.set(item.id, {
                frameNumber: frameIn30fps,
                clockwiseRotation: bunnyClip.clockwiseRotation,
                videoSample: video,
              })
            }

            // 收集音频缓冲（使用 item.id 作为键）
            if (shouldRequestAudio && audio && audio.length > 0) {
              // ✅ 使用辅助函数获取当前音量值（应用了动画插值）
              const config = TimelineItemQueries.getRenderConfig(item)
              const currentVolume = config.volume ?? 1.0
              audioBuffersMap.set(item.id, {
                buffers: audio,
                volume: currentVolume,
              })
            }
          } else {
            // 清理无效帧
            const oldFrame = this.bunnyCurFrameMap.get(item.id)
            oldFrame?.videoSample.close()
            this.bunnyCurFrameMap.delete(item.id)
          }
        }
      }),
    )

    // 2. 渲染到 Canvas
    if (!this.canvas || !this.ctx) {
      throw new Error('Canvas 未初始化')
    }

    const renderContext: RenderContext = {
      canvas: this.canvas,
      ctx: this.ctx,
      bunnyCurFrameMap: this.bunnyCurFrameMap,
      getTrack: (trackId: string) => {
        const track = this.config.tracks.find((t) => t.id === trackId)
        return track ? { isVisible: track.isVisible } : undefined
      },
      getMediaItem: this.config.getMediaItem,
      trackIndexMap: new Map(this.config.tracks.map((track, index) => [track.id, index])),
    }

    renderToCanvas(renderContext, this.clonedTimelineItems, frameIn30fps)

    return audioBuffersMap
  }

  /**
   * 仅收集音频（不渲染 Canvas）
   * 用于音频导出模式
   */
  private async collectAudioOnly(
    currentTimeN: number,
  ): Promise<Map<string, AudioBufferWithVolume>> {
    const audioBuffersMap = new Map<string, AudioBufferWithVolume>()

    // 🔴 关键转换：目标帧率 → 30fps
    const frameIn30fps = Math.round(currentTimeN * (RENDERER_FPS / this.frameRate))

    // 更新所有 clips 的帧数据并收集音频
    await Promise.all(
      this.clonedTimelineItems.map(async (item) => {
        // 应用动画插值（使用 30fps 的帧数）
        applyAnimationToConfig(item, frameIn30fps)

        // 处理视频/音频项目
        if (
          TimelineItemQueries.isVideoTimelineItem(item) ||
          TimelineItemQueries.isAudioTimelineItem(item)
        ) {
          const bunnyClip = item.runtime.bunnyClip
          if (!bunnyClip) return

          // 检查是否在时间范围内（使用 30fps 的帧数）
          if (
            frameIn30fps < item.timeRange.timelineStartTime ||
            frameIn30fps > item.timeRange.timelineEndTime
          ) {
            return
          }

          // 获取轨道静音状态
          const track = this.config.tracks.find((t) => t.id === item.trackId)
          const isTrackMuted = track?.isMuted ?? false
          const isItemMuted = item.config.isMuted ?? false
          const shouldRequestAudio = !isTrackMuted && !isItemMuted

          // 调用 tickN 获取音频数据（不请求视频）
          const { audio, state } = await bunnyClip.tickN(
            BigInt(frameIn30fps),
            true,  // 需要音频
            false, // 不需要视频
            0n,
          )

          if (state === 'success' && shouldRequestAudio && audio && audio.length > 0) {
            // 获取当前音量值（应用了动画插值）
            const config = TimelineItemQueries.getRenderConfig(item)
            const currentVolume = config.volume ?? 1.0
            audioBuffersMap.set(item.id, {
              buffers: audio,
              volume: currentVolume,
            })
          }
        }
      }),
    )

    return audioBuffersMap
  }

  /**
   * 初始化音频渲染器
   */
  private async initializeAudioRenderer(): Promise<void> {
    // 初始化 AudioSegmentRenderer（传入 clipsMap）
    this.audioSegmentRenderer = new AudioSegmentRenderer({
      clips: this.clipsMap,
      segmentDuration: 1.0, // 1 秒分段
      overlapDuration: 0.1, // 0.1 秒重叠
      sampleRate: AUDIO_DEFAULT_SAMPLE_RATE,
      numberOfChannels: 2,
    })

    // 设置 AudioSource
    if (this.audioSource) {
      this.audioSegmentRenderer.setAudioSource(this.audioSource)
    }
  }

  /**
   * 计算总帧数
   */
  private calculateTotalFrames(): number {
    let maxEndTimeIn30fps = 0
    for (const item of this.clonedTimelineItems) {
      if (item.timeRange.timelineEndTime > maxEndTimeIn30fps) {
        maxEndTimeIn30fps = item.timeRange.timelineEndTime
      }
    }

    // 如果目标帧率就是30fps，直接返回，无需转换
    if (this.frameRate === RENDERER_FPS) {
      console.log(`📊 帧数计算: ${maxEndTimeIn30fps}帧@${this.frameRate}fps (无需转换)`)
      return maxEndTimeIn30fps
    }

    // 转换：30fps帧数 → 时长 → 目标帧率帧数
    const durationInSeconds = maxEndTimeIn30fps / RENDERER_FPS
    const totalFrames = Math.ceil(durationInSeconds * this.frameRate)

    console.log(
      `📊 帧数转换: ${maxEndTimeIn30fps}帧@30fps → ${durationInSeconds}秒 → ${totalFrames}帧@${this.frameRate}fps`,
    )

    return totalFrames
  }

  /**
   * 报告进度
   */
  private reportProgress(stage: string, progress: number, details?: string): void {
    this.config.onProgress?.(stage, progress, details)
  }

  /**
   * 主导出流程
   */
  async export(): Promise<Uint8Array> {
    try {
      this.isExporting = true
      this.shouldCancel = false

      const exportType = this.config.exportType
      const isAudioOnly = exportType === 'audio'

      // 阶段 1: 初始化
      if (isAudioOnly) {
        this.reportProgress('初始化', 0, '准备音频导出...')
        // 音频导出不需要 Canvas
      } else {
        this.reportProgress('初始化', 0, '创建 Canvas...')
        this.createCanvas(this.config.videoWidth, this.config.videoHeight)
      }

      // 阶段 2: 克隆项目
      this.reportProgress('准备', 5, '克隆时间轴项目...')
      this.clonedTimelineItems = await this.cloneAndRebuildTimelineItems(
        this.config.timelineItems,
        this.config.getMediaItem,
      )

      // 阶段 3: 创建 MediaBunny 组件
      this.reportProgress('准备', 10, '初始化编码器...')

      // 根据导出类型选择格式
      const outputFormat = isAudioOnly
        ? new Mp3OutputFormat()
        : new Mp4OutputFormat()

      this.output = new Output({
        format: outputFormat,
        target: new BufferTarget(),
      })

      // 只在视频导出时创建 CanvasSource
      if (!isAudioOnly) {
        this.canvasSource = new CanvasSource(this.canvas!, {
          codec: 'avc',
          bitrate: this.config.videoQuality,
        })
      }

      this.audioSource = new AudioSampleSource({
        codec: 'mp3',
        bitrate: this.config.audioQuality,
      })

      // 阶段 4: 初始化音频渲染器
      await this.initializeAudioRenderer()

      // 阶段 5: 添加轨道并启动
      if (!isAudioOnly && this.canvasSource) {
        this.output.addVideoTrack(this.canvasSource, {
          frameRate: this.frameRate,
        })
      }
      this.output.addAudioTrack(this.audioSource)

      await this.output.start()

      // 阶段 6: 渲染循环
      const totalFrames = this.calculateTotalFrames()
      const frameDuration = 1 / this.frameRate
      let lastTriggerFrame = -1 // 记录最后一次触发音频渲染的帧号

      for (let frameN = 0; frameN < totalFrames; frameN++) {
        // 检查取消
        if (this.shouldCancel) {
          await this.output.cancel()
          throw new ExportCancelledError()
        }

        // 渲染当前帧并收集音频（音频导出时跳过渲染，只收集音频）
        const audioBuffersMap = isAudioOnly
          ? await this.collectAudioOnly(frameN)
          : await this.renderFrameAndCollectAudio(frameN)

        // 添加视频帧（仅在视频导出时）
        if (!isAudioOnly && this.canvasSource) {
          const timestamp = frameN / this.frameRate
          await this.canvasSource.add(timestamp, frameDuration)
        }

        // 收集音频缓冲到缓冲区
        for (const [itemId, audioBufferWithVolume] of audioBuffersMap.entries()) {
          await this.audioSegmentRenderer!.collectAudioBuffers(
            audioBufferWithVolume.buffers,
            itemId,
            audioBufferWithVolume.volume,
          )
        }

        // 动态计算音频渲染触发点（基于目标帧率）
        const framesPerSecond = this.frameRate
        const bufferFrames = Math.round(framesPerSecond * 2) // 2秒缓冲
        const triggerInterval = Math.round(framesPerSecond) // 每秒触发一次

        if (frameN >= bufferFrames - 1 && (frameN + 1 - bufferFrames) % triggerInterval === 0) {
          const segmentStartTime = Math.floor((frameN - bufferFrames + 1) / triggerInterval) * 1.0
          await this.audioSegmentRenderer!.renderFixedSegment(segmentStartTime)
          lastTriggerFrame = frameN
        }
        /**
         * 计算模拟音频渲染进度
         * [0-170]帧
         * 0-59  ： frameN=59, segmentStartTime=0
         * 60-89 : frameN=89, segmentStartTime=1
         * 90-119: frameN=119, segmentStartTime=2
         * 120-149: frameN=149, segmentStartTime=3
         * 150-170: 不触发
         */

        // 更新进度（10% - 95%）
        const progress = 10 + ((frameN + 1) / totalFrames) * 85
        this.reportProgress('渲染', progress, `${frameN + 1}/${totalFrames}`)
      }

      // 处理最后部分
      const bufferFrames = Math.round(this.frameRate * 2)
      const triggerInterval = Math.round(this.frameRate)

      if (lastTriggerFrame >= 0) {
        // 有触发过音频渲染，且还有剩余帧
        const lastRenderedSegmentIndex = Math.floor(
          (lastTriggerFrame - bufferFrames + 1) / triggerInterval,
        )
        const finalSegmentStartTime = (lastRenderedSegmentIndex + 1) * 1.0
        const totalDuration = totalFrames / this.frameRate
        await this.audioSegmentRenderer!.finalize(finalSegmentStartTime, totalDuration)
      } else if (lastTriggerFrame < 0) {
        // 总帧数小于缓冲帧数，没有触发过任何段，需要从头处理
        const totalDuration = totalFrames / this.frameRate
        await this.audioSegmentRenderer!.finalize(0, totalDuration)
      }

      // 阶段 7: 完成音频渲染
      this.reportProgress('完成', 95, '处理音频...')
      // 音频渲染已经在主循环中处理完成

      // 阶段 8: 关闭并完成
      if (this.canvasSource) {
        this.canvasSource.close()
      }
      this.audioSource.close()
      await this.output.finalize()

      // 阶段 9: 获取结果
      this.reportProgress('完成', 100, '导出完成')
      const target = this.output.target as BufferTarget
      const buffer = target.buffer
      if (!buffer) {
        throw new Error('导出失败：未生成缓冲区')
      }

      return new Uint8Array(buffer)
    } catch (error) {
      // 区分取消操作和其他错误
      if (error instanceof ExportCancelledError) {
        console.log('⚠️ 导出已取消')
      } else {
        console.error('❌ 导出失败:', error)
      }
      throw error
    } finally {
      await this.cleanup()
    }
  }

  /**
   * 取消导出
   */
  cancel(): void {
    this.shouldCancel = true
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    console.log('🧹 清理导出资源...')

    // 清理帧数据
    for (const frameData of this.bunnyCurFrameMap.values()) {
      frameData.videoSample.close()
    }
    this.bunnyCurFrameMap.clear()

    // 清理音频渲染器
    this.audioSegmentRenderer?.dispose()

    // 清理克隆的 BunnyClips
    for (const clip of this.clipsMap.values()) {
      await clip.dispose()
    }
    this.clipsMap.clear()

    // 清理 textBitmap
    for (const item of this.clonedTimelineItems) {
      if (item.runtime.textBitmap) {
        item.runtime.textBitmap.close()
      }
    }

    // Canvas 会被垃圾回收，无需手动清理

    this.isExporting = false
    console.log('✅ 导出资源清理完成')
  }
}

/**
 * 可取消的导出项目为 MP4 文件
 * 返回取消函数，允许外部调用取消导出
 * @param options 导出项目参数
 * @param onSuccess 导出成功回调
 * @param onError 导出失败回调
 * @param onCancel 导出取消回调
 * @returns 取消函数
 */
export function exportProjectWithCancel(
  options: ExportProjectOptions,
  onSuccess?: () => void,
  onError?: (error: Error) => void,
  onCancel?: () => void,
): () => void {
  // 创建导出管理器实例
  const manager = new ExportManager(options)

  // 执行导出并保存文件
  manager
    .export()
    .then(async (data) => {
      // 根据导出类型确定文件扩展名和 MIME 类型
      const exportType = options.exportType
      const isAudioOnly = exportType === 'audio'

      const mimeType = isAudioOnly ? 'audio/mpeg' : 'video/mp4'
      const fileExtension = isAudioOnly ? 'mp3' : 'mp4'

      // 保存文件
      const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${options.projectName}.${fileExtension}`
      a.click()
      URL.revokeObjectURL(url)

      console.log(`✅ 项目导出成功（${isAudioOnly ? '音频' : '视频'}）`)
      onSuccess?.()
    })
    .catch((error) => {
      // 区分取消操作和其他错误
      if (error instanceof ExportCancelledError) {
        console.log('⚠️ 导出已取消')
        onCancel?.()
      } else {
        console.error('❌ 导出失败:', error)
        onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    })

  // 返回取消函数
  return () => manager.cancel()
}

/**
 * 导出图片媒体项目为 PNG Blob
 */
async function exportImageMediaItem(
  mediaItem: UnifiedMediaItemData,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  // 1. 验证 imageClip 存在
  const imageClip = mediaItem.runtime.bunny?.imageClip
  if (!imageClip) {
    throw new Error('媒体项目未就绪：imageClip 不存在')
  }

  onProgress?.(20)

  // 2. 创建临时 Canvas（仅用于格式转换）
  const canvas = document.createElement('canvas')
  canvas.width = imageClip.width
  canvas.height = imageClip.height
  const ctx = canvas.getContext('2d')!

  // 3. 绘制图片（无任何变换，保持原样）
  ctx.drawImage(imageClip, 0, 0)

  onProgress?.(60)

  // 4. 转换为 PNG Blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('图片转换失败'))
      }
    }, 'image/png')
  })

  onProgress?.(100)

  return blob
}

/**
 * 导出视频媒体项目为 MP4 Blob
 */
async function exportVideoMediaItem(
  mediaItem: UnifiedMediaItemData,
  onProgress?: (progress: number) => void,
  frameRate?: number,
): Promise<Blob> {
  // 1. 验证媒体项目状态
  if (mediaItem.mediaStatus !== 'ready') {
    throw new Error('媒体项目未就绪')
  }

  const bunnyMedia = mediaItem.runtime.bunny?.bunnyMedia
  if (!bunnyMedia) {
    throw new Error('媒体项目未就绪：bunnyMedia 不存在')
  }
  await bunnyMedia.ready

  // 2. 创建临时时间轴项目（覆盖整个媒体时长）
  const durationInFrames = Number(bunnyMedia.durationN)
  const tempTimelineItem: UnifiedTimelineItemData<'video'> = {
    id: 'temp-export-item',
    mediaType: 'video',
    mediaItemId: mediaItem.id,
    trackId: 'temp-track',
    timelineStatus: 'ready',
    timeRange: {
      timelineStartTime: 0,
      timelineEndTime: durationInFrames,
      clipStartTime: 0,
      clipEndTime: durationInFrames,
    },
    config: {
      // VideoMediaConfig = VisualProps & AudioProps
      x: 0,
      y: 0,
      width: bunnyMedia.width,
      height: bunnyMedia.height,
      rotation: 0,
      opacity: 1,
      proportionalScale: true,
      volume: 1,
      isMuted: false,
    },
    runtime: {
      isInitialized: true, // 导出场景：临时创建的项目，已完成初始化
    },
  }

  // 3. 构造 ExportProjectOptions
  const exportOptions: ExportProjectOptions = {
    exportType: 'video',
    videoWidth: bunnyMedia.width,
    videoHeight: bunnyMedia.height,
    projectName: 'temp-export',
    timelineItems: [tempTimelineItem],
    tracks: [{ id: 'temp-track', isVisible: true, isMuted: false }],
    getMediaItem: (id: string) => (id === mediaItem.id ? mediaItem : undefined),
    onProgress: onProgress ? (stage, progress) => onProgress(progress) : undefined,
    videoQuality: QUALITY_MEDIUM,
    audioQuality: QUALITY_MEDIUM,
    frameRate: frameRate,
  }

  // 4. 使用 ExportManager 导出
  const manager = new ExportManager(exportOptions)
  const videoData = await manager.export()

  // 5. 返回 Blob
  return new Blob([videoData.buffer as ArrayBuffer], { type: 'video/mp4' })
}

/**
 * 导出音频媒体项目为 Blob（直接返回原始文件）
 */
async function exportAudioMediaItem(
  mediaItem: UnifiedMediaItemData,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  // 从 BunnyMedia 获取原始文件
  const bunnyMedia = mediaItem.runtime.bunny?.bunnyMedia
  if (!bunnyMedia) {
    throw new Error('媒体项目未就绪：bunnyMedia 不存在')
  }

  const oriFile = bunnyMedia.getOriFile()
  if (!oriFile) {
    throw new Error('无法获取原始音频文件')
  }

  onProgress?.(100)
  return new Blob([oriFile], { type: oriFile.type })
}

/**
 * 导出单个媒体项目为 Blob（使用原始尺寸）
 */
export async function exportMediaItem(options: ExportMediaItemOptions): Promise<Blob> {
  const { mediaItem, onProgress, frameRate } = options

  // 1. 类型检查
  if (mediaItem.mediaType === 'image') {
    return await exportImageMediaItem(mediaItem, onProgress)
  }

  if (mediaItem.mediaType === 'video') {
    return await exportVideoMediaItem(mediaItem, onProgress, frameRate)
  }

  if (mediaItem.mediaType === 'audio') {
    return await exportAudioMediaItem(mediaItem, onProgress)
  }

  throw new Error(`不支持导出 ${mediaItem.mediaType} 类型的媒体项目`)
}

/**
 * 导出图片时间轴项目为 PNG Blob
 */
async function exportImageTimelineItem(
  timelineItem: UnifiedTimelineItemData,
  getMediaItem: (id: string) => UnifiedMediaItemData | undefined,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  // 1. 获取媒体项目
  const mediaItem = getMediaItem(timelineItem.mediaItemId)
  if (!mediaItem) {
    throw new Error(`找不到媒体项目: ${timelineItem.mediaItemId}`)
  }

  // 2. 直接调用 exportImageMediaItem
  return await exportImageMediaItem(mediaItem, onProgress)
}

/**
 * 导出视频时间轴项目为 MP4 Blob
 */
async function exportVideoTimelineItem(
  timelineItem: UnifiedTimelineItemData,
  getMediaItem: (id: string) => UnifiedMediaItemData | undefined,
  onProgress?: (progress: number) => void,
  frameRate?: number,
): Promise<Blob> {
  // 1. 获取媒体项目
  const mediaItem = getMediaItem(timelineItem.mediaItemId)
  if (!mediaItem) {
    throw new Error(`找不到媒体项目: ${timelineItem.mediaItemId}`)
  }

  // 2. 验证媒体项目状态
  if (mediaItem.mediaStatus !== 'ready') {
    throw new Error('媒体项目未就绪')
  }

  const bunnyMedia = mediaItem.runtime.bunny?.bunnyMedia
  if (!bunnyMedia) {
    throw new Error('媒体项目未就绪：bunnyMedia 不存在')
  }
  await bunnyMedia.ready

  // 3. 创建新的时间轴项目（只保留时间范围，重置其他配置）
  const cleanTimelineItem: UnifiedTimelineItemData<'video'> = {
    id: 'temp-export-item',
    mediaType: 'video',
    mediaItemId: mediaItem.id,
    trackId: 'temp-track',
    timelineStatus: 'ready',
    timeRange: {
      // 保留原始时间范围
      timelineStartTime: 0,
      timelineEndTime:
        timelineItem.timeRange.timelineEndTime - timelineItem.timeRange.timelineStartTime,
      clipStartTime: timelineItem.timeRange.clipStartTime,
      clipEndTime: timelineItem.timeRange.clipEndTime,
    },
    config: {
      // 重置为默认配置，不应用任何效果
      x: 0,
      y: 0,
      width: bunnyMedia.width,
      height: bunnyMedia.height,
      rotation: 0,
      opacity: 1,
      proportionalScale: true,
      volume: 1,
      isMuted: false,
    },
    runtime: {
      isInitialized: true, // 导出场景：临时创建的项目，已完成初始化
    },
  }

  // 4. 构造 ExportProjectOptions
  const exportOptions: ExportProjectOptions = {
    exportType: 'video',
    videoWidth: bunnyMedia.width,
    videoHeight: bunnyMedia.height,
    projectName: 'temp-export',
    timelineItems: [cleanTimelineItem],
    tracks: [{ id: 'temp-track', isVisible: true, isMuted: false }],
    getMediaItem: (id: string) => (id === mediaItem.id ? mediaItem : undefined),
    onProgress: onProgress ? (stage, progress) => onProgress(progress) : undefined,
    videoQuality: QUALITY_MEDIUM,
    audioQuality: QUALITY_MEDIUM,
    frameRate: frameRate,
  }

  // 5. 使用 ExportManager 导出
  const manager = new ExportManager(exportOptions)
  const videoData = await manager.export()

  // 6. 返回 Blob
  return new Blob([videoData.buffer as ArrayBuffer], { type: 'video/mp4' })
}

/**
 * 导出视频/音频时间轴项目为音频 MP3 Blob
 */
async function exportAudioTimelineItem(
  timelineItem: UnifiedTimelineItemData<'video' | 'audio'>,
  getMediaItem: (id: string) => UnifiedMediaItemData | undefined,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  // 1. 获取媒体项目
  const mediaItem = getMediaItem(timelineItem.mediaItemId)
  if (!mediaItem) {
    throw new Error(`找不到媒体项目: ${timelineItem.mediaItemId}`)
  }

  // 2. 验证媒体项目状态
  if (mediaItem.mediaStatus !== 'ready') {
    throw new Error('媒体项目未就绪')
  }

  const bunnyMedia = mediaItem.runtime.bunny?.bunnyMedia
  if (!bunnyMedia) {
    throw new Error('媒体项目未就绪：bunnyMedia 不存在')
  }
  await bunnyMedia.ready

  // 3. 创建新的时间轴项目（只保留时间范围，重置其他配置）
  const cleanTimelineItem: UnifiedTimelineItemData<'video' | 'audio'> = {
    ...timelineItem,
    id: 'temp-export-item',
    trackId: 'temp-track',
    timelineStatus: 'ready',
    timeRange: {
      timelineStartTime: 0,
      timelineEndTime:
        timelineItem.timeRange.timelineEndTime - timelineItem.timeRange.timelineStartTime,
      clipStartTime: timelineItem.timeRange.clipStartTime,
      clipEndTime: timelineItem.timeRange.clipEndTime,
    },
    config: {
      // 重置为默认配置
      x: 0,
      y: 0,
      width: timelineItem.mediaType === 'video' ? bunnyMedia.width : 0,
      height: timelineItem.mediaType === 'video' ? bunnyMedia.height : 0,
      rotation: 0,
      opacity: 1,
      proportionalScale: true,
      volume: 1,
      isMuted: false,
    },
    runtime: {
      isInitialized: true,
    },
  }

  // 4. 构造 ExportProjectOptions - 使用音频导出
  const exportOptions: ExportProjectOptions = {
    exportType: 'audio',
    videoWidth: timelineItem.mediaType === 'video' ? bunnyMedia.width : 1920,
    videoHeight: timelineItem.mediaType === 'video' ? bunnyMedia.height : 1080,
    projectName: 'temp-export',
    timelineItems: [cleanTimelineItem],
    tracks: [{ id: 'temp-track', isVisible: true, isMuted: false }],
    getMediaItem: (id: string) => (id === mediaItem.id ? mediaItem : undefined),
    onProgress: onProgress ? (stage, progress) => onProgress(progress) : undefined,
    videoQuality: QUALITY_MEDIUM,
    audioQuality: QUALITY_MEDIUM,
    frameRate: 30,
  }

  // 5. 使用 ExportManager 导出
  const manager = new ExportManager(exportOptions)
  const audioData = await manager.export()

  // 6. 返回 Blob
  return new Blob([audioData.buffer as ArrayBuffer], { type: 'audio/mpeg' })
}

/**
 * 导出单个时间轴项目为 Blob（使用原始尺寸）
 */
export async function exportTimelineItem(options: ExportTimelineItemOptions): Promise<Blob> {
  const { timelineItem, onProgress, getMediaItem, frameRate, exportType } = options

  // 1. 类型检查
  if (timelineItem.mediaType === 'image') {
    return await exportImageTimelineItem(timelineItem, getMediaItem, onProgress)
  }

  if (timelineItem.mediaType === 'video') {
    // 如果指定了音频导出类型，导出为音频
    if (exportType === 'audio') {
      return await exportAudioTimelineItem(timelineItem as UnifiedTimelineItemData<'video'>, getMediaItem, onProgress)
    }
    return await exportVideoTimelineItem(timelineItem, getMediaItem, onProgress, frameRate)
  }

  if (timelineItem.mediaType === 'audio') {
    // 音频时间轴项目只能导出为音频
    return await exportAudioTimelineItem(timelineItem as UnifiedTimelineItemData<'audio'>, getMediaItem, onProgress)
  }

  throw new Error(`不支持导出 ${timelineItem.mediaType} 类型的时间轴项目`)
}
