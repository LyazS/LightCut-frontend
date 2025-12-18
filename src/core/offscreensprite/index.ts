// 导出视频 OffscreenSprite 类和相关类型
export { VideoOffscreenSprite } from './VideoOffscreenSprite'
import { VideoOffscreenSprite } from './VideoOffscreenSprite'
export type { TAnimationKeyFrame } from './VideoOffscreenSprite'

// 导出图片 OffscreenSprite 类
export { ImageOffscreenSprite } from './ImageOffscreenSprite'
import { ImageOffscreenSprite } from './ImageOffscreenSprite'

// 导出文本 OffscreenSprite 类
// export { TextOffscreenSprite } from './TextOffscreenSprite'
// import { TextOffscreenSprite } from './TextOffscreenSprite'

// 导出音频 OffscreenSprite 类
export { AudioOffscreenSprite } from './AudioOffscreenSprite'
import { AudioOffscreenSprite } from './AudioOffscreenSprite'

// 导出统一的精灵类型
export type UnifiedOffscreenSprite =
  | VideoOffscreenSprite
  | ImageOffscreenSprite
  // | TextOffscreenSprite
  | AudioOffscreenSprite
