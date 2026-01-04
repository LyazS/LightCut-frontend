/**
 * 关键帧位置转换工具函数
 * 提供百分比和帧位置之间的转换，以及缓存管理
 */

import type { AnimateKeyframe, KeyframePropertiesMap } from '@/core/timelineitem/bunnytype'
import type { MediaType } from '@/core/mediaitem'
import { cloneDeep } from 'lodash'

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

/**
 * 在指定位置通过插值创建关键帧
 *
 * @param keyframes 关键帧数组
 * @param position 目标位置的百分比 (0-1)
 * @param clipDuration clip 时长（帧数）
 * @returns 插值后的关键帧，如果无法插值则返回 null
 */
export function interpolateKeyframeAtPosition<T extends MediaType>(
  keyframes: AnimateKeyframe<T>[],
  position: number,
  clipDuration: number
): AnimateKeyframe<T> | null {
  // 找到前后关键帧
  let before: AnimateKeyframe<T> | null = null
  let after: AnimateKeyframe<T> | null = null

  for (const kf of keyframes) {
    if (kf.position <= position) {
      before = kf
    } else if (kf.position > position && !after) {
      after = kf
      break
    }
  }

  // 无法插值的情况
  if (!before && !after) return null
  if (!before) return cloneDeep(after!)
  if (!after) return cloneDeep(before)

  // 计算插值因子
  const t = (position - before.position) / (after.position - before.position)

  // 创建新关键帧
  const newKeyframe: any = {
    position,
    cachedFrame: percentageToFrame(position, clipDuration),
    properties: {},
  }

  // 对每个属性进行线性插值
  const props = Object.keys(before.properties) as Array<keyof typeof before.properties>
  for (const prop of props) {
    const startValue = before.properties[prop] as number
    const endValue = after.properties[prop] as number

    if (typeof startValue === 'number' && typeof endValue === 'number') {
      newKeyframe.properties[prop] = startValue + (endValue - startValue) * t
    } else {
      newKeyframe.properties[prop] = startValue
    }
  }

  return newKeyframe as AnimateKeyframe<T>
}

/**
 * 在指定位置切割关键帧数组
 *
 * 核心逻辑：
 * 1. 根据切割位置将关键帧分为两组
 * 2. 重新映射每组关键帧的 position 到新的 [0, 1] 范围
 * 3. 更新 cachedFrame 基于新的 clip 时长
 * 4. 在切割点创建关键帧（如果需要）
 *
 * @param keyframes 原始关键帧数组（已按 position 排序）
 * @param splitPosition 切割位置的百分比 (0-1)，相对于原始 clip
 * @param originalDuration 原始 clip 时长（帧数）
 * @param firstDuration 第一个片段的时长（帧数）
 * @param secondDuration 第二个片段的时长（帧数）
 * @returns 切割后的两组关键帧和切割点关键帧
 */
export function splitKeyframesAtPosition<T extends MediaType>(
  keyframes: AnimateKeyframe<T>[],
  splitPosition: number,
  originalDuration: number,
  firstDuration: number,
  secondDuration: number
): {
  firstKeyframes: AnimateKeyframe<T>[]
  secondKeyframes: AnimateKeyframe<T>[]
  splitKeyframe: AnimateKeyframe<T> | null
} {
  const firstKeyframes: AnimateKeyframe<T>[] = []
  const secondKeyframes: AnimateKeyframe<T>[] = []
  let splitKeyframe: AnimateKeyframe<T> | null = null
  let exactSplitKeyframe: AnimateKeyframe<T> | null = null

  // 1. 分类关键帧
  for (const kf of keyframes) {
    if (kf.position < splitPosition) {
      // 属于第一个片段
      // 边界情况：如果 splitPosition 为 0，则第一个片段时长为 0，不应该有关键帧
      if (splitPosition > 0) {
        const newPosition = kf.position / splitPosition
        const newKeyframe = cloneDeep(kf)
        ;(newKeyframe as any).position = newPosition
        ;(newKeyframe as any).cachedFrame = percentageToFrame(newPosition, firstDuration)
        firstKeyframes.push(newKeyframe)
      }
    } else if (kf.position > splitPosition) {
      // 属于第二个片段
      // 边界情况：如果 splitPosition 为 1，则第二个片段时长为 0，不应该有关键帧
      if (splitPosition < 1) {
        const newPosition = (kf.position - splitPosition) / (1 - splitPosition)
        const newKeyframe = cloneDeep(kf)
        ;(newKeyframe as any).position = newPosition
        ;(newKeyframe as any).cachedFrame = percentageToFrame(newPosition, secondDuration)
        secondKeyframes.push(newKeyframe)
      }
    } else {
      // 恰好在切割点上
      exactSplitKeyframe = kf
    }
  }

  // 2. 处理切割点关键帧
  if (exactSplitKeyframe) {
    // 切割点恰好有关键帧，复制到两个片段
    const firstSplit = cloneDeep(exactSplitKeyframe)
    ;(firstSplit as any).position = 1.0
    ;(firstSplit as any).cachedFrame = firstDuration
    firstKeyframes.push(firstSplit)

    const secondSplit = cloneDeep(exactSplitKeyframe)
    ;(secondSplit as any).position = 0.0
    ;(secondSplit as any).cachedFrame = 0
    secondKeyframes.push(secondSplit)

    splitKeyframe = exactSplitKeyframe
  } else {
    // 需要通过插值创建切割点关键帧
    splitKeyframe = interpolateKeyframeAtPosition(
      keyframes,
      splitPosition,
      originalDuration
    )

    if (splitKeyframe) {
      // 添加到第一个片段的末尾
      const firstSplit = cloneDeep(splitKeyframe)
      ;(firstSplit as any).position = 1.0
      ;(firstSplit as any).cachedFrame = firstDuration
      firstKeyframes.push(firstSplit)

      // 添加到第二个片段的开头
      const secondSplit = cloneDeep(splitKeyframe)
      ;(secondSplit as any).position = 0.0
      ;(secondSplit as any).cachedFrame = 0
      secondKeyframes.push(secondSplit)
    }
  }

  // 3. 对关键帧数组进行排序（确保 position 顺序正确）
  firstKeyframes.sort((a, b) => a.position - b.position)
  secondKeyframes.sort((a, b) => a.position - b.position)

  return {
    firstKeyframes,
    secondKeyframes,
    splitKeyframe,
  }
}