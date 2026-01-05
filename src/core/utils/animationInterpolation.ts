/**
 * 动画插值工具函数
 * 负责根据关键帧数据计算当前帧的属性值
 * 使用百分比进行插值计算，提供更高精度
 */

import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { AnimateKeyframe, KeyframePropertiesMap } from '@/core/timelineitem/bunnytype'
import type { MediaType } from '@/core/mediaitem'
import { absoluteFrameToRelativeFrame } from './unifiedKeyframeUtils'
import { frameToPercentage } from './keyframePositionUtils'

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
 * ✅ 使用百分比比较，更精确
 * @param keyframes 关键帧数组
 * @param relativeFrame 相对帧位置
 * @param clipDurationFrames clip 时长（帧数）
 * @returns 前后关键帧对象
 */
function findSurroundingKeyframes<T extends MediaType>(
  keyframes: AnimateKeyframe<T>[],
  relativeFrame: number,
  clipDurationFrames: number
): {
  before: AnimateKeyframe<T> | null
  after: AnimateKeyframe<T> | null
} {
  // 关键帧已按 position 排序
  // ✅ 计算当前帧的百分比位置
  const currentPercentage = frameToPercentage(relativeFrame, clipDurationFrames)
  
  let before: AnimateKeyframe<T> | null = null
  let after: AnimateKeyframe<T> | null = null
  
  for (const kf of keyframes) {
    // ✅ 使用百分比进行比较，更精确
    if (kf.position <= currentPercentage) {
      before = kf
    } else if (kf.position > currentPercentage && !after) {
      after = kf
      break
    }
  }
  
  return { before, after }
}

/**
 * 计算插值属性值
 * ✅ 使用百分比计算插值因子，更精确
 * @param before 前一个关键帧
 * @param after 后一个关键帧
 * @param relativeFrame 当前相对帧位置
 * @param clipDurationFrames clip 时长（帧数）
 * @returns 插值后的属性值
 */
function interpolateProperties<T extends MediaType>(
  before: AnimateKeyframe<T>,
  after: AnimateKeyframe<T>,
  relativeFrame: number,
  clipDurationFrames: number
): Partial<KeyframePropertiesMap[T]> {
  // ✅ 核心改进：使用百分比计算插值因子，避免帧位置的舍入误差
  const currentPercentage = frameToPercentage(relativeFrame, clipDurationFrames)
  const t = (currentPercentage - before.position) / (after.position - before.position)
  
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
  // 1. 懒加载：首次使用时初始化 renderConfig
  if (!item.runtime.renderConfig) {
    item.runtime.renderConfig = { ...item.config }
  }
  
  // 2. 检查是否有动画
  if (!item.animation || item.animation.keyframes.length === 0) {
    // 没有动画时，确保 renderConfig 与 config 同步
    Object.assign(item.runtime.renderConfig, item.config)
    return
  }
  
  // 3. 检查是否在时间范围内
  const isInTimeRange =
    currentAbsoluteFrame >= item.timeRange.timelineStartTime &&
    currentAbsoluteFrame <= item.timeRange.timelineEndTime
  if (!isInTimeRange) {
    // 不在范围内，使用原始 config
    Object.assign(item.runtime.renderConfig, item.config)
    return
  }
  
  // 4. 计算相对帧位置和 clip 时长
  const relativeFrame = absoluteFrameToRelativeFrame(currentAbsoluteFrame, item.timeRange)
  const clipDurationFrames = item.timeRange.timelineEndTime - item.timeRange.timelineStartTime
  
  // 5. 查找前后关键帧（✅ 传递 clipDurationFrames 用于百分比计算）
  const { before, after } = findSurroundingKeyframes(
    item.animation.keyframes,
    relativeFrame,
    clipDurationFrames
  )
  
  // 6. 根据情况计算属性值
  let animatedProps: Partial<KeyframePropertiesMap[MediaType]>
  
  if (before && after) {
    // 情况1：在两个关键帧之间 - 进行插值
    animatedProps = interpolateProperties(before, after, relativeFrame, clipDurationFrames)
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
  
  // 7. ✅ 应用到 runtime.renderConfig（不触发自动保存）
  Object.assign(item.runtime.renderConfig, item.config, animatedProps)
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