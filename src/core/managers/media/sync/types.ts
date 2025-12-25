/**
 * 媒体同步类型定义
 */

import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'

/**
 * 媒体同步场景
 */
export type MediaSyncScenario = 'command' | 'projectLoad'

/**
 * 媒体同步信息接口
 */
export interface MediaSyncInfo {
  id: string // 唯一标识符，可以是 commandId 或 timelineItemId
  commandId?: string // 命令ID（可选）
  mediaItemId: string // 媒体项目ID
  timelineItemId?: string // 时间轴项目ID（可选）
  unwatch: () => void // 取消监听函数
  scenario: MediaSyncScenario // 使用场景
  description?: string // 描述信息
}

/**
 * 时间轴项目转换选项
 */
export interface TransitionOptions {
  scenario: MediaSyncScenario
  commandId?: string
  description?: string
}

/**
 * 媒体同步基类接口
 */
export interface IMediaSync {
  /**
   * 设置媒体同步
   */
  setup(): Promise<void>

  /**
   * 清理媒体同步
   */
  cleanup(): void
}