import type { UnifiedMediaItemData } from '@/core/mediaitem'
import { UnifiedMediaItemQueries } from '@/core/mediaitem'
import { ThumbnailMode } from '@/constants/ThumbnailConstants'
import {
  calculateThumbnailSize,
  createThumbnailCanvas,
  canvasToBlob,
} from '@/core/bunnyUtils/thumbUtils'
import { BunnyClip } from '../mediabunny/bunny-clip'
import { RENDERER_FPS } from '../mediabunny/constant'

/**
 * 使用BunnyClip的getSampleN方法生成视频缩略图
 * @param bunnyClip BunnyClip实例
 * @param timeNPosition 帧位置（bigint），默认为视频中间位置
 * @param containerWidth 容器宽度（默认100px）
 * @param containerHeight 容器高度（默认60px）
 * @param mode 缩略图显示模式，默认为适应模式
 * @param shouldClone 是否克隆BunnyClip以避免影响原始实例，默认为true
 * @returns Promise<HTMLCanvasElement>
 */
export async function generateVideoThumbnail(
  bunnyClip: BunnyClip,
  timeNPosition?: bigint,
  containerWidth: number = 100,
  containerHeight: number = 60,
  mode: ThumbnailMode = ThumbnailMode.FIT,
  shouldClone: boolean = true, // 新增参数，默认要clone
): Promise<HTMLCanvasElement> {
  let workingClip: BunnyClip = bunnyClip // 使用原始clip或克隆的clip

  try {
    console.log('🎬 [ThumbnailGenerator] 开始生成视频缩略图...')

    // 等待BunnyClip准备完成
    console.log('⏳ [ThumbnailGenerator] 等待BunnyClip准备完成...')
    await bunnyClip.ready
    console.log('✅ [ThumbnailGenerator] BunnyClip准备完成:', {
      duration: bunnyClip.duration,
      width: bunnyClip.width,
      height: bunnyClip.height,
    })

    // 根据shouldClone标志决定是否克隆BunnyClip
    if (shouldClone) {
      console.log('🔄 [ThumbnailGenerator] 克隆BunnyClip...')
      workingClip = (await bunnyClip.clone()) as BunnyClip
      console.log('✅ [ThumbnailGenerator] BunnyClip克隆完成')
    } else {
      console.log('ℹ️ [ThumbnailGenerator] 跳过克隆，使用原始BunnyClip')
      // workingClip 初始值已经是 bunnyClip，无需重新赋值
    }

    // 如果没有指定帧位置，使用视频中间位置
    const tickTimeN = timeNPosition ?? bunnyClip.durationN / 2n
    console.log('⏰ [ThumbnailGenerator] 获取视频帧时间位置:', tickTimeN, '帧')

    // 使用workingClip获取指定时间的帧
    console.log('🎞️ [ThumbnailGenerator] 开始getSampleN获取视频帧...')
    const tickResult = await workingClip.getSampleN(tickTimeN)
    console.log('📸 [ThumbnailGenerator] getSampleN结果:', {
      state: tickResult.state,
      hasVideo: !!tickResult.video,
    })

    if (tickResult.state !== 'success' || !tickResult.video) {
      throw new Error('无法获取视频帧')
    }

    // 将VideoSample转换为VideoFrame
    const videoFrame = tickResult.video.toVideoFrame()
    // 立即关闭VideoSample以释放资源
    tickResult.video.close()

    // 计算缩略图尺寸
    const sizeInfo = calculateThumbnailSize(
      bunnyClip.width,
      bunnyClip.height,
      containerWidth,
      containerHeight,
      mode,
    )
    console.log('📐 [ThumbnailGenerator] 缩略图尺寸:', {
      original: `${bunnyClip.width}x${bunnyClip.height}`,
      container: `${sizeInfo.containerWidth}x${sizeInfo.containerHeight}`,
      draw: `${sizeInfo.drawWidth}x${sizeInfo.drawHeight}`,
      offset: `${sizeInfo.offsetX},${sizeInfo.offsetY}`,
    })

    // 创建缩略图canvas
    console.log('🎨 [ThumbnailGenerator] 创建缩略图canvas...')
    const canvas = createThumbnailCanvas(videoFrame, sizeInfo)
    console.log('✅ [ThumbnailGenerator] 缩略图canvas创建完成')

    // 清理VideoFrame资源
    videoFrame.close()

    return canvas
  } catch (error) {
    console.error('❌ [ThumbnailGenerator] 生成视频缩略图失败:', error)
    console.error('❌ [ThumbnailGenerator] 错误堆栈:', (error as Error).stack)
    throw error
  } finally {
    // 清理克隆的clip（只有当shouldClone为true且workingClip是克隆的实例时才需要清理）
    if (shouldClone && workingClip !== bunnyClip) {
      console.log('🧹 [ThumbnailGenerator] 清理克隆的clip')
      await workingClip.dispose()
    }
  }
}

/**
 * 使用ImageBitmap生成图片缩略图
 * @param imageBitmap ImageBitmap实例
 * @param containerWidth 容器宽度（默认100px）
 * @param containerHeight 容器高度（默认60px）
 * @param mode 缩略图显示模式，默认为适应模式
 * @returns Promise<HTMLCanvasElement>
 */
export async function generateImageThumbnail(
  imageBitmap: ImageBitmap,
  containerWidth: number = 100,
  containerHeight: number = 60,
  mode: ThumbnailMode = ThumbnailMode.FIT,
): Promise<HTMLCanvasElement> {
  try {
    console.log('🖼️ [ThumbnailGenerator] 开始生成图片缩略图...')
    console.log('✅ [ThumbnailGenerator] ImageBitmap准备完成:', {
      width: imageBitmap.width,
      height: imageBitmap.height,
    })

    // 计算缩略图尺寸
    const sizeInfo = calculateThumbnailSize(
      imageBitmap.width,
      imageBitmap.height,
      containerWidth,
      containerHeight,
      mode,
    )
    console.log('📐 [ThumbnailGenerator] 缩略图尺寸:', {
      original: `${imageBitmap.width}x${imageBitmap.height}`,
      container: `${sizeInfo.containerWidth}x${sizeInfo.containerHeight}`,
      draw: `${sizeInfo.drawWidth}x${sizeInfo.drawHeight}`,
      offset: `${sizeInfo.offsetX},${sizeInfo.offsetY}`,
    })

    // 创建缩略图canvas
    console.log('🎨 [ThumbnailGenerator] 创建缩略图canvas...')
    const canvas = createThumbnailCanvas(imageBitmap, sizeInfo)
    console.log('✅ [ThumbnailGenerator] 缩略图canvas创建完成')

    return canvas
  } catch (error) {
    console.error('❌ [ThumbnailGenerator] 生成图片缩略图失败:', error)
    console.error('❌ [ThumbnailGenerator] 错误堆栈:', (error as Error).stack)
    throw error
  }
}

export async function tryGetAudioCover(
  bunnyClip: BunnyClip,
  containerWidth: number = 100,
  containerHeight: number = 60,
  mode: ThumbnailMode = ThumbnailMode.FIT,
): Promise<string | undefined> {
  try {
    console.log('🎵 [ThumbnailGenerator] 尝试获取音频封面...')
    
    // 获取音频文件的元数据标签
    const metadata = await bunnyClip.getMetadataTags()
    
    if (!metadata || !metadata.images || metadata.images.length === 0) {
      console.log('ℹ️ [ThumbnailGenerator] 音频文件没有封面图片')
      return undefined
    }

    console.log(`📸 [ThumbnailGenerator] 找到 ${metadata.images.length} 张图片`)

    // 优先选择前封面，其次是后封面，最后是未知类型
    let selectedImage = metadata.images.find((img) => img.kind === 'coverFront')
    if (!selectedImage) {
      selectedImage = metadata.images.find((img) => img.kind === 'coverBack')
    }
    if (!selectedImage) {
      selectedImage = metadata.images[0] // 如果没有明确的封面类型，使用第一张图片
    }

    console.log('✅ [ThumbnailGenerator] 选择封面:', {
      kind: selectedImage.kind,
      mimeType: selectedImage.mimeType,
      name: selectedImage.name,
      dataSize: selectedImage.data.length,
    })

    // 将Uint8Array转换为Blob（需要创建新的Uint8Array以确保类型兼容）
    const imageData = new Uint8Array(selectedImage.data)
    const blob = new Blob([imageData], { type: selectedImage.mimeType })
    
    // 创建ImageBitmap
    const imageBitmap = await createImageBitmap(blob)
    console.log('🖼️ [ThumbnailGenerator] ImageBitmap创建成功:', {
      width: imageBitmap.width,
      height: imageBitmap.height,
    })

    // 使用现有的图片缩略图生成函数
    const canvas = await generateImageThumbnail(
      imageBitmap,
      containerWidth,
      containerHeight,
      mode,
    )

    // 清理ImageBitmap资源
    imageBitmap.close()

    // 转换为Blob URL
    const thumbnailUrl = await canvasToBlob(canvas)
    console.log('✅ [ThumbnailGenerator] 音频封面缩略图生成成功')
    
    return thumbnailUrl
  } catch (error) {
    console.error('❌ [ThumbnailGenerator] 获取音频封面失败:', error)
    return undefined
  }
}

/**
 * 统一的缩略图生成函数 - 根据媒体类型自动选择合适的生成方法
 * @param mediaItem 统一媒体项目
 * @param timePosition 视频时间位置（微秒），仅对视频有效
 * @param containerWidth 容器宽度（默认100px）
 * @param containerHeight 容器高度（默认60px）
 * @param mode 缩略图显示模式，默认为适应模式
 * @returns Promise<string | undefined> 缩略图URL
 */
export async function generateThumbnailForUnifiedMediaItemBunny(
  mediaItem: UnifiedMediaItemData,
  timePosition?: number,
  containerWidth: number = 100,
  containerHeight: number = 60,
  mode: ThumbnailMode = ThumbnailMode.FIT,
): Promise<string | undefined> {
  try {
    let canvas: HTMLCanvasElement

    if (UnifiedMediaItemQueries.isVideo(mediaItem) && mediaItem.runtime.bunny?.bunnyClip) {
      console.log('🎬 生成视频缩略图...')
      // 将微秒转换为帧位置
      const timeNPosition =
        timePosition !== undefined
          ? BigInt(Math.floor((timePosition / 1000000) * RENDERER_FPS))
          : undefined
      canvas = await generateVideoThumbnail(
        mediaItem.runtime.bunny.bunnyClip,
        timeNPosition,
        containerWidth,
        containerHeight,
        mode,
        true,
      )
      console.log('✅ 视频缩略图生成成功')
    } else if (UnifiedMediaItemQueries.isImage(mediaItem) && mediaItem.runtime.bunny?.imageClip) {
      console.log('🖼️ 生成图片缩略图...')
      canvas = await generateImageThumbnail(
        mediaItem.runtime.bunny.imageClip,
        containerWidth,
        containerHeight,
        mode,
      )
      console.log('✅ 图片缩略图生成成功')
    } else if (UnifiedMediaItemQueries.isAudio(mediaItem) && mediaItem.runtime.bunny?.bunnyClip) {
      // 如果是音频，可以尝试获取封面图

      return await tryGetAudioCover(
        mediaItem.runtime.bunny.bunnyClip,
        containerWidth,
        containerHeight,
        mode,
      )
    } else {
      console.error('❌ 不支持的媒体类型或缺少clip对象')
      return undefined
    }

    // 转换为Blob URL
    const thumbnailUrl = await canvasToBlob(canvas)
    return thumbnailUrl
  } catch (error) {
    console.error('❌ 缩略图生成失败:', error)
    return undefined
  }
}
