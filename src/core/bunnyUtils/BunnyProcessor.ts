import pLimit from 'p-limit'
import type { UnifiedMediaItemData, BunnyObjects } from '@/core/mediaitem/types'
import { generateThumbnailForUnifiedMediaItemBunny } from '@/core/bunnyUtils/thumbGenerator'
import { ThumbnailMode, THUMBNAIL_CONSTANTS } from '@/constants/ThumbnailConstants'
import { BUNNY_CONCURRENCY } from '@/constants/ConcurrencyConstants'
import { BunnyClip } from '@/core/mediabunny/bunny-clip'
import { fileToImageBitmap } from '@/core/bunnyUtils/ToBitmap'
import { markRaw } from 'vue'
import { RENDERER_FPS } from '@/core/mediabunny/constant'
/**
 * Bunny处理结果
 */
export interface BunnyProcessingResult {
  bunnyObjects: BunnyObjects
  durationN: bigint
}

/**
 * Bunny处理器
 * 负责处理Bunny相关的所有操作
 */
export class BunnyProcessor {
  private limit: ReturnType<typeof pLimit>

  constructor() {
    this.limit = pLimit(BUNNY_CONCURRENCY.MAX_CONCURRENT_CLIPS)
  }
  /**
   * 处理媒体项目
   * @param mediaItem 媒体项目
   * @param file 文件对象（必需）
   * @returns 处理结果
   */
  async processMedia(mediaItem: UnifiedMediaItemData, file: File): Promise<BunnyProcessingResult> {
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
  ): Promise<BunnyProcessingResult> {
    console.log(`🚀 [BunnyProcessor] 开始处理媒体: ${mediaItem.name} (${mediaItem.mediaType})`)

    if (!file) {
      throw new Error('数据源未准备好')
    }

    const targetFile = file

    let bunnyObjects: BunnyObjects
    let durationN: bigint
    switch (mediaItem.mediaType) {
      case 'video': {
        const clip = new BunnyClip(targetFile)
        await clip.ready
        bunnyObjects = {
          bunnyClip: markRaw(clip),
          originalWidth: clip.width,
          originalHeight: clip.height,
        }
        durationN = clip.durationN
        break
      }
      case 'audio': {
        const clip = new BunnyClip(targetFile)
        await clip.ready
        bunnyObjects = {
          bunnyClip: markRaw(clip),
        }
        durationN = clip.durationN
        break
      }
      case 'image': {
        const clip = await fileToImageBitmap(targetFile)
        bunnyObjects = {
          imageClip: clip,
          originalWidth: clip.width,
          originalHeight: clip.height,
        }
        durationN = 5n * BigInt(RENDERER_FPS)
        break
      }
      default:
        throw new Error(`不支持的媒体类型: ${mediaItem.mediaType}`)
    }
    // 预先设置给 generateThumbnailForUnifiedMediaItemBunny 使用
    mediaItem.runtime.bunny = bunnyObjects
    // 生成缩略图
    if (mediaItem.mediaType === 'video' || mediaItem.mediaType === 'image') {
      // 5. 计算缩略图尺寸（最长边使用常量，保持宽高比）
      const maxEdge = THUMBNAIL_CONSTANTS.MEDIA_ITEM_MAX_EDGE
      const aspectRatio = bunnyObjects.originalWidth! / bunnyObjects.originalHeight!
      let thumbnailWidth: number
      let thumbnailHeight: number

      if (bunnyObjects.originalWidth! > bunnyObjects.originalHeight!) {
        // 横向图片/视频
        thumbnailWidth = maxEdge
        thumbnailHeight = Math.round(maxEdge / aspectRatio)
      } else {
        // 纵向图片/视频
        thumbnailHeight = maxEdge
        thumbnailWidth = Math.round(maxEdge * aspectRatio)
      }

      // 6. 使用统一的缩略图生成函数
      const thumbnailUrl = await generateThumbnailForUnifiedMediaItemBunny(
        mediaItem,
        undefined, // 使用默认中间位置
        thumbnailWidth,
        thumbnailHeight,
        ThumbnailMode.FIT,
      )

      // 7. 将 thumbnailUrl 添加到 webavObjects
      bunnyObjects.thumbnailUrl = thumbnailUrl
    } else if (mediaItem.mediaType === 'audio') {
      const maxEdge = THUMBNAIL_CONSTANTS.MEDIA_ITEM_MAX_EDGE
      const thumbnailUrl = await generateThumbnailForUnifiedMediaItemBunny(
        mediaItem,
        undefined, // 使用默认中间位置
        maxEdge,
        maxEdge,
        ThumbnailMode.FIT,
      )
      bunnyObjects.thumbnailUrl = thumbnailUrl
    }

    const result: BunnyProcessingResult = {
      bunnyObjects,
      durationN: durationN,
    }

    console.log(`✅ [BunnyProcessor] 媒体处理完成: ${mediaItem.name}`)
    return result
  }

  /**
   * 设置最大并发数
   * @param max 最大并发数
   */
  setMaxConcurrentClips(max: number): void {
    this.limit = pLimit(Math.max(1, max))
  }
}
