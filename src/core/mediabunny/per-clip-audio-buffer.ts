import type { WrappedAudioBuffer } from 'mediabunny'

/**
 * 带音量信息的音频缓冲
 */
interface WrappedAudioBufferWithVolume {
  wrapped: WrappedAudioBuffer
  volume: number
}

/**
 * 单个 Clip 的音频缓冲管理器
 * 负责收集、管理和清理单个 clip 的音频缓冲
 */
export class PerClipAudioBuffer {
  private buffers: WrappedAudioBufferWithVolume[] = []
  private earliestTimestamp: number = Infinity
  private latestTimestamp: number = -Infinity
  private clipId: string

  constructor(clipId: string) {
    this.clipId = clipId
  }

  /**
   * 添加音频缓冲
   * @param wrapped 包装的音频缓冲
   * @param volume 音量值 (0-1)，默认为 1.0
   */
  addBuffer(wrapped: WrappedAudioBuffer, volume: number = 1.0): void {
    this.buffers.push({ wrapped, volume })

    // 更新时间戳范围
    const bufferStart = wrapped.timestamp
    const bufferEnd = wrapped.timestamp + wrapped.duration

    if (bufferStart < this.earliestTimestamp) {
      this.earliestTimestamp = bufferStart
    }
    if (bufferEnd > this.latestTimestamp) {
      this.latestTimestamp = bufferEnd
    }
  }

  /**
   * 获取缓冲的时长（秒）
   * @returns 缓冲时长
   */
  getBufferedDuration(): number {
    if (this.buffers.length === 0) {
      return 0
    }
    return this.latestTimestamp - this.earliestTimestamp
  }

  /**
   * 获取最早的时间戳
   * @returns 最早时间戳
   */
  getEarliestTimestamp(): number {
    return this.earliestTimestamp
  }

  /**
   * 获取最晚的时间戳（包含 duration）
   * @returns 最晚时间戳
   */
  getLatestTimestamp(): number {
    return this.latestTimestamp
  }

  /**
   * 清理指定时间点之前的缓冲
   * @param timestamp 时间戳
   */
  clearBuffersBeforeTimestamp(timestamp: number): void {
    // 过滤出需要保留的缓冲（结束时间 > timestamp）
    const remainingBuffers: WrappedAudioBufferWithVolume[] = []
    
    for (const bufferWithVolume of this.buffers) {
      const bufferEnd = bufferWithVolume.wrapped.timestamp + bufferWithVolume.wrapped.duration
      if (bufferEnd > timestamp) {
        remainingBuffers.push(bufferWithVolume)
      }
      // ✅ 不需要 close()，AudioBuffer 由浏览器自动管理
    }

    this.buffers = remainingBuffers

    // 重新计算时间戳范围
    if (this.buffers.length === 0) {
      this.earliestTimestamp = Infinity
      this.latestTimestamp = -Infinity
    } else {
      this.earliestTimestamp = Infinity
      this.latestTimestamp = -Infinity
      for (const bufferWithVolume of this.buffers) {
        const bufferStart = bufferWithVolume.wrapped.timestamp
        const bufferEnd = bufferWithVolume.wrapped.timestamp + bufferWithVolume.wrapped.duration
        if (bufferStart < this.earliestTimestamp) {
          this.earliestTimestamp = bufferStart
        }
        if (bufferEnd > this.latestTimestamp) {
          this.latestTimestamp = bufferEnd
        }
      }
    }
  }

  /**
   * 获取指定时间范围内的缓冲
   * @param startTime 起始时间
   * @param endTime 结束时间
   * @returns 带音量信息的缓冲数组
   */
  getBuffersInRange(startTime: number, endTime: number): WrappedAudioBufferWithVolume[] {
    return this.buffers.filter((bufferWithVolume) => {
      const bufferStart = bufferWithVolume.wrapped.timestamp
      const bufferEnd = bufferWithVolume.wrapped.timestamp + bufferWithVolume.wrapped.duration
      // 缓冲与时间范围有重叠
      return bufferEnd > startTime && bufferStart < endTime
    })
  }

  /**
   * 检查缓冲是否为空
   * @returns 是否为空
   */
  isEmpty(): boolean {
    return this.buffers.length === 0
  }

  /**
   * 获取 clip ID
   * @returns clip ID
   */
  getClipId(): string {
    return this.clipId
  }

  /**
   * 获取缓冲数量
   * @returns 缓冲数量
   */
  getBufferCount(): number {
    return this.buffers.length
  }

  /**
   * 清空所有缓冲
   */
  clear(): void {
    // ✅ 不需要 close()，AudioBuffer 由浏览器自动管理
    this.buffers = []
    this.earliestTimestamp = Infinity
    this.latestTimestamp = -Infinity
  }
}