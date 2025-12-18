import { VideoSample, AudioSample } from 'mediabunny'
import { ref, type Ref } from 'vue'
import type { PlaybackState } from './types'
import { AUDIO_DEFAULT_SAMPLE_RATE, RENDERER_FPS } from './constant'
import type { IClip } from './IClip'
import { workerTimer } from './worker-timer'
import { canEncodeAudio } from 'mediabunny'
import { registerMp3Encoder } from '@mediabunny/mp3-encoder'
import { ExportManager, type ExportConfig } from './export-manager'

if (!(await canEncodeAudio('mp3'))) {
  registerMp3Encoder()
  console.log('已注册mp3编码器')
}
/**
 * 媒体播放器核心类 - 统一管理视频和音频播放状态
 */
export class AVCanvas {
  public playbackState: Ref<PlaybackState> = ref({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentTimeN: 0n,
    durationN: 0n,
  })
  currentVideoFrames: (VideoSample | null)[] = []
  private updating: boolean = false

  // Canvas 相关
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  // 渲染循环相关
  private renderLoopCleanup: (() => void) | null = null
  private renderStart: number = 0
  private renderRunCnt: number = 0
  private expectFrameTime: number = 1000 / RENDERER_FPS

  // Web Audio API 相关
  private audioContext: AudioContext
  private gainNode: GainNode

  // 时间同步锚点
  private audioContextStartTime: number | null = null
  private playbackTimeAtStart: number = 0

  // 🆕 音频调度相关
  private queuedAudioNodes: Set<AudioBufferSourceNode> = new Set()

  // Clips 引用（用于渲染循环）
  private clips: IClip[] = []

  // 当前导出管理器实例（用于取消导出）
  private currentExportManager: ExportManager | null = null

  constructor() {
    // 初始化 AudioContext
    this.audioContext = new AudioContext({
      sampleRate: AUDIO_DEFAULT_SAMPLE_RATE,
    })
    this.gainNode = this.audioContext.createGain()
    this.gainNode.connect(this.audioContext.destination)
    console.log(`🎧 AudioContext 已创建，采样率: ${this.audioContext.sampleRate}Hz`)
  }

  /**
   * 设置 Canvas 并启动渲染循环
   * @param canvas Canvas 元素
   */
  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

    if (!this.ctx) {
      console.error('❌ 无法获取 Canvas 2D 上下文')
      return
    }

    // 启动渲染循环
    this.startRenderLoop()
    console.log('✅ Canvas 已设置，渲染循环已启动')
  }

  /**
   * 设置 Clips
   * @param clips IClip 实例数组
   */
  setClips(clips: IClip[]): void {
    this.clips = clips
    console.log(`✅ 已设置 ${clips.length} 个 Clip`)
  }

  /**
   * 启动渲染循环
   */
  private startRenderLoop(): void {
    if (this.renderLoopCleanup) {
      console.warn('⚠️ 渲染循环已在运行')
      return
    }

    this.renderStart = performance.now()
    this.renderRunCnt = 0

    this.renderLoopCleanup = workerTimer(() => {
      // workerTimer 会略快于真实时钟，使用真实时间（performance.now）作为基准
      // 跳过部分运行帧修正时间，避免导致音画不同步
      if ((performance.now() - this.renderStart) / (this.expectFrameTime * this.renderRunCnt) < 1) {
        return
      }

      this.update(this.clips) // 更新播放状态，获取 currentAudioBuffers

      // 渲染到 Canvas
      if (this.canvas && this.ctx && this.currentVideoFrames.length > 0) {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

        // 计算网格布局
        const videoCount = this.currentVideoFrames.filter((f) => f !== null).length
        if (videoCount === 0) return

        // 计算网格行列数（尽量接近正方形）
        const cols = Math.ceil(Math.sqrt(videoCount))
        const rows = Math.ceil(videoCount / cols)

        // 计算每个视频的宽高
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

            const use_frame = frame.toVideoFrame()
            this.ctx.drawImage(use_frame, x, y, cellWidth, cellHeight)
            use_frame.close()
            index++
          }
        }
      }

      this.renderRunCnt++
    }, this.expectFrameTime)

    console.log('🎬 渲染循环已启动')
  }

  /**
   * 停止渲染循环
   */
  private stopRenderLoop(): void {
    if (this.renderLoopCleanup) {
      this.renderLoopCleanup()
      this.renderLoopCleanup = null
      console.log('🛑 渲染循环已停止')
    }
  }

  /**
   * 获取当前播放时间
   * 使用 AudioContext 时钟作为基准，确保精确同步
   */
  private getCurrentPlaybackTime(): number {
    if (!this.playbackState.value.isPlaying || !this.audioContext) {
      return this.playbackTimeAtStart
    }

    return this.audioContext.currentTime - this.audioContextStartTime! + this.playbackTimeAtStart
  }

  /**
   * 开始播放
   */
  async play(): Promise<void> {
    // 恢复 AudioContext
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
      console.log('🎧 AudioContext 已恢复')
    }

    // 记录播放开始时的时间锚点
    this.audioContextStartTime = this.audioContext!.currentTime
    this.playbackState.value.isPlaying = true

    console.log('▶️ 开始播放')
  }

  /**
   * 暂停播放
   */
  pause(): void {
    // 保存当前播放时间
    const currentTimeN = BigInt(Math.floor(this.getCurrentPlaybackTime() * RENDERER_FPS))
    this.playbackTimeAtStart = Number(currentTimeN) / RENDERER_FPS

    this.playbackState.value.isPlaying = false

    // 🆕 停止所有音频
    this.stopAllAudioNodes()

    console.log('⏸️ 暂停播放')
  }

  /**
   * 检查是否正在播放
   */
  isPlaying(): boolean {
    return this.playbackState.value.isPlaying
  }

  async seekN(timestampN: bigint): Promise<void> {
    console.log(`⏩ Seek 到: ${timestampN}帧`)

    // 先暂停播放，避免 seek 过程中渲染流程还在运行
    this.playbackState.value.isPlaying = false

    // 🆕 停止所有音频
    this.stopAllAudioNodes()

    // 限制在有效范围内
    const durationN = this.playbackState.value.durationN
    timestampN = timestampN < 0n ? 0n : timestampN
    timestampN = timestampN > durationN ? durationN : timestampN

    // 更新播放时间锚点
    this.playbackTimeAtStart = Number(timestampN) / RENDERER_FPS
    this.playbackState.value.currentTimeN = timestampN

    console.log(`✅ Seek 完成`)
  }

  /**
   * 更新播放状态（在渲染循环中调用）
   * 不再需要 deltaTime 参数，直接使用 AudioContext 时间计算
   * @param clips 要更新的 IClip 实例数组
   */
  async update(clips: IClip[]): Promise<void> {
    if (!this.playbackState.value.isPlaying) {
      return
    }

    if (this.updating) return
    this.updating = true

    // 使用 AudioContext 时钟计算当前播放时间
    const currentTime = this.getCurrentPlaybackTime()
    this.playbackState.value.currentTime = currentTime
    const currentTimeN = BigInt(Math.floor(currentTime * RENDERER_FPS))
    this.playbackState.value.currentTimeN = currentTimeN
    // console.log(`⏱️ 当前播放时间: ${currentTimeN}帧`)

    if (currentTimeN >= this.playbackState.value.durationN) {
      this.playbackState.value.currentTimeN = this.playbackState.value.durationN
      this.playbackState.value.isPlaying = false
      console.log('✅ 播放结束')
      return
    }

    await Promise.all(
      clips.map(async (clip, i) => {
        if (clip) {
          // 这里输入的currentTime指的是时间轴的时间点
          const { audio: newBuffers, video: frame, state } = await clip.tickN(currentTimeN)
          if (state === 'success') {
            if (frame) {
              // 先关闭上一帧
              this.currentVideoFrames[i]?.close()
              this.currentVideoFrames[i] = frame ?? null
            }

            this.scheduleAudioBuffers(newBuffers, clip.getPlaybackRate())
          } else {
            this.currentVideoFrames[i]?.close()
            this.currentVideoFrames[i] = null
          }
        }
      }),
    )
    this.updating = false
  }

  /**
   * 调度音频缓冲进行播放
   * 在渲染循环中调用，将 currentAudioBuffers 转换为实际的音频播放
   */
  scheduleAudioBuffers(audioSamples: AudioSample[], rate: number): void {
    if (!this.audioContext || !this.gainNode) {
      return
    }

    // 遍历所有待调度的音频缓冲
    for (const sample of audioSamples) {
      // 创建音频源节点
      const node = this.audioContext.createBufferSource()
      node.buffer = sample.toAudioBuffer()
      node.playbackRate.value = rate
      node.connect(this.gainNode)

      // 计算在 AudioContext 时间轴上的开始时间
      const startTimestamp =
        this.audioContextStartTime! + sample.timestamp - this.playbackTimeAtStart

      // 关键：处理未来和过去的音频
      const curTime = this.audioContext.currentTime
      if (startTimestamp >= curTime) {
        // 未来的音频：精确调度
        node.start(startTimestamp)
      } else {
        // 过去的音频：使用 offset 播放剩余部分
        // offset 也需要考虑播放速率：实际经过的时间 * rate = 音频中的偏移量
        const offset = curTime - startTimestamp
        node.start(curTime, offset)
      }

      // 记录已调度
      this.queuedAudioNodes.add(node)

      // 节点结束时清理
      node.onended = () => {
        this.queuedAudioNodes.delete(node)
      }

      sample.close()
    }
  }

  /**
   * 停止所有已调度的音频节点
   */
  private stopAllAudioNodes(): void {
    for (const node of this.queuedAudioNodes) {
      try {
        node.stop()
      } catch (err) {
        // 节点可能已经停止，忽略错误
      }
    }
    this.queuedAudioNodes.clear()
  }

  /**
   * 更新项目时长
   * @param durationN 项目时长（帧数，bigint类型）
   */
  updateTimelineDuration(durationN: bigint): void {
    const durationSeconds = Number(durationN) / RENDERER_FPS
    this.playbackState.value.duration = durationSeconds
    this.playbackState.value.durationN = durationN
    console.log(`🎯 更新项目时长: ${durationSeconds.toFixed(2)}s ${durationN}帧`)
  }

  /**
   * 释放所有资源
   * @param clips 要清理的 IClip 实例数组
   */
  async dispose(clips: IClip[]): Promise<void> {
    console.log('🧹 清理 AVCanvas 资源')

    // 停止渲染循环
    this.stopRenderLoop()

    // 停止播放
    this.playbackState.value.isPlaying = false

    // 🆕 停止所有音频
    this.stopAllAudioNodes()

    // 清空 Canvas
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }

    // 关闭 AudioContext
    await this.audioContext.close()
    this.canvas = null
    this.ctx = null

    // 清理当前帧
    for (const frame of this.currentVideoFrames) {
      frame?.close()
    }
    this.currentVideoFrames = []

    // 🔥 清理所有 BunnyClip 实例
    for (const clip of clips) {
      if (clip) {
        await clip.dispose()
      }
    }

    this.clips = []

    console.log('✅ AVCanvas 资源清理完成')
  }

  /**
   * 导出视频
   * @param config 导出配置
   * @returns 导出的视频文件数据
   */
  async exportVideo(config: ExportConfig): Promise<Uint8Array> {
    if (!this.canvas || !this.ctx) {
      throw new Error('Canvas not initialized')
    }

    // 暂停播放
    const wasPlaying = this.playbackState.value.isPlaying
    if (wasPlaying) {
      this.pause()
    }

    try {
      const exportManager = new ExportManager(
        this.canvas,
        this.ctx,
        this.clips,
        this.playbackState.value.durationN,
        config,
      )

      // 保存当前导出管理器引用
      this.currentExportManager = exportManager

      return await exportManager.export()
    } finally {
      // 清除导出管理器引用
      this.currentExportManager = null

      // 恢复播放状态
      if (wasPlaying) {
        await this.play()
      }
    }
  }

  /**
   * 取消当前导出
   */
  cancelExport(): void {
    if (this.currentExportManager) {
      this.currentExportManager.cancel()
      console.log('🛑 导出已取消')
    } else {
      console.warn('⚠️ 没有正在进行的导出任务')
    }
  }
}
