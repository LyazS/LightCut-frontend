/**
 * 媒体同步类型定义
 */

/**
 * 媒体同步配置选项
 */
export interface MediaSyncOptions {
  /**
   * 同步标识符（用于日志和调试）
   * - 命令场景：使用 commandId
   * - 项目加载场景：使用 timelineItemId
   */
  syncId: string

  /**
   * 时间轴项目ID列表
   * 保存在配置中，因为在某些场景（如删除命令）中，
   * 时间轴项目可能已经被删除，无法从 store 中获取
   */
  timelineItemIds: string[]

  /**
   * 是否需要更新命令数据
   * - true: 媒体就绪时调用 command.updateMediaData()
   * - false: 不更新命令
   */
  shouldUpdateCommand: boolean

  /**
   * 命令ID（当 shouldUpdateCommand 为 true 时必需）
   */
  commandId?: string

  /**
   * 场景描述（用于日志和调试）
   */
  description?: string
}

/**
 * 时间轴项目转换选项
 */
export interface TransitionOptions {
  /**
   * 命令ID（可选，用于日志）
   */
  commandId?: string
  
  /**
   * 场景描述（用于日志和调试）
   */
  description?: string
}