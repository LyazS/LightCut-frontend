/**
 * 媒体同步管理器
 * 负责管理所有媒体同步实例的注册和清理
 */

import type { MediaSyncInfo, MediaSyncScenario } from './types'

/**
 * 统一媒体同步管理器
 * 单例模式，管理所有媒体同步实例
 */
export class MediaSyncManager {
  private static instance: MediaSyncManager
  private syncMap = new Map<string, MediaSyncInfo>()

  private constructor() {}

  static getInstance(): MediaSyncManager {
    if (!MediaSyncManager.instance) {
      MediaSyncManager.instance = new MediaSyncManager()
    }
    return MediaSyncManager.instance
  }

  /**
   * 注册媒体同步
   */
  register(
    id: string,
    mediaItemId: string,
    unwatch: () => void,
    scenario: MediaSyncScenario,
    options?: {
      commandId?: string
      timelineItemId?: string
      description?: string
    },
  ): void {
    // 清理已存在的同步（避免重复）
    this.cleanup(id)

    this.syncMap.set(id, {
      id,
      commandId: options?.commandId,
      mediaItemId,
      timelineItemId: options?.timelineItemId,
      unwatch,
      scenario,
      description: options?.description,
    })
  }

  /**
   * 清理指定的媒体同步
   */
  cleanup(id: string): void {
    const sync = this.syncMap.get(id)
    if (sync) {
      sync.unwatch()
      this.syncMap.delete(id)
    }
  }

  /**
   * 根据命令ID清理媒体同步
   */
  cleanupByCommandId(commandId: string): void {
    // 先收集要删除的ID
    const idsToDelete: string[] = []
    for (const [id, sync] of this.syncMap) {
      if (sync.commandId === commandId) {
        idsToDelete.push(id)
      }
    }
    
    // 统一删除
    for (const id of idsToDelete) {
      const sync = this.syncMap.get(id)
      if (sync) {
        sync.unwatch()
        this.syncMap.delete(id)
      }
    }
  }

  /**
   * 根据时间轴项目ID清理媒体同步
   */
  cleanupByTimelineItemId(timelineItemId: string): void {
    // 先收集要删除的ID
    const idsToDelete: string[] = []
    for (const [id, sync] of this.syncMap) {
      if (sync.timelineItemId === timelineItemId) {
        idsToDelete.push(id)
      }
    }
    
    // 统一删除
    for (const id of idsToDelete) {
      const sync = this.syncMap.get(id)
      if (sync) {
        sync.unwatch()
        this.syncMap.delete(id)
      }
    }
  }

  /**
   * 根据媒体项目ID清理媒体同步
   */
  cleanupByMediaItemId(mediaItemId: string): void {
    // 先收集要删除的ID
    const idsToDelete: string[] = []
    for (const [id, sync] of this.syncMap) {
      if (sync.mediaItemId === mediaItemId) {
        idsToDelete.push(id)
      }
    }
    
    // 统一删除
    for (const id of idsToDelete) {
      const sync = this.syncMap.get(id)
      if (sync) {
        sync.unwatch()
        this.syncMap.delete(id)
      }
    }
  }

  /**
   * 清理所有媒体同步
   */
  cleanupAll(): void {
    for (const [id, sync] of this.syncMap) {
      sync.unwatch()
    }
    this.syncMap.clear()
  }

  /**
   * 获取同步信息（用于调试）
   */
  getSyncInfo(): Array<{
    id: string
    commandId?: string
    mediaItemId: string
    timelineItemId?: string
    scenario: MediaSyncScenario
    description?: string
  }> {
    return Array.from(this.syncMap.values()).map((sync) => ({
      id: sync.id,
      commandId: sync.commandId,
      mediaItemId: sync.mediaItemId,
      timelineItemId: sync.timelineItemId,
      scenario: sync.scenario,
      description: sync.description,
    }))
  }
}

/**
 * 清理命令媒体同步
 * @param commandId 命令ID
 */
export function cleanupCommandMediaSync(commandId: string): void {
  try {
    const syncManager = MediaSyncManager.getInstance()
    syncManager.cleanupByCommandId(commandId)

    console.log(`🗑️ [MediaSyncManager] 已清理命令所有媒体同步: ${commandId}`)
  } catch (error) {
    console.error(`❌ [MediaSyncManager] 清理命令媒体同步失败:`, {
      commandId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 清理项目加载媒体同步
 * @param timelineItemId 时间轴项目ID（可选，不提供则清理所有）
 */
export function cleanupProjectLoadMediaSync(timelineItemId?: string): void {
  try {
    const syncManager = MediaSyncManager.getInstance()

    if (timelineItemId) {
      syncManager.cleanupByTimelineItemId(timelineItemId)
      console.log(`🗑️ [MediaSyncManager] 已清理指定时间轴项目的媒体同步: ${timelineItemId}`)
    } else {
      syncManager.cleanupAll()
      console.log(`🗑️ [MediaSyncManager] 已清理所有项目加载媒体同步`)
    }
  } catch (error) {
    console.error(`❌ [MediaSyncManager] 清理项目加载媒体同步失败:`, {
      timelineItemId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 清理媒体项目的所有同步
 * @param mediaItemId 媒体项目ID
 */
export function cleanupMediaItemSync(mediaItemId: string): void {
  try {
    const syncManager = MediaSyncManager.getInstance()
    syncManager.cleanupByMediaItemId(mediaItemId)

    console.log(`🗑️ [MediaSyncManager] 已清理媒体项目的所有同步: ${mediaItemId}`)
  } catch (error) {
    console.error(`❌ [MediaSyncManager] 清理媒体项目同步失败:`, {
      mediaItemId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 获取统一媒体同步信息（用于调试）
 */
export function getMediaSyncInfo(): Array<{
  id: string
  commandId?: string
  mediaItemId: string
  timelineItemId?: string
  scenario: MediaSyncScenario
  description?: string
}> {
  const syncManager = MediaSyncManager.getInstance()
  return syncManager.getSyncInfo()
}