/**
 * 动画系统类型定义
 * 包含关键帧和动画相关的所有类型定义
 */

import type { MediaType } from '@/core/mediaitem'

// ==================== 动画系统类型定义 ====================

/**
 * 基础可动画属性（所有媒体类型共享）
 */
export interface BaseAnimatableProps {
  zIndex: number
}

/**
 * 视觉可动画属性（video 和 image 共享）
 */
export interface VisualAnimatableProps extends BaseAnimatableProps {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}

/**
 * 音频可动画属性（video 和 audio 共享）
 */
export interface AudioAnimatableProps extends BaseAnimatableProps {
  volume: number
  // 注意：isMuted 通常不需要动画，但可以考虑添加
}

/**
 * 根据媒体类型的关键帧属性映射
 */
export type KeyframePropertiesMap = {
  video: VisualAnimatableProps & AudioAnimatableProps
  image: VisualAnimatableProps
  audio: AudioAnimatableProps
  text: VisualAnimatableProps
}

/**
 * 泛型关键帧属性工具类型
 */
export type GetKeyframeProperties<T extends MediaType> = KeyframePropertiesMap[T]

/**
 * 关键帧属性集合（向后兼容）
 * 统一关键帧系统中每个关键帧包含的所有可动画属性
 */
export interface KeyframeProperties extends VisualAnimatableProps {
  // 保持向后兼容，使用视觉属性作为默认
}

/**
 * 重构后的关键帧接口（类型安全）
 */
export interface Keyframe<T extends MediaType = MediaType> {
  /** 关键帧位置（相对于clip开始的帧数） */
  framePosition: number
  /** 包含所有可动画属性的完整状态 */
  properties: GetKeyframeProperties<T>
}

/**
 * 重构后的动画配置（类型安全）
 */
export interface AnimationConfig<T extends MediaType = MediaType> {
  /** 关键帧数组 */
  keyframes: Keyframe<T>[]
}

/**
 * 关键帧按钮状态
 */
export type KeyframeButtonState = 'none' | 'on-keyframe' | 'between-keyframes'

/**
 * 关键帧UI状态
 */
export interface KeyframeUIState {
  /** 是否有动画 */
  hasAnimation: boolean
  /** 当前帧是否在关键帧位置 */
  isOnKeyframe: boolean
}

/**
 * WebAV动画配置格式
 * 用于转换给WebAV的setAnimation接口
 */
export interface WebAVAnimationConfig {
  /** 关键帧配置 { '0%': { x: 100, y: 100 }, '50%': { x: 200, y: 200 } } */
  keyframes: Record<string, Record<string, number>>
  /** 动画选项 */
  options: {
    /** 动画时长（微秒） */
    duration: number
    /** 迭代次数 */
    iterCount: number
  }
}
