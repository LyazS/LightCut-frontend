/**
 * 动画转换器
 * 负责帧数与WebAV百分比格式的转换，生成WebAV兼容的动画配置
 * 适配新架构版本
 */

import type {
  AnimationConfig,
  WebAVAnimationConfig,
  Keyframe,
} from '@/core/timelineitem/animationtypes'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import { framesToMicroseconds } from '@/core/utils/timeUtils'
import { projectToWebavCoords } from '@/core/utils/coordinateUtils'

// ==================== 转换核心函数 ====================

/**
 * 将帧数转换为相对于clip时长的百分比
 * @param frame 绝对帧数（相对于整个项目时间轴）
 * @param clipStartFrame clip在时间轴上的开始帧数
 * @param clipDurationFrames clip的总时长（帧数）
 * @returns 百分比字符串，如 "25%"
 */
export function framesToPercentage(
  frame: number,
  clipStartFrame: number,
  clipDurationFrames: number,
): string {
  // 计算相对于clip开始的帧数
  const relativeFrame = frame - clipStartFrame

  // 计算百分比
  const percentage = (relativeFrame / clipDurationFrames) * 100

  // 确保百分比在0-100范围内
  const clampedPercentage = Math.max(0, Math.min(100, percentage))

  return `${clampedPercentage}%`
}

/**
 * 将关键帧转换为WebAV格式
 * @param keyframe 关键帧数据
 * @param canvasWidth 画布宽度（用于坐标转换）
 * @param canvasHeight 画布高度（用于坐标转换）
 * @returns WebAV属性对象
 */
export function convertKeyframeToWebAV(
  keyframe: Keyframe,
  canvasWidth?: number,
  canvasHeight?: number,
): Record<string, number> {
  const webavProps: Record<string, number> = {}

  // 所有属性都在properties中扁平化存储
  const props = keyframe.properties

  // 检查是否有视觉属性
  if ('x' in props && 'y' in props && 'width' in props && 'height' in props) {
    // 转换位置和尺寸（需要坐标系转换）
    if (canvasWidth && canvasHeight) {
      const webavCoords = projectToWebavCoords(
        props.x as number,
        props.y as number,
        props.width as number,
        props.height as number,
        canvasWidth,
        canvasHeight,
      )
      webavProps.x = webavCoords.x
      webavProps.y = webavCoords.y
    } else {
      // 如果没有提供画布信息，直接使用原值（向后兼容）
      console.warn('🎬 [Animation Converter] Missing canvas dimensions for coordinate conversion')
      webavProps.x = props.x as number
      webavProps.y = props.y as number
    }

    // 转换尺寸
    webavProps.w = props.width as number
    webavProps.h = props.height as number

    // 转换旋转属性
    if ('rotation' in props) {
      webavProps.angle = props.rotation as number
    }

    // 转换透明度属性
    if ('opacity' in props) {
      webavProps.opacity = props.opacity as number
    }
  }

  // 处理音频属性（如果存在）
  if ('volume' in props) {
    webavProps.volume = props.volume as number
  }

  return webavProps
}

/**
 * 将动画配置转换为WebAV格式
 * @param animationConfig 动画配置
 * @param timeRange 时间范围信息
 * @returns WebAV动画配置
 */
export function convertToWebAVAnimation(
  animationConfig: AnimationConfig,
  timeRange: UnifiedTimeRange,
  canvasWidth?: number,
  canvasHeight?: number,
): WebAVAnimationConfig {
  // 验证输入参数
  if (!animationConfig || !timeRange) {
    throw new Error('Invalid animation config or time range')
  }

  if (!Array.isArray(animationConfig.keyframes)) {
    throw new Error('Invalid keyframes array')
  }

  const webavKeyframes: Record<string, Record<string, number>> = {}

  // 获取clip时长用于计算动画总时长
  const clipDurationFrames = timeRange.timelineEndTime - timeRange.timelineStartTime

  // 验证时长
  if (clipDurationFrames <= 0) {
    console.warn('🎬 [Animation Converter] Invalid clip duration:', clipDurationFrames)
    return {
      keyframes: {},
      options: { duration: 0, iterCount: 1 },
    }
  }

  // 确保关键帧按时间顺序排序后再转换
  const sortedKeyframes = [...animationConfig.keyframes].sort(
    (a, b) => a.framePosition - b.framePosition,
  )

  // 转换每个关键帧
  sortedKeyframes.forEach((keyframe) => {
    try {
      // 验证关键帧
      if (typeof keyframe.framePosition !== 'number' || keyframe.framePosition < 0) {
        console.warn(
          '🎬 [Animation Converter] Invalid keyframe framePosition:',
          keyframe.framePosition,
        )
        return
      }

      // 将帧位置转换为百分比
      const percentage = (keyframe.framePosition / clipDurationFrames) * 100

      // 确保百分比在有效范围内
      if (percentage < 0 || percentage > 100) {
        console.warn('🎬 [Animation Converter] Keyframe percentage out of range:', percentage)
        return
      }

      const percentageKey = `${percentage.toFixed(6)}%`

      // 转换属性（传递画布尺寸信息，精灵尺寸从关键帧中获取）
      const webavProps = convertKeyframeToWebAV(keyframe, canvasWidth, canvasHeight)

      // 只有当有属性时才添加关键帧
      if (Object.keys(webavProps).length > 0) {
        webavKeyframes[percentageKey] = webavProps
      }
    } catch (error) {
      console.error('🎬 [Animation Converter] Error converting keyframe:', error)
    }
  })

  // 计算动画时长（微秒）
  const durationMicroseconds = framesToMicroseconds(clipDurationFrames)

  return {
    keyframes: webavKeyframes,
    options: {
      duration: Math.max(0, durationMicroseconds), // 确保时长不为负数
      iterCount: 1, // 默认播放一次
    },
  }
}

// ==================== 验证和工具函数 ====================

/**
 * 验证动画配置是否有效
 * @param animationConfig 动画配置
 * @returns 是否有效
 */
export function isValidAnimationConfig(animationConfig: AnimationConfig): boolean {
  // 检查基本结构
  if (!animationConfig || !Array.isArray(animationConfig.keyframes)) {
    return false
  }

  // 检查是否有关键帧
  if (animationConfig.keyframes.length === 0) {
    return false
  }

  // 检查关键帧是否有效
  return animationConfig.keyframes.every((keyframe) => {
    // 检查帧位置是否有效（新的framePosition属性）
    if (typeof keyframe.framePosition !== 'number' || keyframe.framePosition < 0) {
      return false
    }

    // 检查是否有属性（所有属性都必须存在）
    if (!keyframe.properties) {
      return false
    }

    const props = keyframe.properties

    // 验证视觉属性（如果存在）
    if ('x' in props && 'y' in props && 'width' in props && 'height' in props) {
      if (
        typeof props.x !== 'number' ||
        typeof props.y !== 'number' ||
        typeof props.width !== 'number' ||
        typeof props.height !== 'number'
      ) {
        return false
      }

      // 验证属性值在合理范围内
      if ((props.width as number) <= 0 || (props.height as number) <= 0) {
        return false
      }

      // 验证旋转属性（如果存在）
      if ('rotation' in props && typeof props.rotation !== 'number') {
        return false
      }

      // 验证透明度属性（如果存在）
      if ('opacity' in props) {
        if (
          typeof props.opacity !== 'number' ||
          (props.opacity as number) < 0 ||
          (props.opacity as number) > 1
        ) {
          return false
        }
      }
    }

    // 验证音频属性（如果存在）
    if ('volume' in props && typeof props.volume !== 'number') {
      return false
    }

    return true
  })
}

/**
 * 检查关键帧是否在时间范围内
 * @param keyframe 关键帧
 * @param clipDurationFrames clip的时长（帧数）
 * @returns 是否在范围内
 */
export function isKeyframeInRange(keyframe: Keyframe, clipDurationFrames: number): boolean {
  // 帧位置应该在0到clip时长之间
  return keyframe.framePosition >= 0 && keyframe.framePosition <= clipDurationFrames
}

/**
 * 过滤时间范围内的关键帧
 * @param animationConfig 动画配置
 * @param clipDurationFrames clip的时长（帧数）
 * @returns 过滤后的动画配置
 */
export function filterKeyframesInRange(
  animationConfig: AnimationConfig,
  clipDurationFrames: number,
): AnimationConfig {
  const filteredKeyframes = animationConfig.keyframes.filter((keyframe) =>
    isKeyframeInRange(keyframe, clipDurationFrames),
  )

  return {
    ...animationConfig,
    keyframes: filteredKeyframes,
  }
}
