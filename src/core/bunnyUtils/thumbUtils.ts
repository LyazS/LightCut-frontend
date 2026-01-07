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
 * @param clockwiseRotation 顺时针旋转角度（0, 90, 180, 270），默认为0
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
  backgroundColor: string = '#000000',
  clockwiseRotation: number = 0
): void {
  // 填充背景色（清除之前的内容）
  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, drawInfo.containerWidth, drawInfo.containerHeight)

  // 如果有旋转，需要特殊处理
  if (clockwiseRotation !== 0) {
    // 保存当前状态
    ctx.save()

    // 移动到绘制中心点
    const centerX = drawInfo.offsetX + drawInfo.drawWidth / 2
    const centerY = drawInfo.offsetY + drawInfo.drawHeight / 2
    ctx.translate(centerX, centerY)

    // 应用旋转
    ctx.rotate((clockwiseRotation * Math.PI) / 180)

    // 绘制图像（注意：旋转后需要调整绘制位置）
    ctx.drawImage(
      source as CanvasImageSource,
      -drawInfo.drawHeight / 2,
      -drawInfo.drawWidth / 2,
      drawInfo.drawHeight,
      drawInfo.drawWidth,
    )

    // 恢复状态
    ctx.restore()
  } else {
    // 绘制图像（无旋转）
    ctx.drawImage(
      source as CanvasImageSource,
      drawInfo.offsetX,
      drawInfo.offsetY,
      drawInfo.drawWidth,
      drawInfo.drawHeight
    )
  }
}

/**
 * 从VideoFrame或ImageBitmap创建Canvas并绘制缩略图
 * 组合函数：使用 createCanvasWithSize 和 drawImageOnCanvas 实现
 * @param source VideoFrame或ImageBitmap
 * @param sizeInfo 尺寸和位置信息
 * @param clockwiseRotation 顺时针旋转角度（0, 90, 180, 270），默认为0
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
  clockwiseRotation: number = 0,
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvasWithSize(
    sizeInfo.containerWidth,
    sizeInfo.containerHeight
  )

  // 使用统一的 drawImageOnCanvas 函数，传入旋转参数
  drawImageOnCanvas(ctx, source, sizeInfo, '#000000', clockwiseRotation)

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