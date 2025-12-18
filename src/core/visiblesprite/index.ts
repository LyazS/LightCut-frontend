// ==================== 基础类和类型 ====================

// 导出基础 VisibleSprite 类
export { BaseVisibleSprite } from './BaseVisibleSprite'

// ==================== 具体实现类 ====================

// 导出视频 VisibleSprite 类和相关类型
export { VideoVisibleSprite } from './VideoVisibleSprite'
import { VideoVisibleSprite } from '@/core/visiblesprite/VideoVisibleSprite'
export type { TAnimationKeyFrame } from './VideoVisibleSprite'

// 导出图片 VisibleSprite 类
export { ImageVisibleSprite } from './ImageVisibleSprite'
import { ImageVisibleSprite } from '@/core/visiblesprite/ImageVisibleSprite'
// 导出文本 VisibleSprite 类
export { TextVisibleSprite } from './TextVisibleSprite'
import { TextVisibleSprite } from '@/core/visiblesprite/TextVisibleSprite'
// 导出音频 VisibleSprite 类
export { AudioVisibleSprite } from './AudioVisibleSprite'
import { AudioVisibleSprite } from '@/core/visiblesprite/AudioVisibleSprite'

// 导出统一的精灵类型
export type UnifiedSprite =
  | VideoVisibleSprite
  | ImageVisibleSprite
  | TextVisibleSprite
  | AudioVisibleSprite

// ==================== 共享类型定义 ====================

// 导出所有类型接口（统一从 types.ts 导出）
export type {
  AudioState,
  ExtendedSpriteEvents,
  TextSpriteEvents,
} from '@/core/visiblesprite/types'
