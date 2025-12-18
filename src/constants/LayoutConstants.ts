/**
 * 统一布局系统常量定义
 * 包含时间轴布局、轨道布局、UI尺寸等相关常量
 */

// ==================== 时间轴布局常量 ====================

/**
 * 轨道控制区域宽度 - 150px
 */
export const TRACK_CONTROL_WIDTH = 150

/**
 * 时间轴默认宽度 - 800px
 */
export const TIMELINE_DEFAULT_WIDTH = 800

// ==================== 导出所有布局常量 ====================

export const LayoutConstants = {
  // 时间轴布局
  TRACK_CONTROL_WIDTH,
  TIMELINE_DEFAULT_WIDTH,
} as const
