/**
 * 项目导出工具
 * 提供视频项目导出为 MP4 文件的功能
 * 以及单个素材导出功能
 */

import { Combinator } from '@webav/av-cliper'
import type { MP4Clip } from '@webav/av-cliper'
import {
  VideoOffscreenSprite,
  ImageOffscreenSprite,
  AudioOffscreenSprite,
  // TextOffscreenSprite,
} from '@/core/offscreensprite'
import type { UnifiedOffscreenSprite } from '@/core/offscreensprite'
import type { UnifiedSprite } from '@/core/visiblesprite'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { MediaType } from '@/core/mediaitem'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import {
  isVideoTimelineItem,
  isImageTimelineItem,
  isAudioTimelineItem,
  isTextTimelineItem,
  hasVisualProperties,
  hasAudioProperties,
} from '@/core/timelineitem/queries'
import { projectToWebavCoords } from '@/core/utils/coordinateUtils'
import { convertToWebAVAnimation, isValidAnimationConfig } from '@/core/utils/animationConverter'
import { hasAnimation } from '@/core/utils/unifiedKeyframeUtils'
import { generateThumbnailForUnifiedMediaItem } from '@/core/utils/thumbnailGenerator'
import { ThumbnailMode } from '@/constants/ThumbnailConstants'
import { useUnifiedStore } from '@/core/unifiedStore'

/**
 * 导出项目参数接口
 */
export interface ExportProjectOptions {
  /** 视频分辨率宽度 */
  videoWidth: number
  /** 视频分辨率高度 */
  videoHeight: number
  /** 项目名称 */
  projectName: string
  /** 时间轴项目列表 */
  timelineItems: UnifiedTimelineItemData<MediaType>[]
  /** 轨道列表 */
  tracks: { id: string; isVisible: boolean; isMuted: boolean }[]
  /** 进度更新回调函数（可选） */
  onProgress?: (stage: string, progress: number, details?: string) => void
}

/**
 * 导出单个媒体项目参数
 */
export interface ExportMediaItemOptions {
  /** 媒体项目数据 */
  mediaItem: UnifiedMediaItemData
  /** 进度更新回调（可选） */
  onProgress?: (progress: number) => void
}

/**
 * 导出单个时间轴项目参数
 */
export interface ExportTimelineItemOptions {
  /** 时间轴项目数据 */
  timelineItem: UnifiedTimelineItemData
  /** 进度更新回调（可选） */
  onProgress?: (progress: number) => void
}

/**
 * 导出项目为 MP4 文件
 * @param options 导出项目参数
 */
export async function exportProject(options: ExportProjectOptions): Promise<void> {
  const { videoWidth, videoHeight, projectName, timelineItems, tracks, onProgress } = options

  // 初始化进度
  if (onProgress) {
    onProgress('', 0) // 直接开始导出进度，不显示准备阶段
  }
  console.log('开始导出项目...')

  try {
    // 1. 创建 Combinator 实例
    const combinator = new Combinator({
      width: videoWidth,
      height: videoHeight,
      bgColor: 'black',
    })

    console.log('Combinator 实例已创建')
    // 不显示准备阶段的进度，直接从0开始

    console.log('获取到时间轴项目:', timelineItems.length)

    // 3. 将时间轴项目转换为 OffscreenSprite 并添加到 Combinator
    for (let i = 0; i < timelineItems.length; i++) {
      const item = timelineItems[i]
      // 检查轨道可见性
      if (item.trackId) {
        const track = tracks.find((t) => t.id === item.trackId)
        if (track && !track.isVisible) {
          console.log(`跳过不可见轨道上的时间轴项目: ${item.id} (轨道: ${item.trackId})`)
          continue
        }
      }

      if (item.runtime.sprite) {
        const visibleSprite = item.runtime.sprite as UnifiedSprite

        // 获取 Clip 并克隆一份新的
        const clip = visibleSprite.getClip()
        if (!clip) {
          console.warn('无法获取 Clip，跳过项目:', item.id)
          continue
        }

        // 克隆 Clip
        const clonedClip = await clip.clone()

        // 根据媒体类型创建相应的 OffscreenSprite
        let offscreenSprite: UnifiedOffscreenSprite

        if (isVideoTimelineItem(item)) {
          offscreenSprite = new VideoOffscreenSprite(clonedClip as any)
        } else if (isImageTimelineItem(item)) {
          offscreenSprite = new ImageOffscreenSprite(clonedClip as any)
        } else if (isAudioTimelineItem(item)) {
          offscreenSprite = new AudioOffscreenSprite(clonedClip as any)
        } else if (isTextTimelineItem(item)) {
          // 文本类型需要特殊处理，因为 TextOffscreenSprite 使用静态工厂方法创建
          // 这里我们使用 ImageOffscreenSprite 作为基础，然后设置文本属性
          offscreenSprite = new ImageOffscreenSprite(clonedClip as any)
        } else {
          console.warn('未知的媒体类型，跳过项目:', item.mediaType, item.id)
          continue
        }

        // 设置时间范围
        if (hasAudioProperties(item)) {
          // 视频和音频类型有完整的时间范围信息
          const videoOrAudioSprite = offscreenSprite as VideoOffscreenSprite | AudioOffscreenSprite
          videoOrAudioSprite.setTimeRange({
            clipStartTime: item.timeRange.clipStartTime,
            clipEndTime: item.timeRange.clipEndTime,
            timelineStartTime: item.timeRange.timelineStartTime,
            timelineEndTime: item.timeRange.timelineEndTime,
          })
        } else {
          // 图片和文本类型只有时间轴时间范围
          const imageOrTextSprite = offscreenSprite as ImageOffscreenSprite
          imageOrTextSprite.setTimeRange({
            timelineStartTime: item.timeRange.timelineStartTime,
            timelineEndTime: item.timeRange.timelineEndTime,
          })
        }

        // 复制 VisibleSprite 的状态到 OffscreenSprite
        if (visibleSprite.opacity !== undefined) {
          offscreenSprite.opacity = visibleSprite.opacity
        }

        // 复制 zIndex 属性
        if (visibleSprite.zIndex !== undefined) {
          offscreenSprite.zIndex = visibleSprite.zIndex
        }

        // 复制位置和大小信息（根据媒体类型处理不同的配置）
        if (item.config) {
          // 检查是否是视觉媒体类型（有x, y, width, height, rotation属性）
          if (hasVisualProperties(item)) {
            // 使用坐标转换系统将项目坐标系转换为WebAV坐标系
            const spriteWidth = item.config.width || 100
            const spriteHeight = item.config.height || 100
            const projectX = item.config.x || 0
            const projectY = item.config.y || 0

            const webavCoords = projectToWebavCoords(
              projectX,
              projectY,
              spriteWidth,
              spriteHeight,
              videoWidth,
              videoHeight,
            )

            offscreenSprite.rect.x = webavCoords.x
            offscreenSprite.rect.y = webavCoords.y
            offscreenSprite.rect.w = spriteWidth
            offscreenSprite.rect.h = spriteHeight
            offscreenSprite.rect.angle = item.config.rotation || 0
          }
        }

        // 设置音频相关属性（仅对视频和音频类型）
        if (hasAudioProperties(item)) {
          const audioCapableSprite = offscreenSprite as VideoOffscreenSprite | AudioOffscreenSprite
          audioCapableSprite.setVolume(item.config.volume || 1)
          audioCapableSprite.setMuted(item.config.isMuted || false)

          // 设置轨道静音状态
          if (item.trackId) {
            const track = tracks.find((t) => t.id === item.trackId)
            if (track) {
              audioCapableSprite.setTrackMuted(track.isMuted)
              console.log(
                `设置轨道静音状态: ${item.id} (轨道: ${item.trackId}, 静音: ${track.isMuted})`,
              )
            }
          }

          // 如果是音频类型，设置增益
          if (isAudioTimelineItem(item)) {
            ;(audioCapableSprite as AudioOffscreenSprite).setGain(item.config.gain || 0)
          }
        }

        // 设置动画（如果存在）
        if (hasAnimation(item) && item.animation && isValidAnimationConfig(item.animation)) {
          try {
            console.log('🎬 [Export] 应用动画到 OffscreenSprite:', {
              itemId: item.id,
              keyframeCount: item.animation.keyframes.length,
            })

            // 转换为WebAV格式
            const webavConfig = convertToWebAVAnimation(
              item.animation,
              item.timeRange,
              videoWidth,
              videoHeight,
            )

            // 检查是否有关键帧
            if (Object.keys(webavConfig.keyframes).length > 0) {
              // 应用动画到OffscreenSprite
              offscreenSprite.setAnimation(webavConfig.keyframes, webavConfig.options)

              console.log('🎬 [Export] 动画设置成功:', {
                itemId: item.id,
                keyframes: webavConfig.keyframes,
                duration: webavConfig.options.duration,
              })
            } else {
              console.warn('🎬 [Export] 没有有效的关键帧，跳过动画设置:', item.id)
            }
          } catch (error) {
            console.error('🎬 [Export] 设置动画失败:', error, {
              itemId: item.id,
              animation: item.animation,
            })
          }
        }

        // 将 OffscreenSprite 添加到 Combinator
        await combinator.addSprite(offscreenSprite)
        console.log(`已添加 ${item.mediaType} OffscreenSprite 到 Combinator`)
        // 不显示准备阶段的进度更新
      }
    }

    // 4. 监听导出进度事件 - 这是真正的视频合成阶段，从0-100%显示
    combinator.on('OutputProgress', (progress: number) => {
      const percent = progress * 100
      console.log(`导出进度: ${percent.toFixed(2)}%`)
      if (onProgress) {
        onProgress('', percent) // 直接从0-100%显示实际导出进度
      }
    })

    // 5. 开始合成输出（真正的导出过程）
    const output = combinator.output()

    // 6. 将流转换为 Blob
    const chunks: Uint8Array[] = []
    const reader = output.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' })
    console.log('视频合成完成，Blob 大小:', blob.size)

    // 7. 创建下载链接并弹窗
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName || '导出项目'}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // 完成
    if (onProgress) {
      onProgress('', 100) // 最终完成状态
    }
    console.log('导出完成')
  } catch (error) {
    console.error('导出项目失败:', error)
    if (onProgress) {
      onProgress('', -1, error instanceof Error ? error.message : '未知错误')
    }
    throw error // 重新抛出错误，让调用者处理
  }
}

/**
 * 通用合成函数 - 将 sprites 合成为 Blob
 */
async function combineToBlob(options: {
  videoWidth: number
  videoHeight: number
  sprites: UnifiedOffscreenSprite[]
  onProgress?: (progress: number) => void
}): Promise<Blob> {
  const { videoWidth, videoHeight, sprites, onProgress } = options

  // 1. 创建 Combinator
  const combinator = new Combinator({
    width: videoWidth,
    height: videoHeight,
    bgColor: 'black',
  })

  // 2. 添加所有 sprites
  for (const sprite of sprites) {
    await combinator.addSprite(sprite)
  }

  // 3. 监听进度
  if (onProgress) {
    combinator.on('OutputProgress', (progress: number) => {
      onProgress(progress * 100)
    })
  }

  // 4. 开始合成
  const output = combinator.output()

  // 5. 将流转换为 Blob
  const chunks: Uint8Array[] = []
  const reader = output.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  return new Blob(chunks as BlobPart[], { type: 'video/mp4' })
}

/**
 * 导出单个媒体项目为 Blob（使用原始尺寸）
 */
export async function exportMediaItem(options: ExportMediaItemOptions): Promise<Blob> {
  const { mediaItem, onProgress } = options

  // 1. 验证媒体项目状态
  if (mediaItem.mediaStatus !== 'ready') {
    throw new Error('媒体项目未就绪，无法导出')
  }

  // 2. 获取原始尺寸
  const webav = mediaItem.runtime.webav
  if (!webav) {
    throw new Error('媒体项目缺少 WebAV 对象')
  }
  const bunny = mediaItem.runtime.bunny
  if (!bunny) {
    throw new Error('媒体项目缺少 WebAV 对象')
  }

  const originalWidth = bunny.originalWidth
  const originalHeight = bunny.originalHeight

  if (!originalWidth || !originalHeight) {
    throw new Error('无法获取媒体项目的原始尺寸')
  }

  // 3. 图片类型特殊处理：直接使用 generateThumbnailForUnifiedMediaItem 获取完整大图
  if (mediaItem.mediaType === 'image') {
    console.log('🖼️ 图片类型，使用 generateThumbnailForUnifiedMediaItem 获取完整大图')

    // 使用原始尺寸生成完整大图
    const thumbnailUrl = await generateThumbnailForUnifiedMediaItem(
      mediaItem,
      undefined, // 图片不需要时间位置
      originalWidth,
      originalHeight,
      ThumbnailMode.FIT, // 使用适应模式，保持宽高比
    )

    if (!thumbnailUrl) {
      throw new Error('无法生成图片缩略图')
    }

    // 将 Blob URL 转换为 Blob
    const response = await fetch(thumbnailUrl)
    const blob = await response.blob()

    // 清理 Blob URL
    URL.revokeObjectURL(thumbnailUrl)

    return blob
  }

  // 4. 视频类型：使用 Combinator 导出
  if (mediaItem.mediaType !== 'video') {
    throw new Error(`不支持的媒体类型: ${mediaItem.mediaType}，仅支持视频和图片`)
  }

  if (!webav.mp4Clip) {
    throw new Error('媒体项目缺少 MP4Clip')
  }

  // 5. 克隆 Clip
  const clonedClip = await webav.mp4Clip.clone()

  // 6. 创建 VideoOffscreenSprite
  const offscreenSprite = new VideoOffscreenSprite(clonedClip)

  // 7. 设置默认时间范围（使用媒体项目的完整时长）
  const duration = mediaItem.duration || 0

  offscreenSprite.setTimeRange({
    clipStartTime: 0,
    clipEndTime: duration,
    timelineStartTime: 0,
    timelineEndTime: duration,
  })

  // 8. 设置原始尺寸和默认位置
  offscreenSprite.rect.x = 0
  offscreenSprite.rect.y = 0
  offscreenSprite.rect.w = originalWidth
  offscreenSprite.rect.h = originalHeight
  offscreenSprite.rect.angle = 0
  offscreenSprite.opacity = 1

  // 9. 使用 Combinator 合成（使用原始尺寸）
  return await combineToBlob({
    videoWidth: originalWidth,
    videoHeight: originalHeight,
    sprites: [offscreenSprite],
    onProgress,
  })
}

/**
 * 导出单个时间轴项目为 Blob（使用原始尺寸）
 */
export async function exportTimelineItem(options: ExportTimelineItemOptions): Promise<Blob> {
  const { timelineItem, onProgress } = options

  // 获取 unifiedStore 实例
  const unifiedStore = useUnifiedStore()

  // 1. 验证时间轴项目状态
  if (timelineItem.timelineStatus !== 'ready') {
    throw new Error('时间轴项目未就绪，无法导出')
  }

  // 2. 图片类型特殊处理：使用 generateThumbnailForUnifiedMediaItem
  if (isImageTimelineItem(timelineItem)) {
    console.log('🖼️ 图片类型时间轴项目，使用 generateThumbnailForUnifiedMediaItem')

    // 获取关联的媒体项目
    const mediaItem = unifiedStore.getMediaItem(timelineItem.mediaItemId)
    if (!mediaItem) {
      throw new Error('找不到关联的媒体项目')
    }

    // 获取原始尺寸
    const originalWidth = mediaItem.runtime.bunny?.originalWidth
    const originalHeight = mediaItem.runtime.bunny?.originalHeight

    if (!originalWidth || !originalHeight) {
      throw new Error('无法获取媒体项目的原始尺寸')
    }

    // 使用原始尺寸生成完整大图
    const thumbnailUrl = await generateThumbnailForUnifiedMediaItem(
      mediaItem,
      undefined,
      originalWidth,
      originalHeight,
      ThumbnailMode.FIT,
    )

    if (!thumbnailUrl) {
      throw new Error('无法生成图片缩略图')
    }

    // 将 Blob URL 转换为 Blob
    const response = await fetch(thumbnailUrl)
    const blob = await response.blob()

    // 清理 Blob URL
    URL.revokeObjectURL(thumbnailUrl)

    return blob
  }

  // 3. 视频类型：使用 Combinator 导出
  if (!isVideoTimelineItem(timelineItem)) {
    throw new Error(`不支持的媒体类型: ${timelineItem.mediaType}，仅支持视频和图片`)
  }

  const sprite = timelineItem.runtime.sprite
  if (!sprite) {
    throw new Error('时间轴项目缺少 Sprite 对象')
  }

  const clip = sprite.getClip()
  if (!clip) {
    throw new Error('无法获取 Clip 对象')
  }

  // 4. 获取原始尺寸
  const mediaItem = unifiedStore.getMediaItem(timelineItem.mediaItemId)
  if (!mediaItem) {
    throw new Error('找不到关联的媒体项目')
  }

  const originalWidth = mediaItem.runtime.bunny?.originalWidth
  const originalHeight = mediaItem.runtime.bunny?.originalHeight

  if (!originalWidth || !originalHeight) {
    throw new Error('无法获取媒体项目的原始尺寸')
  }

  // 5. 克隆 Clip
  const clonedClip = await clip.clone()

  // 6. 创建 VideoOffscreenSprite
  const offscreenSprite = new VideoOffscreenSprite(clonedClip as MP4Clip)

  // 7. 使用时间轴项目的 timeRange（只设置时间范围，不设置其他属性）
  const { timeRange } = timelineItem

  offscreenSprite.setTimeRange({
    clipStartTime: timeRange.clipStartTime,
    clipEndTime: timeRange.clipEndTime,
    timelineStartTime: 0, // 导出时从0开始
    timelineEndTime: timeRange.timelineEndTime - timeRange.timelineStartTime,
  })

  // 8. 设置原始尺寸和默认位置
  offscreenSprite.rect.x = 0
  offscreenSprite.rect.y = 0
  offscreenSprite.rect.w = originalWidth
  offscreenSprite.rect.h = originalHeight
  offscreenSprite.rect.angle = 0
  offscreenSprite.opacity = 1

  // 9. 不设置音频属性（使用默认值）
  // 不设置动画（不应用任何动画效果）

  // 10. 使用 Combinator 合成（使用原始尺寸）
  return await combineToBlob({
    videoWidth: originalWidth,
    videoHeight: originalHeight,
    sprites: [offscreenSprite],
    onProgress,
  })
}
