import type { AudioSample } from 'mediabunny'

/**
 * 单个 Clip 的音频缓冲管理器
 * 负责收集、管理和清理单个 clip 的音频样本
 */
export class PerClipAudioBuffer {
  private samples: AudioSample[] = []
  private earliestTimestamp: number = Infinity
  private latestTimestamp: number = -Infinity
  private clipId: string // 从 clipIndex: number 改为 clipId: string

  constructor(clipId: string) { // 从 clipIndex: number 改为 clipId: string
    this.clipId = clipId
  }

  /**
   * 添加音频样本
   * @param sample 音频样本
   */
  addSample(sample: AudioSample): void {
    this.samples.push(sample)

    // 更新时间戳范围
    const sampleStart = sample.timestamp
    const sampleEnd = sample.timestamp + sample.duration

    if (sampleStart < this.earliestTimestamp) {
      this.earliestTimestamp = sampleStart
    }
    if (sampleEnd > this.latestTimestamp) {
      this.latestTimestamp = sampleEnd
    }
  }

  /**
   * 获取缓冲的时长（秒）
   * @returns 缓冲时长
   */
  getBufferedDuration(): number {
    if (this.samples.length === 0) {
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
   * 清理指定时间点之前的样本
   * @param timestamp 时间戳
   */
  clearSamplesBeforeTimestamp(timestamp: number): void {
    // 过滤出需要保留的样本（结束时间 > timestamp）
    const remainingSamples: AudioSample[] = []
    
    for (const sample of this.samples) {
      const sampleEnd = sample.timestamp + sample.duration
      if (sampleEnd > timestamp) {
        remainingSamples.push(sample)
      } else {
        // 释放不再需要的样本
        sample.close()
      }
    }

    this.samples = remainingSamples

    // 重新计算时间戳范围
    if (this.samples.length === 0) {
      this.earliestTimestamp = Infinity
      this.latestTimestamp = -Infinity
    } else {
      this.earliestTimestamp = Infinity
      this.latestTimestamp = -Infinity
      for (const sample of this.samples) {
        const sampleStart = sample.timestamp
        const sampleEnd = sample.timestamp + sample.duration
        if (sampleStart < this.earliestTimestamp) {
          this.earliestTimestamp = sampleStart
        }
        if (sampleEnd > this.latestTimestamp) {
          this.latestTimestamp = sampleEnd
        }
      }
    }
  }

  /**
   * 获取指定时间范围内的样本
   * @param startTime 起始时间
   * @param endTime 结束时间
   * @returns 样本数组
   */
  getSamplesInRange(startTime: number, endTime: number): AudioSample[] {
    return this.samples.filter((sample) => {
      const sampleStart = sample.timestamp
      const sampleEnd = sample.timestamp + sample.duration
      // 样本与时间范围有重叠
      return sampleEnd > startTime && sampleStart < endTime
    })
  }

  /**
   * 检查缓冲是否为空
   * @returns 是否为空
   */
  isEmpty(): boolean {
    return this.samples.length === 0
  }

  /**
   * 获取 clip ID
   * @returns clip ID
   */
  getClipId(): string {
    return this.clipId
  }

  /**
   * 获取样本数量
   * @returns 样本数量
   */
  getSampleCount(): number {
    return this.samples.length
  }

  /**
   * 清空所有样本并释放资源
   */
  clear(): void {
    for (const sample of this.samples) {
      sample.close()
    }
    this.samples = []
    this.earliestTimestamp = Infinity
    this.latestTimestamp = -Infinity
  }
}