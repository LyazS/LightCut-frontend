/**
 * 统一关键帧工具函数
 * 实现统一关键帧系统的核心逻辑，包括关键帧的增删改查、状态判断和交互逻辑
 * 适配新架构版本 - 使用百分比 + 缓存系统
 */

import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { KeyframeButtonState, KeyframeUIState } from '@/core/timelineitem/animationtypes'
import type { AnimateKeyframe } from '@/core/timelineitem/bunnytype'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import {
  hasVisualProperties,
  hasAudioProperties,
  isVideoTimelineItem,
  isImageTimelineItem,
  isTextTimelineItem,
  isAudioTimelineItem,
} from '@/core/timelineitem/queries'
import { projectToWebavCoords } from '@/core/utils/coordinateUtils'
import type { MediaType } from '../mediaitem'
import {
  percentageToFrame,
  frameToPercentage,
  clampPercentage,
  updateAllKeyframesCachedFrames,
} from './keyframePositionUtils'

// ==================== 关键帧位置转换工具函数 ====================

/**
 * 将绝对帧数转换为相对于clip在时间轴上的开始的帧数
 * @param absoluteFrame 绝对帧数（相对于整个项目时间轴）
 * @param timeRange 时间范围
 * @returns 相对于clip在时间轴上的开始的帧数
 */
export function absoluteFrameToRelativeFrame(
  absoluteFrame: number,
  timeRange: UnifiedTimeRange,
): number {
  const tlStartFrame = timeRange.timelineStartTime
  const relativeFrame = absoluteFrame - tlStartFrame

  // 确保相对帧数不小于0
  return Math.max(0, relativeFrame)
}

/**
 * 将相对于clip开始的帧数转换为绝对帧数
 * @param relativeFrame 相对于clip开始的帧数
 * @param timeRange clip的时间范围
 * @returns 绝对帧数（相对于整个项目时间轴）
 */
export function relativeFrameToAbsoluteFrame(
  relativeFrame: number,
  timeRange: UnifiedTimeRange,
): number {
  const clipStartFrame = timeRange.timelineStartTime
  return clipStartFrame + relativeFrame
}

// ==================== 关键帧基础操作 ====================

/**
 * 初始化动画配置
 * 如果TimelineItem没有动画配置，则创建一个空的配置
 */
export function initializeAnimation(item: UnifiedTimelineItemData): void {
  if (!item.animation) {
    // 类型断言为any以绕过readonly限制，这在实际使用中需要谨慎
    item.animation = {
      keyframes: [],
    }
  }
}

/**
 * 创建包含所有属性的关键帧
 * @param item 时间轴项目
 * @param absoluteFrame 绝对帧数（相对于整个项目时间轴）
 * @returns 新创建的关键帧
 */
export function createKeyframe(
  item: UnifiedTimelineItemData,
  absoluteFrame: number,
): AnimateKeyframe<MediaType> {
  const relativeFrame = absoluteFrameToRelativeFrame(absoluteFrame, item.timeRange)
  const clipDurationFrames = item.timeRange.timelineEndTime - item.timeRange.timelineStartTime
  
  // 计算百分比位置
  const position = clampPercentage(frameToPercentage(relativeFrame, clipDurationFrames))

  if (isVideoTimelineItem(item)) {
    const config = item.config
    const keyframe = {
      position,
      cachedFrame: relativeFrame,  // ✅ 创建时同步缓存
      properties: {
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        rotation: config.rotation,
        opacity: config.opacity,
        volume: config.volume ?? 1,
      },
    } as AnimateKeyframe<'video'>
    
    return keyframe
  } else if (isImageTimelineItem(item) || isTextTimelineItem(item)) {
    const config = item.config
    return {
      position,
      cachedFrame: relativeFrame,  // ✅ 创建时同步缓存
      properties: {
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        rotation: config.rotation,
        opacity: config.opacity,
      },
    } as AnimateKeyframe<'image' | 'text'>
  } else if (isAudioTimelineItem(item)) {
    const config = item.config
    return {
      position,
      cachedFrame: relativeFrame,  // ✅ 创建时同步缓存
      properties: {
        volume: config.volume ?? 1,
      },
    } as AnimateKeyframe<'audio'>
  }

  throw new Error(`Unsupported media type: ${item.mediaType}`)
}

/**
 * 检查是否有动画
 */
export function hasAnimation(item: UnifiedTimelineItemData): boolean {
  return !!(item.animation && item.animation.keyframes.length > 0)
}

/**
 * 检查当前帧是否在关键帧位置
 * ✅ 直接使用 cachedFrame，无需重新计算
 */
export function isCurrentFrameOnKeyframe(
  item: UnifiedTimelineItemData,
  absoluteFrame: number,
): boolean {
  if (!item.animation) return false

  const relativeFrame = absoluteFrameToRelativeFrame(absoluteFrame, item.timeRange)

  // ✅ 直接使用缓存的帧位置进行比较
  return item.animation.keyframes.some((kf) => kf.cachedFrame === relativeFrame)
}

/**
 * 获取关键帧按钮状态
 */
export function getKeyframeButtonState(
  item: UnifiedTimelineItemData,
  currentFrame: number,
): KeyframeButtonState {
  if (!hasAnimation(item)) {
    return 'none' // 黑色
  }

  if (isCurrentFrameOnKeyframe(item, currentFrame)) {
    return 'on-keyframe' // 蓝色
  }

  return 'between-keyframes' // 金色
}

/**
 * 获取关键帧UI状态
 */
export function getKeyframeUIState(
  item: UnifiedTimelineItemData,
  currentFrame: number,
): KeyframeUIState {
  return {
    hasAnimation: hasAnimation(item),
    isOnKeyframe: isCurrentFrameOnKeyframe(item, currentFrame),
  }
}

// ==================== 关键帧操作 ====================

/**
 * 在指定帧位置查找关键帧
 * ✅ 直接使用 cachedFrame，无需重新计算
 */
function findKeyframeAtFrame(
  item: UnifiedTimelineItemData,
  absoluteFrame: number,
): AnimateKeyframe<MediaType> | undefined {
  if (!item.animation) return undefined

  const relativeFrame = absoluteFrameToRelativeFrame(absoluteFrame, item.timeRange)

  // ✅ 直接使用缓存的帧位置进行比较
  return item.animation.keyframes.find((kf) => kf.cachedFrame === relativeFrame)
}

/**
 * 启用动画
 */
export function enableAnimation(item: UnifiedTimelineItemData): void {
  initializeAnimation(item)
  // 启用动画只需要确保 animation 字段存在即可
}

/**
 * 禁用动画
 */
export function disableAnimation(item: UnifiedTimelineItemData): void {
  item.animation = undefined
}

/**
 * 删除指定帧位置的关键帧
 * ✅ 直接使用 cachedFrame 比较
 */
export function removeKeyframeAtFrame(
  item: UnifiedTimelineItemData,
  absoluteFrame: number,
): boolean {
  if (!item.animation) return false
  
  const relativeFrame = absoluteFrameToRelativeFrame(absoluteFrame, item.timeRange)
  const initialLength = item.animation.keyframes.length

  // ✅ 直接使用缓存的帧位置进行过滤
  ;(item.animation as any).keyframes = item.animation.keyframes.filter(
    (kf) => kf.cachedFrame !== relativeFrame,
  )

  const removed = item.animation.keyframes.length < initialLength
  if (removed) {
    console.log('🎬 [Unified Keyframe] Removed keyframe at frame:', absoluteFrame)
  }

  return removed
}

// ==================== 关键帧时长变化处理 ====================

/**
 * 当 clip 时长变化时处理关键帧
 * ✅ 只需更新缓存，百分比保持不变
 * @param item 时间轴项目
 * @param oldDurationFrames 原始时长（帧数）
 * @param newDurationFrames 新时长（帧数）
 */
export function adjustKeyframesForDurationChange(
  item: UnifiedTimelineItemData,
  oldDurationFrames: number,
  newDurationFrames: number,
): void {
  if (!item.animation || item.animation.keyframes.length === 0) return

  console.log('🎬 [Keyframe] Adjusting keyframes for duration change:', {
    itemId: item.id,
    oldDuration: oldDurationFrames,
    newDuration: newDurationFrames,
    keyframeCount: item.animation.keyframes.length,
  })

  // ✅ 核心优势：百分比不变，只需更新缓存
  updateAllKeyframesCachedFrames(item.animation.keyframes, newDurationFrames)

  // 移除超出范围的关键帧（position > 1.0）
  const validKeyframes = item.animation.keyframes.filter((kf) => kf.position <= 1.0)

  if (validKeyframes.length < item.animation.keyframes.length) {
    const removedCount = item.animation.keyframes.length - validKeyframes.length
    ;(item.animation as any).keyframes = validKeyframes
    console.log('🎬 [Keyframe] Removed keyframes beyond clip end:', removedCount)
  }

  // 确保关键帧顺序正确（防御性编程）
  sortKeyframes(item)

  console.log('🎬 [Keyframe] Duration changed, cached frames updated')
}

/**
 * 按百分比位置排序关键帧
 */
export function sortKeyframes(item: UnifiedTimelineItemData): void {
  if (!item.animation) return
  ;(item.animation as any).keyframes.sort(
    (a: AnimateKeyframe<MediaType>, b: AnimateKeyframe<MediaType>) =>
      a.position - b.position,  // ✅ 直接比较百分比
  )
}

// ==================== 统一关键帧交互逻辑 ====================

/**
 * 处理关键帧按钮点击 - 状态1：黑色（无动画）→ 蓝色
 */
function handleClick_NoAnimation(item: UnifiedTimelineItemData, currentFrame: number): void {
  // 1. 启用动画
  enableAnimation(item)

  // 2. 在当前帧创建包含所有属性的关键帧
  const keyframe = createKeyframe(item, currentFrame)
  ;(item.animation as any)!.keyframes.push(keyframe)

  console.log('🎬 [Unified Keyframe] Created initial keyframe:', {
    itemId: item.id,
    frame: currentFrame,
    keyframe,
  })
}

/**
 * 处理关键帧按钮点击 - 状态2：蓝色（在关键帧）→ 金色或黑色
 */
function handleClick_OnKeyframe(item: UnifiedTimelineItemData, currentFrame: number): void {
  // 1. 删除当前帧的关键帧
  removeKeyframeAtFrame(item, currentFrame)

  // 2. 检查是否还有其他关键帧
  if (item.animation!.keyframes.length > 0) {
    // 还有其他关键帧：蓝色 → 金色
    console.log('🎬 [Unified Keyframe] Removed keyframe, animation continues:', {
      itemId: item.id,
      frame: currentFrame,
      remainingKeyframes: item.animation!.keyframes.length,
    })
  } else {
    // 没有其他关键帧：蓝色 → 黑色
    disableAnimation(item)
    console.log('🎬 [Unified Keyframe] Removed last keyframe, disabled animation:', {
      itemId: item.id,
      frame: currentFrame,
    })
  }
}

/**
 * 处理关键帧按钮点击 - 状态3：金色（不在关键帧）→ 蓝色
 */
function handleClick_BetweenKeyframes(item: UnifiedTimelineItemData, currentFrame: number): void {
  // 1. 在当前帧创建包含所有属性的关键帧
  const keyframe = createKeyframe(item, currentFrame)
  ;(item.animation as any)!.keyframes.push(keyframe)

  console.log('🎬 [Unified Keyframe] Created new keyframe:', {
    itemId: item.id,
    frame: currentFrame,
    keyframe,
  })
}

/**
 * 统一关键帧切换逻辑
 * 根据当前状态执行相应的操作
 */
export function toggleKeyframe(item: UnifiedTimelineItemData, currentFrame: number): void {
  if (!item) {
    console.error('🎬 [Unified Keyframe] Invalid timeline item')
    return
  }

  const buttonState = getKeyframeButtonState(item, currentFrame)

  switch (buttonState) {
    case 'none':
      handleClick_NoAnimation(item, currentFrame)
      break
    case 'on-keyframe':
      handleClick_OnKeyframe(item, currentFrame)
      break
    case 'between-keyframes':
      handleClick_BetweenKeyframes(item, currentFrame)
      break
  }

  // 统一在操作后排序关键帧，确保顺序正确
  if (item.animation && item.animation.keyframes.length > 0) {
    sortKeyframes(item)
  }
}

// ==================== 属性修改处理 ====================

/**
 * 通过WebAV更新属性值（遵循正确的数据流向）
 * 直接设置进 item.config 的对应位置
 */
async function updateProperty(
  item: UnifiedTimelineItemData,
  property: string,
  value: any,
): Promise<void> {
  try {
    // 验证 property 是否在 config 中存在
    const config = item.config as Record<string, any>
    if (!(property in config)) {
      console.warn('🎬 [Unified Keyframe] Property not found in item.config:', {
        itemId: item.id,
        mediaType: item.mediaType,
        property,
        availableProperties: Object.keys(config),
      })
      return
    }

    // 直接更新 item.config 的对应属性
    config[property] = value

    console.log('🎬 [Unified Keyframe] Updated property in item.config:', {
      itemId: item.id,
      property,
      value,
    })
  } catch (error) {
    console.error('🎬 [Unified Keyframe] Failed to update property:', error)
  }
}

/**
 * 处理属性修改 - 状态1：黑色（无动画）
 */
async function handlePropertyChange_NoAnimation(
  item: UnifiedTimelineItemData,
  property: string,
  value: any,
): Promise<void> {
  // 通过WebAV更新属性值，propsChange事件会自动同步到TimelineItem
  await updateProperty(item, property, value)

  console.log('🎬 [Unified Keyframe] Property updated without animation via WebAV:', {
    itemId: item.id,
    property,
    value,
  })
}

/**
 * 处理属性修改 - 状态2：蓝色（在关键帧）
 */
async function handlePropertyChange_OnKeyframe(
  item: UnifiedTimelineItemData,
  currentFrame: number,
  property: string,
  value: any,
): Promise<void> {
  // 🎯 关键修复：先更新关键帧数据，再触发WebAV更新
  // 这样可以避免WebAV动画系统用旧的关键帧数据覆盖新设置的值

  // 1. 先找到当前帧的关键帧并更新关键帧数据
  const keyframe = findKeyframeAtFrame(item, currentFrame)
  if (keyframe) {
    // 类型安全的关键帧属性更新
    if (property in keyframe.properties) {
      ;(keyframe.properties as any)[property] = value
      console.log('🎯 [Keyframe Fix] Updated keyframe data first:', {
        itemId: item.id,
        currentFrame,
        property,
        value,
        keyframePosition: keyframe.cachedFrame,
      })
    } else {
      console.warn('🎬 [Unified Keyframe] Property not found in keyframe:', property)
    }
  }

  // 2. 立即更新当前属性值到sprite（确保立即生效）
  await updateProperty(item, property, value)

  console.log('🎬 [Unified Keyframe] Updated keyframe property:', {
    itemId: item.id,
    frame: currentFrame,
    property,
    value,
  })
}

/**
 * 处理属性修改 - 状态3：金色（不在关键帧）
 */
async function handlePropertyChange_BetweenKeyframes(
  item: UnifiedTimelineItemData,
  currentFrame: number,
  property: string,
  value: any,
): Promise<void> {
  // 🎯 关键修复：先创建关键帧，再更新WebAV动画

  // 1. 在当前帧创建新关键帧（包含所有属性的当前值，但使用新的属性值）
  const keyframe = createKeyframe(item, currentFrame)
  // 确保新关键帧包含更新后的属性值
  if (property in keyframe.properties) {
    // 使用类型安全的属性设置
    const properties = keyframe.properties as Record<string, any>
    properties[property] = value
  } else {
    console.warn('🎬 [Unified Keyframe] Property not found in new keyframe:', property)
  }
  ;(item.animation as any)!.keyframes.push(keyframe)

  console.log('🎯 [Keyframe Fix] Created new keyframe with updated property:', {
    itemId: item.id,
    currentFrame,
    property,
    value,
    keyframePosition: keyframe.cachedFrame,
  })

  // 2. 立即更新当前属性值到sprite（确保立即生效）
  await updateProperty(item, property, value)

  console.log('🎬 [Unified Keyframe] Created keyframe for property change:', {
    itemId: item.id,
    frame: currentFrame,
    property,
    value,
  })
}

/**
 * 统一属性修改处理（遵循正确的数据流向）
 * @returns 返回处理状态，用于日志记录
 */
export async function handlePropertyChange(
  item: UnifiedTimelineItemData,
  currentFrame: number,
  property: string,
  value: any,
): Promise<'no-animation' | 'updated-keyframe' | 'created-keyframe'> {
  if (!item) {
    console.error('🎬 [Unified Keyframe] Invalid timeline item')
    throw new Error('Invalid timeline item')
  }

  const buttonState = getKeyframeButtonState(item, currentFrame)

  let result: 'no-animation' | 'updated-keyframe' | 'created-keyframe'

  switch (buttonState) {
    case 'none':
      await handlePropertyChange_NoAnimation(item, property, value)
      result = 'no-animation'
      break
    case 'on-keyframe':
      await handlePropertyChange_OnKeyframe(item, currentFrame, property, value)
      result = 'updated-keyframe'
      break
    case 'between-keyframes':
      await handlePropertyChange_BetweenKeyframes(item, currentFrame, property, value)
      result = 'created-keyframe'
      break
  }

  // 统一在操作后排序关键帧，确保顺序正确
  if (item.animation && item.animation.keyframes.length > 0) {
    sortKeyframes(item)
  }

  return result
}

// ==================== 关键帧导航 ====================

/**
 * 获取上一个关键帧的帧数
 * ✅ 直接使用 cachedFrame 比较和排序
 */
export function getPreviousKeyframeFrame(
  item: UnifiedTimelineItemData,
  currentFrame: number,
): number | null {
  if (!item.animation || item.animation.keyframes.length === 0) return null

  const relativeFrame = absoluteFrameToRelativeFrame(currentFrame, item.timeRange)

  // ✅ 直接使用缓存的帧位置进行比较
  const previousKeyframes = item.animation.keyframes
    .filter((kf) => kf.cachedFrame < relativeFrame)
    .sort((a, b) => b.cachedFrame - a.cachedFrame)  // 降序

  if (previousKeyframes.length === 0) return null

  // 返回最近的上一个关键帧的绝对帧数
  return relativeFrameToAbsoluteFrame(previousKeyframes[0].cachedFrame, item.timeRange)
}

/**
 * 获取下一个关键帧的帧数
 * ✅ 直接使用 cachedFrame 比较和排序
 */
export function getNextKeyframeFrame(
  item: UnifiedTimelineItemData,
  currentFrame: number,
): number | null {
  if (!item.animation || item.animation.keyframes.length === 0) return null

  const relativeFrame = absoluteFrameToRelativeFrame(currentFrame, item.timeRange)

  // ✅ 直接使用缓存的帧位置进行比较
  const nextKeyframes = item.animation.keyframes
    .filter((kf) => kf.cachedFrame > relativeFrame)
    .sort((a, b) => a.cachedFrame - b.cachedFrame)  // 升序

  if (nextKeyframes.length === 0) return null

  // 返回最近的下一个关键帧的绝对帧数
  return relativeFrameToAbsoluteFrame(nextKeyframes[0].cachedFrame, item.timeRange)
}

// ==================== 清理和重置 ====================

/**
 * 清除所有关键帧
 */
export function clearAllKeyframes(item: UnifiedTimelineItemData): void {
  if (!item.animation) return
  ;(item.animation as any).keyframes = []

  console.log('🎬 [Unified Keyframe] Cleared all keyframes:', {
    itemId: item.id,
  })
}

/**
 * 获取关键帧总数
 */
export function getKeyframeCount(item: UnifiedTimelineItemData): number {
  return item.animation?.keyframes.length || 0
}

/**
 * 获取所有关键帧的帧数列表（按时间顺序）
 * ✅ 直接使用 cachedFrame
 */
export function getAllKeyframeFrames(item: UnifiedTimelineItemData): number[] {
  if (!item.animation) return []

  return item.animation.keyframes
    .map((kf) => relativeFrameToAbsoluteFrame(kf.cachedFrame, item.timeRange))
    .sort((a, b) => a - b)
}

// ==================== 调试和验证 ====================

/**
 * 验证关键帧数据的完整性
 */
export function validateKeyframes(item: UnifiedTimelineItemData): boolean {
  if (!item.animation) return true

  const clipDurationFrames = item.timeRange.timelineEndTime - item.timeRange.timelineStartTime

  for (const keyframe of item.animation.keyframes) {
    // 检查位置是否在有效范围内（0-1）
    if (keyframe.position < 0 || keyframe.position > 1) {
      console.warn('🎬 [Keyframe] Invalid keyframe position:', {
        position: keyframe.position,
        expected: '0-1 range'
      })
      return false
    }

    // ✅ 验证缓存是否正确
    const expectedCachedFrame = percentageToFrame(keyframe.position, clipDurationFrames)
    if (keyframe.cachedFrame !== expectedCachedFrame) {
      console.warn('🎬 [Keyframe] Cached frame mismatch:', {
        position: keyframe.position,
        cachedFrame: keyframe.cachedFrame,
        expectedCachedFrame,
      })
      return false
    }

    // 检查属性是否完整（根据媒体类型验证不同的属性）
    const props = keyframe.properties

    if (hasVisualProperties(item)) {
      // 视觉媒体类型（video/image/text）验证属性值的有效性
      const visualProps = props as any
      if (
        typeof visualProps.x !== 'number' ||
        typeof visualProps.y !== 'number' ||
        typeof visualProps.width !== 'number' ||
        typeof visualProps.height !== 'number' ||
        typeof visualProps.rotation !== 'number' ||
        typeof visualProps.opacity !== 'number'
      ) {
        console.warn('🎬 [Keyframe] Invalid visual keyframe property types:', props)
        return false
      }

      // 视频类型还需要验证音频属性值
      if (isVideoTimelineItem(item)) {
        const videoProps = props as any
        if (typeof videoProps.volume !== 'number') {
          console.warn('🎬 [Keyframe] Invalid video audio property type:', props)
          return false
        }
      }
    } else if (hasAudioProperties(item)) {
      // 音频类型验证音频属性值
      const audioProps = props as any
      if (typeof audioProps.volume !== 'number') {
        console.warn('🎬 [Keyframe] Invalid audio keyframe property type:', props)
        return false
      }
    }
  }

  return true
}

/**
 * 输出关键帧调试信息
 */
export function debugKeyframes(item: UnifiedTimelineItemData): void {
  console.group('🎬 [Unified Keyframe Debug]')

  console.log('Item:', {
    id: item.id,
    hasAnimation: hasAnimation(item),
    keyframeCount: getKeyframeCount(item),
  })

  if (item.animation) {
    console.log('Animation Config:', {
      keyframes: item.animation.keyframes,
    })

    console.log('Keyframe Frames:', getAllKeyframeFrames(item))
    console.log('Validation:', validateKeyframes(item))
  }

  console.groupEnd()
}
