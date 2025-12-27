import { markRaw } from 'vue'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { TextMediaConfig } from '@/core/timelineitem/type'
import { BunnyClip } from '@/core/mediabunny/bunny-clip'
import { textToImageBitmap, textToImageBitmap2 } from './ToBitmap'

/**
 * 为时间轴项目设置对应的 Bunny 对象（会自动清理旧的对象）
 *
 * 根据不同的媒体类型，为 timelineItem 创建相应的 bunny 对象并存储到 runtime 中
 *
 * @param timelineItem 时间轴项目
 * @param mediaItem 关联的媒体项目（音视频类型需要）
 * @returns Promise<void>
 */
export async function setupTimelineItemBunny(
  timelineItem: UnifiedTimelineItemData,
  mediaItem?: UnifiedMediaItemData,
): Promise<void> {
  console.log(`🔄 [timelineItemSetup] 开始为 timelineItem 创建 bunny 对象:`, {
    id: timelineItem.id,
    mediaType: timelineItem.mediaType,
  })

  try {
    // 检查并清理已存在的旧资源
    if (timelineItem.runtime.bunnyClip || timelineItem.runtime.textBitmap) {
      console.log(`🧹 [timelineItemSetup] 检测到已存在的 bunny 对象，先清理旧资源`)
      await cleanupTimelineItemBunny(timelineItem)
    }

    switch (timelineItem.mediaType) {
      case 'text': {
        // 文本类型：创建 textBitmap
        const textConfig = timelineItem.config as TextMediaConfig
        const bmap = await textToImageBitmap2(textConfig.text, textConfig.style)
        timelineItem.runtime.textBitmap = bmap
        console.log(`✅ [timelineItemSetup] 文本 bunny 对象创建完成`)
        break
      }

      case 'video':
      case 'audio': {
        // 音视频类型：创建 BunnyClip
        if (!mediaItem || !mediaItem.runtime.bunny?.bunnyMedia) {
          throw new Error(`音视频类型需要 mediaItem 且 mediaItem.runtime.bunny.bunnyMedia 存在`)
        }

        const bunnyclip = new BunnyClip(mediaItem.runtime.bunny.bunnyMedia)
        bunnyclip.setTimeRange({
          clipStart: BigInt(timelineItem.timeRange.clipStartTime),
          clipEnd: BigInt(timelineItem.timeRange.clipEndTime),
          timelineStart: BigInt(timelineItem.timeRange.timelineStartTime),
          timelineEnd: BigInt(timelineItem.timeRange.timelineEndTime),
        })
        timelineItem.runtime.bunnyClip = markRaw(bunnyclip)
        console.log(`✅ [timelineItemSetup] 音视频 bunny 对象创建完成`)
        break
      }

      case 'image': {
        // 图片类型：创建 BunnyClip（使用 imageClip）
        if (!mediaItem || !mediaItem.runtime.bunny?.imageClip) {
          throw new Error(`图片类型需要 mediaItem 且 mediaItem.runtime.bunny.imageClip 存在`)
        }
        break
      }

      default: {
        throw new Error(`不支持的媒体类型: ${timelineItem.mediaType}`)
      }
    }
  } catch (error) {
    console.error(`❌ [timelineItemSetup] 创建 bunny 对象失败:`, error)
    throw error
  }
}

/**
 * 清理时间轴项目的 Bunny 对象
 *
 * 释放 timelineItem runtime 中的 bunny 相关资源
 *
 * @param timelineItem 时间轴项目
 * @returns Promise<void>
 */
export async function cleanupTimelineItemBunny(
  timelineItem: UnifiedTimelineItemData,
): Promise<void> {
  // 清理 BunnyClip（音视频类型）
  await timelineItem.runtime.bunnyClip?.dispose()
  timelineItem.runtime.bunnyClip = undefined

  // 清理 textBitmap（文本类型）
  timelineItem.runtime.textBitmap?.close()
  timelineItem.runtime.textBitmap = undefined
}
