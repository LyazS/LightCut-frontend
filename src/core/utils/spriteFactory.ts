/**
 * 统一架构的 Sprite 工厂类
 *
 * 职责：
 * 1. 基于统一媒体项目数据创建对应的 Sprite 实例
 * 2. 提供统一的错误处理和状态验证
 * 3. 支持视频、图片、音频三种媒体类型
 * 4. 遵循新架构的"数据与行为分离"设计模式
 *
 * 设计理念：
 * - 使用 UnifiedMediaItemData 作为输入参数
 * - 集成现有的 Sprite 类实现
 * - 提供完整的 TypeScript 类型支持
 * - 包含详细的错误信息和状态检查
 */

import { markRaw, type Raw } from 'vue'
import type { UnifiedMediaItemData, MediaType } from '@/core/mediaitem/types'
import type { UnifiedSprite } from '@/core/visiblesprite'
import type {
  UnifiedTimelineItemData,
  VideoMediaConfig,
  ImageMediaConfig,
  TextMediaConfig,
  BaseMediaProps,
} from '@/core/timelineitem/TimelineItemData'
import { hasVisualProperties } from '@/core/timelineitem/TimelineItemQueries'

// 导入统一架构的 Sprite 类
import { VideoVisibleSprite } from '@/core/visiblesprite/VideoVisibleSprite'
import { ImageVisibleSprite } from '@/core/visiblesprite/ImageVisibleSprite'
import { AudioVisibleSprite } from '@/core/visiblesprite/AudioVisibleSprite'

// 导入 WebAV Clip 工具函数
import { cloneMP4Clip, cloneImgClip, cloneAudioClip } from '@/core/utils/webavClipUtils'

/**
 * 从统一媒体项目数据创建对应的 Sprite 实例
 *
 * 这是现有 spriteFactory.createSpriteFromMediaItem 的统一架构版本，
 * 使用新的 UnifiedMediaItemData 类型作为输入参数。
 *
 * @param mediaData 统一媒体项目数据
 * @returns 创建的 Sprite 实例
 * @throws 当媒体项目未准备好或类型不支持时抛出错误
 *
 * @example
 * ```typescript
 * // 基本使用
 * const sprite = await createSpriteFromUnifiedMediaItem(mediaData)
 *
 * // 错误处理
 * try {
 *   const sprite = await createSpriteFromUnifiedMediaItem(mediaData)
 *   // 使用 sprite...
 * } catch (error) {
 *   console.error('创建 Sprite 失败:', error.message)
 * }
 * ```
 */
export async function createSpriteFromUnifiedMediaItem(
  mediaData: UnifiedMediaItemData,
): Promise<Raw<UnifiedSprite>> {
  // 1. 验证媒体项目状态
  if (mediaData.mediaStatus !== 'ready') {
    throw new Error(
      `媒体项目尚未就绪，当前状态: ${mediaData.mediaStatus}，素材名称: ${mediaData.name}`,
    )
  }

  // 2. 验证媒体类型
  if (mediaData.mediaType === 'unknown') {
    throw new Error(`媒体类型未确定，无法创建 Sprite: ${mediaData.name}`)
  }

  // 3. 验证 WebAV 对象存在
  if (!mediaData.runtime.webav) {
    throw new Error(`媒体项目 WebAV 对象未就绪，无法创建 Sprite: ${mediaData.name}`)
  }

  // 4. 根据媒体类型创建对应的 Sprite
  try {
    switch (mediaData.mediaType) {
      case 'video': {
        if (!mediaData.runtime.webav.mp4Clip) {
          throw new Error(`视频 WebAV 对象缺失，无法创建 Sprite: ${mediaData.name}`)
        }

        // 克隆 MP4Clip 以避免多个 Sprite 共享同一个 Clip
        const clonedMP4Clip = await cloneMP4Clip(mediaData.runtime.webav.mp4Clip)
        return markRaw(new VideoVisibleSprite(clonedMP4Clip))
      }

      case 'image': {
        if (!mediaData.runtime.webav.imgClip) {
          throw new Error(`图片 WebAV 对象缺失，无法创建 Sprite: ${mediaData.name}`)
        }

        // 克隆 ImgClip 以避免多个 Sprite 共享同一个 Clip
        const clonedImgClip = await cloneImgClip(mediaData.runtime.webav.imgClip)
        return markRaw(new ImageVisibleSprite(clonedImgClip))
      }

      case 'audio': {
        if (!mediaData.runtime.webav.audioClip) {
          throw new Error(`音频 WebAV 对象缺失，无法创建 Sprite: ${mediaData.name}`)
        }

        // 克隆 AudioClip 以避免多个 Sprite 共享同一个 Clip
        const clonedAudioClip = await cloneAudioClip(mediaData.runtime.webav.audioClip)
        return markRaw(new AudioVisibleSprite(clonedAudioClip))
      }

      case 'text': {
        // 文本类型暂不支持，因为它不需要基于媒体项目创建
        throw new Error(`文本类型不支持通过媒体项目创建 Sprite，请使用专门的文本 Sprite 创建方法`)
      }

      default: {
        // TypeScript 应该确保这里不会到达，但为了运行时安全还是加上
        throw new Error(`不支持的媒体类型: ${(mediaData as any).mediaType}`)
      }
    }
  } catch (error) {
    // 6. 统一错误处理
    if (error instanceof Error) {
      // 重新抛出已知错误，保持错误信息
      throw error
    } else {
      // 处理未知错误类型
      throw new Error(`创建 Sprite 时发生未知错误: ${String(error)}，素材名称: ${mediaData.name}`)
    }
  }
}

/**
 * 检查统一媒体项目数据是否可以创建 Sprite
 *
 * 这是一个辅助函数，用于在创建 Sprite 之前进行预检查，
 * 避免不必要的异步操作和错误处理。
 *
 * @param mediaData 统一媒体项目数据
 * @returns 检查结果对象
 *
 * @example
 * ```typescript
 * const checkResult = canCreateSpriteFromUnifiedMediaItem(mediaData)
 * if (checkResult.canCreate) {
 *   const sprite = await createSpriteFromUnifiedMediaItem(mediaData)
 * } else {
 *   console.warn('无法创建 Sprite:', checkResult.reason)
 * }
 * ```
 */
export function canCreateSpriteFromUnifiedMediaItem(mediaData: UnifiedMediaItemData): {
  canCreate: boolean
  reason?: string
} {
  // 检查媒体状态
  if (mediaData.mediaStatus !== 'ready') {
    return {
      canCreate: false,
      reason: `媒体项目尚未就绪，当前状态: ${mediaData.mediaStatus}`,
    }
  }

  // 检查媒体类型
  if (mediaData.mediaType === 'unknown') {
    return {
      canCreate: false,
      reason: '媒体类型未确定',
    }
  }

  // 检查是否为文本类型
  if (mediaData.mediaType === 'text') {
    return {
      canCreate: false,
      reason: '文本类型不支持通过媒体项目创建 Sprite',
    }
  }

  // 检查 WebAV 对象
  if (!mediaData.runtime.webav) {
    return {
      canCreate: false,
      reason: 'WebAV 对象未就绪',
    }
  }

  // 检查具体的 WebAV Clip 对象
  switch (mediaData.mediaType) {
    case 'video':
      if (!mediaData.runtime.webav.mp4Clip) {
        return {
          canCreate: false,
          reason: '视频 WebAV 对象缺失',
        }
      }
      break

    case 'image':
      if (!mediaData.runtime.webav.imgClip) {
        return {
          canCreate: false,
          reason: '图片 WebAV 对象缺失',
        }
      }
      break

    case 'audio':
      if (!mediaData.runtime.webav.audioClip) {
        return {
          canCreate: false,
          reason: '音频 WebAV 对象缺失',
        }
      }
      break
  }

  return { canCreate: true }
}

/**
 * 从统一时间轴项目数据创建对应的 Sprite 实例
 *
 * 这个函数用于从时间轴项目数据重建 sprite 实例，包括：
 * 1. 从关联的媒体项目创建 sprite
 * 2. 设置时间范围
 * 3. 应用变换属性（使用坐标转换）
 * 4. 设置 zIndex
 *
 * @param timelineItemData 统一时间轴项目数据
 * @returns 创建的 Sprite 实例
 * @throws 当媒体项目未准备好或类型不支持时抛出错误
 *
 * @example
 * ```typescript
 * // 基本使用
 * const sprite = await createSpriteFromUnifiedTimelineItem(timelineItemData)
 *
 * // 错误处理
 * try {
 *   const sprite = await createSpriteFromUnifiedTimelineItem(timelineItemData)
 *   // 使用 sprite...
 * } catch (error) {
 *   console.error('创建 Sprite 失败:', error.message)
 * }
 * ```
 */
export async function createSpriteFromUnifiedTimelineItem(
  timelineItemData: UnifiedTimelineItemData<MediaType>,
): Promise<UnifiedSprite> {
  // 1. 获取关联的媒体项目和画布大小
  const { useUnifiedStore } = await import('@/core/unifiedStore')
  const unifiedStore = useUnifiedStore()
  const mediaItem = unifiedStore.getMediaItem(timelineItemData.mediaItemId)

  if (!mediaItem) {
    throw new Error(`找不到关联的媒体项目: ${timelineItemData.mediaItemId}`)
  }

  // 获取画布分辨率
  const canvasWidth = unifiedStore.videoResolution.width
  const canvasHeight = unifiedStore.videoResolution.height

  // 2. 从原始素材重新创建 sprite
  const newSprite = await createSpriteFromUnifiedMediaItem(mediaItem)

  // 3. 设置时间范围
  newSprite.setTimeRange(timelineItemData.timeRange)

  // 4. 应用变换属性（使用坐标转换）
  if (hasVisualProperties(timelineItemData)) {
    const config = timelineItemData.config as VideoMediaConfig | ImageMediaConfig | TextMediaConfig

    // 导入坐标转换工具
    const { projectToWebavCoords } = await import('@/core/utils/coordinateUtils')

    // 使用坐标转换将项目坐标系转换为 WebAV 坐标系
    if (
      config.x !== undefined &&
      config.y !== undefined &&
      config.width !== undefined &&
      config.height !== undefined
    ) {
      const webavCoords = projectToWebavCoords(
        config.x,
        config.y,
        config.width,
        config.height,
        canvasWidth,
        canvasHeight,
      )
      newSprite.rect.x = webavCoords.x
      newSprite.rect.y = webavCoords.y
    }

    // 设置尺寸和其他属性
    if (config.width !== undefined) newSprite.rect.w = config.width
    if (config.height !== undefined) newSprite.rect.h = config.height
    if (config.rotation !== undefined) newSprite.rect.angle = config.rotation
    if (config.opacity !== undefined) newSprite.opacity = config.opacity
  }

  // 5. 设置 zIndex
  const config = timelineItemData.config as BaseMediaProps
  newSprite.zIndex = config.zIndex

  return newSprite
}
