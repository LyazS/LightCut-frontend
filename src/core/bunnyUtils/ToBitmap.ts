import { toPng } from 'html-to-image'

type TextToImageOptions = {
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  color?: string
  maxWidth?: number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right'
  background?: string
  pixelRatio?: number
}

export async function textToImageBitmap(
  text: string,
  options: TextToImageOptions = {},
): Promise<ImageBitmap> {
  if (!text) {
    throw new Error('text is empty')
  }

  const {
    fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, Arial, sans-serif',
    fontSize = 32,
    fontWeight = 400,
    color = '#000',
    maxWidth,
    lineHeight = 1.4,
    letterSpacing = 0,
    textAlign = 'left',
    background = 'transparent',
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2), // ✅ 防止超高 DPI OOM
  } = options

  // ✅ 防坑 1：确保字体加载完成（否则 fallback）
  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  // ✅ 防坑 2：创建可测量、不可见、但可渲染的 DOM
  const el = document.createElement('div')
  el.textContent = text

  Object.assign(el.style, {
    position: 'fixed', // ✅ 不受父级影响
    left: '0',
    top: '0',
    transform: 'translate(-99999px, -99999px)', // ✅ 不用 display:none
    pointerEvents: 'none',
    userSelect: 'none',
    boxSizing: 'border-box',

    display: 'inline-block', // ✅ 防 inline 宽度 0
    whiteSpace: maxWidth ? 'normal' : 'pre',
    wordBreak: 'break-word',

    fontFamily,
    fontSize: `${fontSize}px`,
    fontWeight: String(fontWeight),
    lineHeight: String(lineHeight),
    letterSpacing: `${letterSpacing}px`,
    color,
    textAlign,

    background,
  })

  if (maxWidth) {
    el.style.maxWidth = `${maxWidth}px`
  }

  document.body.appendChild(el)

  // ✅ 防坑 3：强制布局计算（Safari / Chrome 差异）
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    document.body.removeChild(el)
    throw new Error('Text layout failed: zero size')
  }

  // ✅ 防坑 4：避免 CSS transform / zoom 影响截图
  const style = window.getComputedStyle(el)
  const zoomBackup = style.zoom
  el.style.zoom = '1'

  try {
    // ✅ 防坑 5：DOM → PNG（高质量）
    const dataUrl = await toPng(el, {
      backgroundColor: background,
      pixelRatio,
      cacheBust: true, // ✅ 防缓存字体异常
      skipFonts: false,
    })

    // ✅ 防坑 6：释放 DOM
    document.body.removeChild(el)

    // ✅ 防坑 7：PNG → ImageBitmap（解码在后台线程）
    const blob = await (await fetch(dataUrl)).blob()

    const bitmap = await createImageBitmap(blob, {
      premultiplyAlpha: 'premultiply',
      colorSpaceConversion: 'default',
    })

    return bitmap
  } finally {
    // ✅ 防坑 8：恢复样式，避免污染
    el.style.zoom = zoomBackup
  }
}

/**
 * 现代 / 性能最优
 * Image File → ImageBitmap
 */
export async function fileToImageBitmap(
  file: File,
  options?: {
    maxPixels?: number // 防 OOM（默认开启）
    resizeWidth?: number // 可选：解码时缩放
    resizeHeight?: number
    resizeQuality?: ImageSmoothingQuality
  },
): Promise<ImageBitmap> {
  const {
    maxPixels = 4096 * 4096, // ✅ 防超大图内存炸
    resizeWidth,
    resizeHeight,
    resizeQuality = 'high',
  } = options ?? {}

  // ✅ 防坑 1：优先在解码阶段缩放（最省内存）
  const bitmap = await createImageBitmap(file, {
    resizeWidth,
    resizeHeight,
    resizeQuality,
  })

  // ✅ 防坑 2：解码成功但尺寸异常（极少数损坏图片）
  if (bitmap.width === 0 || bitmap.height === 0) {
    bitmap.close()
    throw new Error('Decoded bitmap has invalid size')
  }

  // ✅ 防坑 3：超大图兜底（防止后续 Canvas / WebGL 崩）
  if (bitmap.width * bitmap.height > maxPixels) {
    bitmap.close()
    throw new Error('Bitmap exceeds max pixel limit')
  }

  // ✅ 防坑 4：颜色 / Alpha 处理一致性（WebGL 友好）
  // 注意：createImageBitmap 已完成解码，此处只保证行为稳定
  return bitmap // ✅ CanvasImageSource
}
