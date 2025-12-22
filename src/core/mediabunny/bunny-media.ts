import {
  Input,
  BlobSource,
  VideoSampleSink,
  AudioSampleSink,
  ALL_FORMATS,
  InputVideoTrack,
  InputAudioTrack,
  type MetadataTags,
  VideoSample,
  AudioSample,
  type AnyIterable,
} from 'mediabunny'
import { RENDERER_FPS } from './constant'
/**
 * 媒体播放器核心类 - 统一管理视频和音频播放状态
 */
export class BunnyMedia {
  private input: Input | null = null
  private videoTrack: InputVideoTrack | null = null
  private audioTrack: InputAudioTrack | null = null
  private videoSink: VideoSampleSink | null = null
  private audioSink: AudioSampleSink | null = null
  // 视频相关属性

  // 公开属性
  public readonly ready: Promise<void>
  public duration: number = 0
  public durationN: bigint = 0n
  public width: number = 0
  public height: number = 0

  constructor(file: File) {
    this.ready = this.loadFile(file)
  }

  /**
   * 加载媒体文件
   * @param file 要加载的文件
   */
  private async loadFile(file: File): Promise<void> {
    console.log('📁 开始加载文件:', file.name)
    try {
      // 创建 Input 实例
      this.input = new Input({
        source: new BlobSource(file),
        formats: ALL_FORMATS,
      })

      // 获取视频和音频轨道
      this.videoTrack = await this.input.getPrimaryVideoTrack()
      this.audioTrack = await this.input.getPrimaryAudioTrack()

      console.log(
        `📊 找到视频轨道: ${this.videoTrack ? '是' : '否'}, 音频轨道: ${this.audioTrack ? '是' : '否'}`,
      )

      // 初始化视频轨道
      let videoDuration: number | null = null
      if (this.videoTrack) {
        console.log(`🎬 视频轨道信息:`, {
          codec: this.videoTrack.codec,
          width: this.videoTrack.displayWidth,
          height: this.videoTrack.displayHeight,
          rotation: this.videoTrack.rotation,
        })

        this.width = this.videoTrack.displayWidth
        this.height = this.videoTrack.displayHeight
        videoDuration = await this.videoTrack.computeDuration()
        this.videoSink = new VideoSampleSink(this.videoTrack)
      }

      // 初始化音频轨道
      if (this.audioTrack) {
        console.log(`🎵 音频轨道信息:`, {
          codec: this.audioTrack.codec,
          channels: this.audioTrack.numberOfChannels,
          sampleRate: this.audioTrack.sampleRate,
        })
        this.audioSink = new AudioSampleSink(this.audioTrack)
      }
      if (!this.videoSink && !this.audioSink) {
        throw new Error('该文件没有视频和音频轨道')
      }

      this.duration = videoDuration || (await this.input.computeDuration())
      this.durationN = BigInt(Math.ceil(this.duration * RENDERER_FPS))

      console.log(`✅ 文件加载完成，总时长: ${this.duration.toFixed(2)}s`)
    } catch (error) {
      console.error('❌ 文件加载失败:', error)
      throw error
    }
  }

  // ==================== 公共接口 ====================
  async getMetadataTags(): Promise<MetadataTags | null> {
    // 获取元数据
    await this.ready
    return (await this.input?.getMetadataTags()) ?? null
  }

  videoSamplesAtTimestamps():
    | ((timestamps: AnyIterable<number>) => AsyncGenerator<VideoSample | null, void, unknown>)
    | null {
    return this.videoSink?.samplesAtTimestamps ?? null
  }

  videoGetSample(): ((timestamps: number) => Promise<VideoSample | null>) | null {
    return this.videoSink?.getSample ?? null
  }

  videoSamplesFunc():
    | ((
        startTimestamp?: number | undefined,
        endTimestamp?: number | undefined,
      ) => AsyncGenerator<VideoSample | null, void, unknown>)
    | null {
    return this.videoSink?.samples ?? null
  }

  audioSamplesFunc():
    | ((
        startTimestamp?: number | undefined,
        endTimestamp?: number | undefined,
      ) => AsyncGenerator<AudioSample, void, unknown>)
    | null {
    return this.audioSink?.samples ?? null
  }

  /**
   * 释放所有资源
   */
  async dispose(): Promise<void> {
    console.log('🧹 清理 BunnyClip 资源')

    // 清理 Input
    this.input?.dispose()
    this.input = null

    console.log('✅ BunnyClip 资源清理完成')
  }
}
