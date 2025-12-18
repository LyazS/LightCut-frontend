/**
 * 统一时间轴项目模块入口
 * 基于"核心数据 + 行为分离"的响应式重构版本
 */

// ==================== 类型定义导出 ====================
export type {
  // 核心数据类型
  UnifiedTimelineItemData,
  TimelineItemStatus,
  TransformData,
  CreateTimelineItemOptions,
  UnknownMediaConfig,
  TextStyleConfig,
  VideoMediaConfig,
  AudioMediaConfig,
} from './TimelineItemData'

// 动画类型导出
export type {
  AnimationConfig,
  Keyframe,
  KeyframeButtonState,
  KeyframeUIState,
  WebAVAnimationConfig,
} from './AnimationTypes'

// 从mediaitem模块导入MediaType
export type { MediaType } from '../mediaitem'

// ==================== 常量导出 ====================
export { VALID_TIMELINE_TRANSITIONS, MEDIA_TO_TIMELINE_STATUS_MAP } from './TimelineItemData'

// ==================== 工厂函数导出 ====================
export {
  // 工厂函数集合
  TimelineItemFactory,
} from './TimelineItemFactory'

// ==================== 状态显示工具导出 ====================
export {
  // 状态显示工具类
  TimelineStatusDisplayUtils,
  createStatusDisplayComputeds,
} from './TimelineStatusDisplayUtils'

// 状态显示类型导出
export type { StatusDisplayInfo } from './TimelineStatusDisplayUtils'

// ==================== 查询工具导出 ====================
export {
  // 查询工具集合
  TimelineItemQueries,
} from './TimelineItemQueries'
