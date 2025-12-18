import { VideoVisibleSprite } from '@/core/visiblesprite/VideoVisibleSprite'
import { AudioVisibleSprite } from '@/core/visiblesprite/AudioVisibleSprite'
import { ImageVisibleSprite } from '@/core/visiblesprite/ImageVisibleSprite'
import { TextVisibleSprite } from '@/core/visiblesprite/TextVisibleSprite'
import type { UnifiedSprite } from '@/core/visiblesprite'

/**
 * 统一架构的Sprite类型守卫
 * 用于检查UnifiedSprite的具体类型
 */

/**
 * 类型守卫：检查 sprite 是否是 VideoVisibleSprite 类型
 * @param sprite 要检查的 sprite 对象
 * @returns 如果是 VideoVisibleSprite 类型则返回 true
 */
export function isUnifiedVideoVisibleSprite(sprite: UnifiedSprite): sprite is VideoVisibleSprite {
  return sprite instanceof VideoVisibleSprite
}

/**
 * 类型守卫：检查 sprite 是否是 AudioVisibleSprite 类型
 * @param sprite 要检查的 sprite 对象
 * @returns 如果是 AudioVisibleSprite 类型则返回 true
 */
export function isUnifiedAudioVisibleSprite(sprite: UnifiedSprite): sprite is AudioVisibleSprite {
  return sprite instanceof AudioVisibleSprite
}

/**
 * 类型守卫：检查 sprite 是否是 ImageVisibleSprite 类型
 * @param sprite 要检查的 sprite 对象
 * @returns 如果是 ImageVisibleSprite 类型则返回 true
 */
export function isUnifiedImageVisibleSprite(sprite: UnifiedSprite): sprite is ImageVisibleSprite {
  return sprite instanceof ImageVisibleSprite
}

/**
 * 类型守卫：检查 sprite 是否是 TextVisibleSprite 类型
 * @param sprite 要检查的 sprite 对象
 * @returns 如果是 TextVisibleSprite 类型则返回 true
 */
export function isUnifiedTextVisibleSprite(sprite: UnifiedSprite): sprite is TextVisibleSprite {
  return sprite instanceof TextVisibleSprite
}

/**
 * 类型守卫：检查 sprite 是否有音频功能（视频或音频类型）
 * @param sprite 要检查的 sprite 对象
 * @returns 如果有音频功能则返回 true
 */
export function hasAudioCapabilities(
  sprite: UnifiedSprite,
): sprite is VideoVisibleSprite | AudioVisibleSprite {
  return isUnifiedVideoVisibleSprite(sprite) || isUnifiedAudioVisibleSprite(sprite)
}

/**
 * 类型守卫：检查 sprite 是否有视觉功能（视频、图片或文本类型）
 * @param sprite 要检查的 sprite 对象
 * @returns 如果有视觉功能则返回 true
 */
export function hasVisualCapabilities(
  sprite: UnifiedSprite,
): sprite is VideoVisibleSprite | ImageVisibleSprite | TextVisibleSprite {
  return (
    isUnifiedVideoVisibleSprite(sprite) ||
    isUnifiedImageVisibleSprite(sprite) ||
    isUnifiedTextVisibleSprite(sprite)
  )
}
