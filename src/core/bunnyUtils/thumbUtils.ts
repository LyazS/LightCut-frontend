import { ThumbnailMode } from '@/constants/ThumbnailConstants'

/**
 * 计算缩略图尺寸
 * @param originalWidth 原始宽度
 * @param originalHeight 原始高度
 * @param containerWidth 容器宽度（100px）
 * @param containerHeight 容器高度（60px）
 * @param mode 缩略图显示模式，默认为适应模式
 * @returns 缩略图尺寸和位置信息
 */
export function calculateThumbnailSize(
  originalWidth: number,
  originalHeight: number,
  containerWidth: number = 100,
  containerHeight: number = 60,
  mode: ThumbnailMode = ThumbnailMode.FIT,
) {
  const aspectRatio = originalWidth / originalHeight
  const containerAspectRatio = containerWidth / containerHeight

  let drawWidth: number
  let drawHeight: number
  let offsetX: number
  let offsetY: number

  if (mode === ThumbnailMode.FILL) {
    // 填满模式：填满整个容器，可能裁剪部分内容
    if (aspectRatio > containerAspectRatio) {
      // 原始宽高比大于容器宽高比，以容器高度为准进行裁剪
      drawWidth = containerHeight * aspectRatio
      drawHeight = containerHeight
      offsetX = (containerWidth - drawWidth) / 2
      offsetY = 0
    } else {
      // 原始宽高比小于等于容器宽高比，以容器宽度为准进行裁剪
      drawWidth = containerWidth
      drawHeight = containerWidth / aspectRatio
      offsetX = 0
      offsetY = (containerHeight - drawHeight) / 2
    }
  } else {
    // 适应模式（默认）：保持宽高比，居中显示，两侧或上下留黑边
    if (aspectRatio > containerAspectRatio) {
      // 原始宽高比大于容器宽高比，以容器宽度为准
      drawWidth = containerWidth
      drawHeight = containerWidth / aspectRatio
    } else {
      // 原始宽高比小于等于容器宽高比，以容器高度为准
      drawWidth = containerHeight * aspectRatio
      drawHeight = containerHeight
    }

    // 计算居中位置
    offsetX = (containerWidth - drawWidth) / 2
    offsetY = (containerHeight - drawHeight) / 2
  }

  return {
    containerWidth,
    containerHeight,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
  }
}

/**
 * 创建指定尺寸的 Canvas 并返回上下文
 * @param width Canvas 宽度
 * @param height Canvas 高度
 * @returns Canvas 元素和 2D 上下文
 */
export function createCanvasWithSize(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('无法创建 Canvas 上下文')
  }

  canvas.width = width
  canvas.height = height

  return { canvas, ctx }
}

/**
 * 在 Canvas 上绘制图像
 * @param ctx Canvas 2D 上下文
 * @param source 图像源（VideoFrame 或 ImageBitmap）
 * @param drawInfo 绘制信息（尺寸和位置）
 * @param backgroundColor 背景色（默认 #000000）
 */
export function drawImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  source: VideoFrame | ImageBitmap,
  drawInfo: {
    containerWidth: number
    containerHeight: number
    drawWidth: number
    drawHeight: number
    offsetX: number
    offsetY: number
  },
  backgroundColor: string = '#000000'
): void {
  // 填充背景色（清除之前的内容）
  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, drawInfo.containerWidth, drawInfo.containerHeight)

  // 绘制图像
  ctx.drawImage(
    source as CanvasImageSource,
    drawInfo.offsetX,
    drawInfo.offsetY,
    drawInfo.drawWidth,
    drawInfo.drawHeight
  )
}

/**
 * 从VideoFrame或ImageBitmap创建Canvas并绘制缩略图
 * 组合函数：使用 createCanvasWithSize 和 drawImageOnCanvas 实现
 * @param source VideoFrame或ImageBitmap
 * @param sizeInfo 尺寸和位置信息
 * @returns Canvas元素
 */
export function createThumbnailCanvas(
  source: VideoFrame | ImageBitmap,
  sizeInfo: {
    containerWidth: number
    containerHeight: number
    drawWidth: number
    drawHeight: number
    offsetX: number
    offsetY: number
  },
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvasWithSize(
    sizeInfo.containerWidth,
    sizeInfo.containerHeight
  )

  drawImageOnCanvas(ctx, source, sizeInfo)

  return canvas
}


/**
 * 将Canvas转换为Blob URL
 * @param canvas Canvas元素
 * @param quality 图片质量（0-1）
 * @returns Promise<string> Blob URL
 */
export function canvasToBlob(canvas: HTMLCanvasElement, quality: number = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          resolve(url)
        } else {
          reject(new Error('无法创建Blob'))
        }
      },
      'image/jpeg',
      quality,
    )
  })
}