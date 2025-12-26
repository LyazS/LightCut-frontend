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
  zIndex: number
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
  video: {
    config: VisualProps & AudioProps
    animation?: AnimationProps<'video'>
  }
  image: {
    config: VisualProps
    animation?: AnimationProps<'image'>
  }
  audio: {
    config: AudioProps
    animation?: AnimationProps<'audio'>
  }
  text: {
    config: VisualProps & TextProps
    animation?: AnimationProps<'text'>
  }
}

export type GetConfigs<T extends MediaType> = GetConfigMap[T]
