/**
 * 文本类型定义
 * 包含文本样式相关的类型和常量
 */

/**
 * 默认文本样式配置
 */
export const DEFAULT_TEXT_STYLE: TextStyleConfig = {
  fontSize: 48,
  fontFamily: 'Arial, sans-serif',
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#ffffff',
  textAlign: 'center',
  lineHeight: 1.2,
}

/**
 * 文本样式配置接口
 */
export interface TextStyleConfig {
  // 基础字体属性
  fontSize: number // 字体大小 (px)
  fontFamily: string // 字体族
  fontWeight: string | number // 字重
  fontStyle: 'normal' | 'italic' // 字体样式

  // 颜色属性
  color: string // 文字颜色
  backgroundColor?: string // 背景颜色

  // 文本效果
  textShadow?: string // 文字阴影
  textStroke?: {
    // 文字描边
    width: number
    color: string
  }
  textGlow?: {
    // 文字发光
    color: string
    blur: number
    spread?: number
  }

  // 布局属性
  textAlign: 'left' | 'center' | 'right' // 文本对齐
  lineHeight?: number // 行高
  maxWidth?: number // 最大宽度

  // 自定义字体
  customFont?: {
    name: string
    url: string
  }
}