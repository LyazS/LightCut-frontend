/**
 * 并发控制相关常量
 * 集中管理所有并发数量配置
 */

/**
 * 数据源处理器并发配置
 */
export const DATA_SOURCE_CONCURRENCY = {
  /** 基础数据源处理器默认并发数 */
  BASE_MAX_CONCURRENT_TASKS: 5,
  
  /** AI生成处理器并发数（较低，因为AI生成任务较重） */
  AI_GENERATION_MAX_CONCURRENT_TASKS: 2,
  
  /** 用户选择文件处理器并发数（较高，因为本地文件处理速度快） */
  USER_SELECTED_MAX_CONCURRENT_TASKS: 10,
} as const

/**
 * WebAV处理器并发配置
 */
export const WEBAV_CONCURRENCY = {
  /** WebAV Clip处理默认并发数 */
  MAX_CONCURRENT_CLIPS: 3,
} as const

/**
 * 导出所有并发常量的统一对象
 */
export const CONCURRENCY_CONSTANTS = {
  ...DATA_SOURCE_CONCURRENCY,
  ...WEBAV_CONCURRENCY,
} as const