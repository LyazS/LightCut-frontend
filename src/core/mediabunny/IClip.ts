import type { VideoSample, AudioSample } from 'mediabunny'
import type { TimeRange } from './types'

/**
 * Clip 接口 - 定义媒体片段的核心功能
 */
export interface IClip {
  /**
   * 就绪状态的 Promise
   */
  readonly ready: Promise<void>

  /**
   * 时间范围配置
   */
  timeRange: TimeRange

  /**
   * 预览倍速
   */
  previewRate: number

  /**
   * 媒体时长（秒）
   */
  duration: number

  /**
   * 设置时间范围
   * @param timeRange 时间范围配置（可选参数）
   */
  setTimeRange(timeRange: {
    clipStart?: bigint
    clipEnd?: bigint
    timelineStart?: bigint
    timelineEnd?: bigint
  }): void

  /**
   * 获取播放速率
   * @returns 播放速率
   */
  getPlaybackRate(): number

  /**
   * 设置预览倍速
   * @param rate 倍速值
   */
  setPreviewRate(rate: number): Promise<void>

  /**
   * Tick 拦截器 - 用于在每次 tick 时进行自定义处理
   */
  tickInterceptor: <T>(time: number | bigint, result: T) => Promise<T>

  /**
   * 在指定时间点获取音视频数据
   * @param timeN 时间点（帧数）
   * @returns 音视频数据和状态
   */
  tickN(
    timeN: bigint,
  ): Promise<{ audio: AudioSample[]; video: VideoSample | null; state: 'success' | 'outofrange' }>

  /**
   * 克隆当前 Clip 实例
   * @returns 新的 Clip 实例
   */
  clone(): Promise<IClip>

  /**
   * 释放所有资源
   */
  dispose(): Promise<void>
}
