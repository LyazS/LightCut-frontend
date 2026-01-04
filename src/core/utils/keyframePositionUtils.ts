/**
 * 关键帧位置转换工具函数
 * 提供百分比和帧位置之间的转换，以及缓存管理
 */

import type { AnimateKeyframe } from '@/core/timelineitem/bunnytype'
import type { MediaType } from '@/core/mediaitem'

/**
 * 百分比位置转换为帧位置
 * @param percentage 百分比位置 (0-1)
 * @param clipDurationFrames clip 时长（帧数）
 * @returns 帧位置
 */
export function percentageToFrame(
  percentage: number,
  clipDurationFrames: number
): number {
  return Math.round(percentage * clipDurationFrames)
}

/**
 * 帧位置转换为百分比位置
 * @param frame 帧位置
 * @param clipDurationFrames clip 时长（帧数）
 * @returns 百分比位置 (0-1)
 */
export function frameToPercentage(
  frame: number,
  clipDurationFrames: number
): number {
  if (clipDurationFrames === 0) return 0
  return frame / clipDurationFrames
}

/**
 * 限制百分比在有效范围内 (0-1)
 * @param percentage 百分比位置
 * @returns 限制后的百分比位置
 */
export function clampPercentage(percentage: number): number {
  return Math.max(0, Math.min(1, percentage))
}

/**
 * 更新关键帧的缓存帧位置
 * 在创建关键帧或 clip 时长变化时调用
 * @param keyframe 关键帧对象
 * @param clipDurationFrames clip 时长（帧数）
 */
export function updateKeyframeCachedFrame(
  keyframe: AnimateKeyframe<MediaType>,
  clipDurationFrames: number
): void {
  // 使用类型断言绕过 readonly 限制
  ;(keyframe as any).cachedFrame = percentageToFrame(keyframe.position, clipDurationFrames)
}

/**
 * 批量更新所有关键帧的缓存帧位置
 * 在 clip 时长变化时调用
 * @param keyframes 关键帧数组
 * @param clipDurationFrames clip 时长（帧数）
 */
export function updateAllKeyframesCachedFrames(
  keyframes: AnimateKeyframe<MediaType>[],
  clipDurationFrames: number
): void {
  for (const keyframe of keyframes) {
    updateKeyframeCachedFrame(keyframe, clipDurationFrames)
  }
}