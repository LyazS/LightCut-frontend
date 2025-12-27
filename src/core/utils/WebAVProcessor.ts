/**
 * WebAV处理器
 * 专门负责WebAV相关的处理逻辑
 */

import pLimit from 'p-limit'
import type { UnifiedMediaItemData, MediaType, WebAVObjects } from '@/core/mediaitem/types'
import { microsecondsToFrames, secondsToFrames } from '@/core/utils/timeUtils'
import { WEBAV_CONCURRENCY } from '@/constants/ConcurrencyConstants'
import { createMP4Clip, createImgClip, createAudioClip } from '@/core/utils/webavClipUtils'

/**
 * WebAV处理结果
 */
export interface WebAVProcessingResult {
  webavObjects: WebAVObjects
  duration: number
}

/**
 * WebAV处理器
 * 负责处理WebAV相关的所有操作
 */
export class WebAVProcessor {
  private limit: ReturnType<typeof pLimit>

  constructor() {
    this.limit = pLimit(WEBAV_CONCURRENCY.MAX_CONCURRENT_CLIPS)
  }
  /**
   * 处理媒体项目
   * @param mediaItem 媒体项目
   * @param file 文件对象（必需）
   * @returns 处理结果
   */
  async processMedia(mediaItem: UnifiedMediaItemData, file: File): Promise<WebAVProcessingResult> {
    // 使用 p-limit 控制并发
    return this.limit(() => this.processMediaInternal(mediaItem, file))
  }

  /**
   * 内部处理媒体项目方法
   * @param mediaItem 媒体项目
   * @param file 文件对象（必需）
   * @returns 处理结果
   */
  private async processMediaInternal(
    mediaItem: UnifiedMediaItemData,
    file: File,
  ): Promise<WebAVProcessingResult> {
    console.log(`🚀 [WebAVProcessor] 开始处理媒体: ${mediaItem.name} (${mediaItem.mediaType})`)

    if (!file) {
      throw new Error('数据源未准备好')
    }

    const targetFile = file

    // 1. 根据媒体类型创建对应的WebAV Clip
    let clip: any
    switch (mediaItem.mediaType) {
      case 'video':
        clip = await createMP4Clip(targetFile)
        break
      case 'image':
        clip = await createImgClip(targetFile)
        break
      case 'audio':
        clip = await createAudioClip(targetFile)
        break
      default:
        throw new Error(`不支持的媒体类型: ${mediaItem.mediaType}`)
    }

    // 2. 等待clip准备完成
    const meta = await clip.ready

    // 3. 创建WebAV对象并设置clip
    const webavObjects: WebAVObjects = {
      // originalWidth: meta.width,
      // originalHeight: meta.height,
    }

    // 根据媒体类型设置对应的clip
    if (mediaItem.mediaType === 'video') {
      webavObjects.mp4Clip = clip
    } else if (mediaItem.mediaType === 'image') {
      webavObjects.imgClip = clip
    } else if (mediaItem.mediaType === 'audio') {
      webavObjects.audioClip = clip
    }

    // 4. 更新 mediaItem.runtime.webav，以便生成缩略图
    if (!mediaItem.runtime) {
      mediaItem.runtime = {}
    }
    mediaItem.runtime.webav = webavObjects

    // 8. 计算时长（帧数）
    let durationFrames: number
    if (mediaItem.mediaType === 'audio' || mediaItem.mediaType === 'video') {
      durationFrames = microsecondsToFrames(meta.duration)
    } else if (mediaItem.mediaType === 'image') {
      durationFrames = secondsToFrames(5) // 图片固定5秒
    } else {
      throw new Error(`无法计算时长: ${mediaItem.mediaType}`)
    }

    const result: WebAVProcessingResult = {
      webavObjects,
      duration: durationFrames,
    }

    console.log(`✅ [WebAVProcessor] 媒体处理完成: ${mediaItem.name}`)
    return result
  }

  /**
   * 设置最大并发数
   * @param max 最大并发数
   */
  setMaxConcurrentClips(max: number): void {
    this.limit = pLimit(Math.max(1, max))
  }

  /**
   * 创建指定类型的Clip
   * @param file 文件对象
   * @param mediaType 媒体类型
   * @returns Clip对象
   */
  async createClip(file: File, mediaType: MediaType): Promise<any> {
    switch (mediaType) {
      case 'video':
        return createMP4Clip(file)
      case 'image':
        return createImgClip(file)
      case 'audio':
        return createAudioClip(file)
      default:
        throw new Error(`不支持的媒体类型: ${mediaType}`)
    }
  }
}
