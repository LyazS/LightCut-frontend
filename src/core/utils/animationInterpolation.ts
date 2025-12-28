/**
 * 动画插值工具函数
 * 负责根据关键帧数据计算当前帧的属性值
 */

import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { AnimateKeyframe, KeyframePropertiesMap } from '@/core/timelineitem/bunnytype'
import type { MediaType } from '@/core/mediaitem'
import { absoluteFrameToRelativeFrame } from './unifiedKeyframeUtils'

/**
 * 线性插值函数
 * @param start 起始值
 * @param end 结束值
 * @param t 插值因子 (0-1)
 * @returns 插值结果
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

/**
 * 查找当前帧位置的前后关键帧
 * @param keyframes 关键帧数组
 * @param relativeFrame 相对帧位置
 * @returns 前后关键帧对象
 */
function findSurroundingKeyframes<T extends MediaType>(
  keyframes: AnimateKeyframe<T>[],
  relativeFrame: number
): {
  before: AnimateKeyframe<T> | null
  after: AnimateKeyframe<T> | null
} {
  // 按位置排序（确保顺序正确）
  const sorted = [...keyframes].sort((a, b) => a.framePosition - b.framePosition)
  
  let before: AnimateKeyframe<T> | null = null
  let after: AnimateKeyframe<T> | null = null
  
  for (const kf of sorted) {
    if (kf.framePosition <= relativeFrame) {
      before = kf
    } else if (kf.framePosition > relativeFrame && !after) {
      after = kf
      break
    }
  }
  
  return { before, after }
}

/**
 * 计算插值属性值
 * @param before 前一个关键帧
 * @param after 后一个关键帧
 * @param relativeFrame 当前相对帧位置
 * @returns 插值后的属性值
 */
function interpolateProperties<T extends MediaType>(
  before: AnimateKeyframe<T>,
  after: AnimateKeyframe<T>,
  relativeFrame: number
): Partial<KeyframePropertiesMap[T]> {
  const t = (relativeFrame - before.framePosition) / (after.framePosition - before.framePosition)
  const result: any = {}
  
  // 遍历所有可动画属性
  const props = Object.keys(before.properties) as Array<keyof typeof before.properties>
  
  for (const prop of props) {
    const startValue = before.properties[prop] as number
    const endValue = after.properties[prop] as number
    
    // 只对数值类型进行插值
    if (typeof startValue === 'number' && typeof endValue === 'number') {
      result[prop] = lerp(startValue, endValue, t)
    } else {
      // 非数值类型直接使用起始值
      result[prop] = startValue
    }
  }
  
  return result
}

/**
 * 应用动画到 TimelineItem 的 config
 * 这是核心函数，在渲染循环中每帧调用
 * @param item 时间轴项目
 * @param currentAbsoluteFrame 当前绝对帧位置
 */
export function applyAnimationToConfig(
  item: UnifiedTimelineItemData<MediaType>,
  currentAbsoluteFrame: number
): void {
  // 1. 检查是否有动画
  if (!item.animation || item.animation.keyframes.length === 0) {
    return // 无动画，直接返回
  }
  
  // 2. 检查是否在时间范围内
  const isInTimeRange = 
    currentAbsoluteFrame >= item.timeRange.timelineStartTime &&
    currentAbsoluteFrame <= item.timeRange.timelineEndTime
  if (!isInTimeRange) {
    return // 不在时间范围内，不需要计算
  }
  
  // 3. 计算相对帧位置
  const relativeFrame = absoluteFrameToRelativeFrame(currentAbsoluteFrame, item.timeRange)
  
  // 4. 查找前后关键帧
  const { before, after } = findSurroundingKeyframes(item.animation.keyframes, relativeFrame)
  
  // 5. 根据情况计算属性值
  let animatedProps: Partial<KeyframePropertiesMap[MediaType]>
  
  if (before && after) {
    // 情况1：在两个关键帧之间 - 进行插值
    animatedProps = interpolateProperties(before, after, relativeFrame)
  } else if (before && !after) {
    // 情况2：在最后一个关键帧之后 - 使用最后关键帧的值
    animatedProps = before.properties
  } else if (!before && after) {
    // 情况3：在第一个关键帧之前 - 使用第一个关键帧的值
    animatedProps = after.properties
  } else {
    // 情况4：没有关键帧（理论上不会发生）
    return
  }
  
  // 6. 应用计算出的属性值到 item.config
  Object.assign(item.config, animatedProps)
}

/**
 * 批量应用动画到多个 TimelineItem
 * @param items 时间轴项目数组
 * @param currentAbsoluteFrame 当前绝对帧位置
 */
export function applyAnimationsToItems(
  items: UnifiedTimelineItemData<MediaType>[],
  currentAbsoluteFrame: number
): void {
  for (const item of items) {
    applyAnimationToConfig(item, currentAbsoluteFrame)
  }
}