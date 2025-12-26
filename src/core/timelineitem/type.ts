/**
 * 统一时间轴项目数据类型定义（混合类型系统重构版）
 * 基于"类型安全 + 动态类型支持"的改进方案
 *
 * 设计理念：
 * - 使用泛型确保编译时类型安全
 * - 支持媒体类型动态变化（unknown -> 具体类型）
 * - 保持与旧架构相同的精确性
 * - 通过联合类型和类型守卫处理运行时类型检查
 */

import type { Raw } from 'vue'
import type { MediaType, MediaTypeOrUnknown } from '@/core/mediaitem'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import type { AnimationConfig } from './animationtypes'
import type { BunnyClip } from '@/core/mediabunny/bunny-clip'
import type { TextStyleConfig } from './texttype'
import type { GetConfigs } from './bunnytype'
import { DEFAULT_TEXT_STYLE } from './texttype'

/**
 * 基础媒体属性（所有媒体类型共享）
 */
export interface BaseMediaProps {
  /** 层级控制 */
  zIndex: number
  /** 动画配置（可选） */
  // animation?: AnimationConfig<T>
}

/**
 * 视觉媒体属性（video 和 image 共享）
 */
interface VisualMediaProps extends BaseMediaProps {
  /** 水平位置 */
  x: number
  /** 垂直位置 */
  y: number
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
  /** 旋转角度（弧度） */
  rotation: number
  /** 透明度（0-1） */
  opacity: number
  /** 原始宽度（用于计算缩放系数） */
  originalWidth: number
  /** 原始高度（用于计算缩放系数） */
  originalHeight: number
  /** 等比缩放状态（每个clip独立） */
  proportionalScale: boolean
}

/**
 * 音频媒体属性（video 和 audio 共享）
 */
interface AudioMediaProps {
  /** 音量（0-1） */
  volume: number
  /** 静音状态 */
  isMuted: boolean
}

/**
 * 视频媒体配置：同时具有视觉和音频属性
 */
export interface VideoMediaConfig extends VisualMediaProps, AudioMediaProps {
  // 视频特有属性（预留）
  // playbackRate?: number // 倍速可能在 timeRange 中更合适
}

/**
 * 图片媒体配置：只有视觉属性
 */
export interface ImageMediaConfig extends VisualMediaProps {
  // 图片特有属性（预留）
  // filters?: ImageFilterConfig[]
}

/**
 * 音频媒体配置：只有音频属性
 */
export interface AudioMediaConfig extends BaseMediaProps, AudioMediaProps {
  /** 增益（dB） */
  gain: number
  // 音频特有属性（预留）
  // waveformColor?: string
  // showWaveform?: boolean
}

/**
 * 文本媒体配置：继承视觉媒体属性，添加文本特有属性
 */
export interface TextMediaConfig extends VisualMediaProps {
  /** 文本内容 */
  text: string
  /** 文本样式配置 */
  style: TextStyleConfig
}

/**
 * 媒体配置映射
 */
type MediaConfigMap = {
  video: VideoMediaConfig
  image: ImageMediaConfig
  audio: AudioMediaConfig
  text: TextMediaConfig
}

/**
 * 根据媒体类型获取对应配置的工具类型
 */
export type GetMediaConfig<T extends MediaType> = MediaConfigMap[T]

// 导入我们的自定义 Sprite 类
import type { UnifiedSprite } from '@/core/visiblesprite'

// ==================== 基础类型定义 ====================

/**
 * 时间轴项目状态类型 - 3状态简化版
 */
export type TimelineItemStatus =
  | 'ready' // 完全就绪，可用于时间轴
  | 'loading' // 正在处理中，包含下载、解析、等待
  | 'error' // 不可用状态，包含错误、缺失、取消

/**
 * 状态转换规则定义
 */
export const VALID_TIMELINE_TRANSITIONS: Record<TimelineItemStatus, TimelineItemStatus[]> = {
  loading: ['ready', 'error'],
  ready: ['loading', 'error'],
  error: ['loading'],
} as const

/**
 * 媒体状态到时间轴状态的映射表
 */
export const MEDIA_TO_TIMELINE_STATUS_MAP = {
  pending: 'loading', // 等待开始 → 加载中
  asyncprocessing: 'loading', // 异步处理中 → 加载中
  decoding: 'loading', // WebAV解析中 → 加载中
  ready: 'ready', // 就绪 → 就绪
  error: 'error', // 错误 → 错误
  cancelled: 'error', // 已取消 → 错误
  missing: 'error', // 文件缺失 → 错误
} as const

// ==================== 配置类型映射 ====================

/**
 * 变换数据接口（保持兼容性）
 */
export interface TransformData {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  opacity?: number
  zIndex?: number
  duration?: number // 时长（帧数）- 用于时间轴项目时长调整
  playbackRate?: number
  volume?: number
  isMuted?: boolean
  gain?: number // 音频增益（dB）
}

/**
 * 未知媒体类型的基础配置
 */
export interface UnknownMediaConfig {
  name: string
}

/**
 * 时间轴项目配置映射（包含unknown类型）
 * 区别于媒体项目配置，这是时间轴项目级别的配置
 */
type TimelineItemConfigMap = {
  video: VideoMediaConfig
  image: ImageMediaConfig
  audio: AudioMediaConfig
  text: TextMediaConfig
  unknown: UnknownMediaConfig
}

/**
 * 根据媒体类型获取对应时间轴项目配置的工具类型
 */
export type GetTimelineItemConfig<T extends MediaTypeOrUnknown> = TimelineItemConfigMap[T]

// ==================== 统一时间轴项目运行时数据接口 ====================
/**
 * 设计理念：
 * - 包含所有运行时生成的、不可持久化的数据
 * - 支持扩展，未来可以添加更多运行时字段
 * - 与持久化数据完全分离
 */
export interface UnifiedTimelineItemRuntime {
  /** 与时间轴项目生命周期一致 */
  sprite?: Raw<UnifiedSprite> // 旧的webav的sprite对象
  bunnyClip?: Raw<BunnyClip> // mediabunny的clip对象
  textBitmap?: ImageBitmap // 专门用于文本渲染的ImageBitmap
}
// ==================== 核心接口设计 ====================

/**
 * 统一时间轴项目数据接口（泛型版本）
 *
 * 设计特点：
 * 1. 使用泛型确保类型安全
 * 2. 支持媒体类型动态变化
 * 3. 保持与旧架构相同的精确性
 * 4. 纯数据对象，使用 reactive() 包装
 * 5. 除sprite之外都可以持久化保存
 */
export interface UnifiedTimelineItemData<T extends MediaType = MediaType> {
  // ==================== 核心属性 ====================
  readonly id: string
  mediaItemId: string // 关联的统一媒体项目ID
  trackId?: string

  // ==================== 状态管理 ====================
  timelineStatus: TimelineItemStatus // 仅3状态：ready|loading|error

  // ==================== 媒体信息 ====================
  mediaType: T

  // ==================== 时间范围 ====================
  timeRange: UnifiedTimeRange

  // ==================== 配置（类型安全） ====================
  config: GetTimelineItemConfig<T>

  // ==================== 动画配置（类型安全） ====================
  animation?: T extends MediaType ? AnimationConfig<T> : undefined

  // ==================== 运行时数据（不可持久化） ====================
  runtime: UnifiedTimelineItemRuntime
}
