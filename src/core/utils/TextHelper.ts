import { ImgClip, renderTxt2ImgBitmap } from '@webav/av-cliper'
import type { TextStyleConfig } from '@/core/timelineitem'
import { DEFAULT_TEXT_STYLE } from '@/core/timelineitem/type'

/**
 * 文本渲染工具类
 * 封装 renderTxt2ImgBitmap 的调用和样式处理
 */
export class TextHelper {
  // 样式缓存 - 使用 LRU 策略
  private static readonly CACHE_SIZE = 50
  private static styleCache = new Map<string, ImgClip>()
  private static cacheOrder: string[] = []

  /**
   * 生成 CSS 样式字符串
   * @param style 文本样式配置
   * @returns CSS 样式字符串
   */
  static generateCSSFromStyle(style: TextStyleConfig): string {
    const cssRules: string[] = []

    // 基础字体属性
    cssRules.push(`font-size: ${style.fontSize}px`)
    cssRules.push(`font-family: ${style.fontFamily}`)
    cssRules.push(`font-weight: ${style.fontWeight}`)
    cssRules.push(`font-style: ${style.fontStyle}`)

    // 颜色属性
    cssRules.push(`color: ${style.color}`)
    if (style.backgroundColor) {
      cssRules.push(`background-color: ${style.backgroundColor}`)
    }

    // 文本效果 - 合并阴影和发光效果
    const shadows: string[] = []

    // 添加普通阴影
    if (style.textShadow) {
      shadows.push(style.textShadow)
    }

    // 添加发光效果
    if (style.textGlow) {
      const { color, blur, spread = 0 } = style.textGlow
      shadows.push(`0 0 ${blur}px ${color}`)
      shadows.push(`0 0 ${blur * 2}px ${color}`)
      shadows.push(`0 0 ${blur * 3}px ${color}`)
      if (spread > 0) {
        shadows.push(`0 0 ${spread}px ${color}`)
      }
    }

    // 应用合并的阴影效果
    if (shadows.length > 0) {
      cssRules.push(`text-shadow: ${shadows.join(', ')}`)
    }

    // 描边效果
    if (style.textStroke) {
      cssRules.push(`-webkit-text-stroke: ${style.textStroke.width}px ${style.textStroke.color}`)
    }

    // 布局属性
    cssRules.push(`text-align: ${style.textAlign}`)
    if (style.lineHeight) {
      cssRules.push(`line-height: ${style.lineHeight}`)
    }
    if (style.maxWidth) {
      cssRules.push(`max-width: ${style.maxWidth}px`)
      cssRules.push(`word-wrap: break-word`)
    }

    // 默认样式
    cssRules.push('white-space: nowrap') // 不换行显示
    cssRules.push('display: inline-block') // 确保尺寸计算正确

    return cssRules.join('; ')
  }

  /**
   * 创建文本 ImgClip
   * @param text 文本内容
   * @param style 文本样式配置
   * @returns Promise<ImgClip>
   */
  static async createTextImgClip(text: string, style: TextStyleConfig): Promise<ImgClip> {
    // 检查缓存
    const cacheKey = this.generateCacheKey(text, style)
    const cachedClip = this.getCachedStyle(cacheKey)
    if (cachedClip) {
      console.log('🎯 [TextHelper] 使用缓存的文本渲染结果')
      return await cachedClip.clone()
    }

    try {
      console.log('🎨 [TextHelper] 开始渲染文本:', { text: text.substring(0, 20) + '...', style })

      // 生成 CSS 样式
      const cssText = this.generateCSSFromStyle(style)
      console.log('📝 [TextHelper] 生成的CSS样式:', cssText)

      // 准备渲染选项
      const renderOptions: any = {}
      if (style.customFont) {
        renderOptions.font = style.customFont
      }

      // 调用 WebAV 的文本渲染 API
      const imageBitmap = await renderTxt2ImgBitmap(text, cssText, renderOptions)
      console.log('✅ [TextHelper] 文本渲染完成，ImageBitmap尺寸:', {
        width: imageBitmap.width,
        height: imageBitmap.height,
      })

      // 创建 ImgClip
      const imgClip = new ImgClip(imageBitmap)
      await imgClip.ready

      console.log('🖼️ [TextHelper] ImgClip创建完成')

      // 缓存结果
      this.setCachedStyle(cacheKey, imgClip)

      // 返回克隆的实例，避免缓存被修改
      return await imgClip.clone()
    } catch (error) {
      console.error('❌ [TextHelper] 文本渲染失败:', error)
      throw new Error(`文本渲染失败: ${(error as Error).message}`)
    }
  }

  /**
   * 验证和补全文本样式
   * @param style 部分文本样式配置
   * @returns 完整的文本样式配置
   */
  static validateTextStyle(style: Partial<TextStyleConfig>): TextStyleConfig {
    return {
      fontSize: style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize,
      fontFamily: style.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily,
      fontWeight: style.fontWeight ?? DEFAULT_TEXT_STYLE.fontWeight,
      fontStyle: style.fontStyle ?? DEFAULT_TEXT_STYLE.fontStyle,
      color: style.color ?? DEFAULT_TEXT_STYLE.color,
      // 只有当明确提供了 backgroundColor 时才设置，避免设置为 undefined 导致的问题
      backgroundColor: style.backgroundColor,
      textShadow: style.textShadow,
      textStroke: style.textStroke,
      textGlow: style.textGlow,
      textAlign: style.textAlign ?? DEFAULT_TEXT_STYLE.textAlign,
      lineHeight: style.lineHeight ?? DEFAULT_TEXT_STYLE.lineHeight,
      maxWidth: style.maxWidth,
      customFont: style.customFont,
    }
  }

  /**
   * 生成缓存键
   * @param text 文本内容
   * @param style 文本样式
   * @returns 缓存键
   */
  private static generateCacheKey(text: string, style: TextStyleConfig): string {
    // 创建样式的哈希值
    const styleStr = JSON.stringify(style)
    const hash = this.simpleHash(text + styleStr)
    return `${hash}_${text.length}`
  }

  /**
   * 简单哈希函数
   * @param str 输入字符串
   * @returns 哈希值
   */
  private static simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 获取缓存的样式
   * @param cacheKey 缓存键
   * @returns 缓存的 ImgClip 或 null
   */
  private static getCachedStyle(cacheKey: string): ImgClip | null {
    const clip = this.styleCache.get(cacheKey)
    if (clip) {
      // 更新访问顺序
      const index = this.cacheOrder.indexOf(cacheKey)
      if (index > -1) {
        this.cacheOrder.splice(index, 1)
      }
      this.cacheOrder.push(cacheKey)
      return clip
    }
    return null
  }

  /**
   * 设置缓存的样式
   * @param cacheKey 缓存键
   * @param clip ImgClip 实例
   */
  private static setCachedStyle(cacheKey: string, clip: ImgClip): void {
    // 如果缓存已满，移除最旧的项
    if (this.styleCache.size >= this.CACHE_SIZE) {
      const oldestKey = this.cacheOrder.shift()
      if (oldestKey) {
        const oldClip = this.styleCache.get(oldestKey)
        if (oldClip) {
          oldClip.destroy() // 清理资源
        }
        this.styleCache.delete(oldestKey)
      }
    }

    // 添加新的缓存项
    this.styleCache.set(cacheKey, clip)
    this.cacheOrder.push(cacheKey)
  }

  /**
   * 清理缓存
   */
  static clearCache(): void {
    console.log('🧹 [TextHelper] 清理文本样式缓存')
    for (const clip of this.styleCache.values()) {
      clip.destroy()
    }
    this.styleCache.clear()
    this.cacheOrder.length = 0
  }

  /**
   * 获取缓存统计信息
   * @returns 缓存统计
   */
  static getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.styleCache.size,
      maxSize: this.CACHE_SIZE,
    }
  }
}
