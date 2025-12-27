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
import type { MediaType } from '@/core/mediaitem'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import type { BunnyClip } from '@/core/mediabunny/bunny-clip'
import type { GetConfigs, GetAnimation } from './bunnytype'

// 重新导出 bunnytype 中的类型供其他模块使用
export type {
  GetConfigs,
  GetAnimation,
  VisualProps,
  AudioProps,
  TextProps,
  VideoMediaConfig,
  ImageMediaConfig,
  AudioMediaConfig,
  TextMediaConfig,
} from './bunnytype'

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
}

// ==================== 统一时间轴项目运行时数据接口 ====================
/**
 * 设计理念：
 * - 包含所有运行时生成的、不可持久化的数据
 * - 支持扩展，未来可以添加更多运行时字段
 * - 与持久化数据完全分离
 */
export interface UnifiedTimelineItemRuntime {
  /** 与时间轴项目生命周期一致 */
  // sprite?: Raw<UnifiedSprite> // 旧的webav的sprite对象
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
  config: GetConfigs<T>

  // ==================== 动画配置（类型安全） ====================
  animation?: GetAnimation<T>

  // ==================== 运行时数据（不可持久化） ====================
  runtime: UnifiedTimelineItemRuntime
}
