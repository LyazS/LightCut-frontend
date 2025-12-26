/**
 * 音频状态接口
 */
export interface AudioState {
  /** 音量（0-1之间，0为静音，1为最大音量） */
  volume: number
  /** 静音状态标记 */
  isMuted: boolean
}

/**
 * 扩展的事件类型定义，包含透明度变化事件和文本更新事件
 */
export type ExtendedSpriteEvents = {
  propsChange: (
    value: Partial<{
      rect: Partial<{ x: number; y: number; w: number; h: number; angle: number }>
      zIndex: number
      opacity: number
      textUpdate?: {
        text: string
        style: import('@/core/timelineitem/texttype').TextStyleConfig
        needsRecreation: boolean
      }
    }>,
  ) => void
}

/**
 * 扩展的文本精灵事件类型
 */
export type TextSpriteEvents = {
  textUpdated: (
    text: string,
    style: import('@/core/timelineitem/texttype').TextStyleConfig,
  ) => void
}
