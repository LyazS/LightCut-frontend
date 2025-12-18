import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioSampleSource,
  VideoSample,
  AudioSample,
  QUALITY_MEDIUM,
} from 'mediabunny'
import type { IClip } from './IClip'
import { RENDERER_FPS, AUDIO_DEFAULT_SAMPLE_RATE } from './constant'
import { AudioSegmentRenderer } from './audio-segment-renderer'

/**
 * 导出配置接口
 */
export interface ExportConfig {
  // 视频配置
  videoCodec: 'avc' | 'hevc'
  videoBitrate: number // bps，例如 5000000 = 5Mbps

  // 音频配置
  audioCodec: 'mp3' // 仅支持 MP3 编码
  audioBitrate: number // bps，例如 128000 = 128kbps

  // 进度回调
  onProgress?: (progress: number, currentFrame: number, totalFrames: number) => void

  // 错误回调
  onError?: (error: Error) => void
}

/**
 * 导出管理器
 * 负责协调 MediaBunny 的 Output、CanvasSource 和 AudioSampleSource
 */
export class ExportManager {
  private output: Output | null = null
  private canvasSource: CanvasSource | null = null
  private audioSource: AudioSampleSource | null = null
  private isExporting: boolean = false
  private shouldCancel: boolean = false

  // 保持每个 clip 的当前视频帧状态
  private currentVideoFrames: (VideoSample | null)[] = []

  // 音频分段渲染器
  private audioSegmentRenderer: AudioSegmentRenderer

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
    private clips: IClip[],
    private durationN: bigint,
    private config: ExportConfig,
  ) {
    // 初始化视频帧数组，大小与 clips 数量相同，初始值为 null
    this.currentVideoFrames = new Array(clips.length).fill(null)

    // 初始化音频分段渲染器
    this.audioSegmentRenderer = new AudioSegmentRenderer({
      clips: this.clips,
      segmentDuration: 1.0, // 1 秒分段
      overlapDuration: 0.1, // 0.1 秒重叠
      sampleRate: AUDIO_DEFAULT_SAMPLE_RATE,
      numberOfChannels: 2,
    })
  }

  /**
   * 开始导出
   * @returns 导出的视频文件数据 (Uint8Array)
   */
  async export(): Promise<Uint8Array> {
    try {
      this.isExporting = true
      this.shouldCancel = false

      // 1. 创建 Output
      this.output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
      })

      // 2. 创建 CanvasSource
      this.canvasSource = new CanvasSource(this.canvas, {
        codec: this.config.videoCodec,
        bitrate: this.config.videoBitrate,
      })

      // 3. 创建 AudioSampleSource
      // 注意：AudioSampleSource 会自动从输入的 AudioSample 中获取采样率和声道数
      this.audioSource = new AudioSampleSource({
        codec: this.config.audioCodec,
        bitrate: QUALITY_MEDIUM,
      })

      // 3.1 设置 AudioSource 到音频分段渲染器
      this.audioSegmentRenderer.setAudioSource(this.audioSource)

      // 4. 添加轨道
      this.output.addVideoTrack(this.canvasSource, {
        frameRate: RENDERER_FPS,
      })
      this.output.addAudioTrack(this.audioSource)

      // 5. 启动 Output
      await this.output.start()

      // 6. 导出循环
      const totalFrames = Number(this.durationN)
      const frameDuration = 1 / RENDERER_FPS

      for (let frameN = 0n; frameN < this.durationN; frameN++) {
        // 检查是否取消
        if (this.shouldCancel) {
          await this.output.cancel()
          throw new Error('Export cancelled by user')
        }

        // 渲染当前帧到 canvas 并收集音频（一次 tickN 完成）
        const audioSamplesMap = await this.renderFrameAndCollectAudio(frameN)

        // 添加视频帧到 CanvasSource
        const timestamp = Number(frameN) / RENDERER_FPS
        await this.canvasSource.add(timestamp, frameDuration)

        // 将音频样本传递给 AudioSegmentRenderer
        // 不再直接添加到 audioSource
        for (const [clipIndex, audioSamples] of audioSamplesMap.entries()) {
          await this.audioSegmentRenderer.collectAudioSamples(
            frameN,
            audioSamples,
            clipIndex,
          )
        }

        // 更新进度
        if (this.config.onProgress) {
          const progress = Number(frameN + 1n) / totalFrames
          this.config.onProgress(progress, Number(frameN + 1n), totalFrames)
        }
      }

      // 7. 完成音频渲染（强制渲染所有剩余样本）
      await this.audioSegmentRenderer.finalize()

      // 8. 关闭 sources
      this.canvasSource.close()
      this.audioSource.close()

      // 9. 完成导出
      await this.output.finalize()

      // 10. 获取结果
      const target = this.output.target as BufferTarget
      const buffer = target.buffer
      if (!buffer) {
        throw new Error('Export failed: no buffer generated')
      }

      return new Uint8Array(buffer)
    } catch (error) {
      if (this.config.onError) {
        this.config.onError(error as Error)
      }
      throw error
    } finally {
      this.isExporting = false

      // 清理所有视频帧
      for (const frame of this.currentVideoFrames) {
        frame?.close()
      }
      this.currentVideoFrames = []

      // 清理音频分段渲染器
      this.audioSegmentRenderer.dispose()
    }
  }

  /**
   * 取消导出
   */
  cancel(): void {
    this.shouldCancel = true
  }

  /**
   * 渲染单帧到 canvas 并收集音频样本
   * @param currentTimeN 当前帧号
   * @returns 音频样本数组
   */
  private async renderFrameAndCollectAudio(
    currentTimeN: bigint,
  ): Promise<Map<number, AudioSample[]>> {
    const audioSamplesMap = new Map<number, AudioSample[]>()

    // 获取所有 clips 的当前帧数据（一次 tickN 同时获取视频和音频）
    await Promise.all(
      this.clips.map(async (clip, i) => {
        if (clip) {
          const { video, audio, state } = await clip.tickN(currentTimeN)

          if (state === 'success') {
            // 更新视频帧（如果有新帧）
            if (video) {
              // 先关闭旧帧
              this.currentVideoFrames[i]?.close()
              this.currentVideoFrames[i] = video
            }
            // 收集音频样本（按 clip 索引）
            if (audio && audio.length > 0) {
              audioSamplesMap.set(i, audio)
            }
          } else {
            // 如果 clip 超出范围，清空该位置的视频帧
            this.currentVideoFrames[i]?.close()
            this.currentVideoFrames[i] = null
          }
        }
      }),
    )

    // 清空画布
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // 计算网格布局（只计算非 null 的帧）
    const validFrames = this.currentVideoFrames.filter((f) => f !== null)
    const videoCount = validFrames.length

    if (videoCount > 0) {
      const cols = Math.ceil(Math.sqrt(videoCount))
      const rows = Math.ceil(videoCount / cols)
      const cellWidth = this.canvas.width / cols
      const cellHeight = this.canvas.height / rows

      // 绘制所有视频帧
      let index = 0
      for (const frame of this.currentVideoFrames) {
        if (frame) {
          const col = index % cols
          const row = Math.floor(index / cols)
          const x = col * cellWidth
          const y = row * cellHeight

          const videoFrame = frame.toVideoFrame()
          this.ctx.drawImage(videoFrame, x, y, cellWidth, cellHeight)
          videoFrame.close()
          index++
        }
      }
    }

    return audioSamplesMap
  }
}
