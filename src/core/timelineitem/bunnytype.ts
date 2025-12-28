import type { MediaType } from '@/core/mediaitem'
import type { TextStyleConfig } from './texttype'

export interface VisualProps {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  /** 等比缩放状态（每个clip独立） */
  proportionalScale: boolean
}

export interface AudioProps {
  volume: number
  isMuted: boolean
}

export interface TextProps {
  text: string
  style: TextStyleConfig
}

export interface VisualAnimatableProps {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}

export interface AudioAnimatableProps {
  volume: number
}

export type KeyframePropertiesMap = {
  video: VisualAnimatableProps & AudioAnimatableProps
  image: VisualAnimatableProps
  audio: AudioAnimatableProps
  text: VisualAnimatableProps
}

export interface AnimateKeyframe<T extends MediaType> {
  /** 关键帧位置（相对于clip开始的帧数） */
  framePosition: number
  /** 包含所有可动画属性的完整状态 */
  properties: KeyframePropertiesMap[T]
}

export interface AnimationProps<T extends MediaType> {
  /** 关键帧数组 */
  keyframes: AnimateKeyframe<T>[]
}

type GetConfigMap = {
  video: VisualProps & AudioProps
  image: VisualProps
  audio: AudioProps
  text: VisualProps & TextProps
}
type GetAnimationMap = {
  video: AnimationProps<'video'>
  image: AnimationProps<'image'>
  audio: AnimationProps<'audio'>
  text: AnimationProps<'text'>
}

export type GetConfigs<T extends MediaType> = GetConfigMap[T]
export type GetAnimation<T extends MediaType> = GetAnimationMap[T]

// 导出具体的配置类型供其他模块使用
export type VideoMediaConfig = GetConfigs<'video'>
export type ImageMediaConfig = GetConfigs<'image'>
export type AudioMediaConfig = GetConfigs<'audio'>
export type TextMediaConfig = GetConfigs<'text'>
