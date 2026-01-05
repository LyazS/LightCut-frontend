/**
 * 媒体同步基类
 * 提供通用的同步逻辑和生命周期管理
 */

import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { IMediaSync } from './types'
import { MediaSyncManager } from './MediaSyncManager'

/**
 * 媒体同步抽象基类
 */
export abstract class BaseMediaSync implements IMediaSync {
  protected syncId: string
  protected unwatch?: () => void
  protected isSetup = false

  constructor(
    protected mediaItemId: string,
    protected timelineItemId?: string,
  ) {
    this.syncId = this.generateSyncId()
  }

  /**
   * 设置媒体同步
   */
  async setup(): Promise<void> {
    if (this.isSetup) {
      console.warn(`[BaseMediaSync] 媒体同步已设置: ${this.syncId}`)
      return
    }

    try {
      console.log(`[BaseMediaSync] 开始设置媒体同步: ${this.syncId}`)

      // 1. 验证媒体项目
      const mediaItem = this.getMediaItem()
      if (!mediaItem) {
        throw new Error(`找不到媒体项目: ${this.mediaItemId}`)
      }

      // 2. 检查是否需要同步
      if (this.shouldSkipSync(mediaItem)) {
        console.log(`[BaseMediaSync] 媒体已就绪，跳过同步设置: ${this.syncId}`)
        await this.handleReadyMedia(mediaItem)
        return
      }

      // 3. 设置状态监听
      this.unwatch = this.setupWatcher(mediaItem)

      // 4. 注册到管理器
      this.registerToManager()

      this.isSetup = true
      console.log(`✅ [BaseMediaSync] 媒体同步设置成功: ${this.syncId}`)
    } catch (error) {
      console.error(`❌ [BaseMediaSync] 媒体同步设置失败: ${this.syncId}`, error)
      throw error
    }
  }

  /**
   * 清理媒体同步
   */
  cleanup(): void {
    if (this.unwatch) {
      this.unwatch()
      this.unwatch = undefined
    }
    this.isSetup = false
    console.log(`🧹 [BaseMediaSync] 媒体同步已清理: ${this.syncId}`)
  }

  // 抽象方法，由子类实现
  /**
   * 生成同步ID
   */
  protected abstract generateSyncId(): string

  /**
   * 获取媒体项目
   */
  protected abstract getMediaItem(): UnifiedMediaItemData | undefined

  /**
   * 判断是否应该跳过同步
   */
  protected abstract shouldSkipSync(mediaItem: UnifiedMediaItemData): boolean

  /**
   * 处理已就绪的媒体
   */
  protected abstract handleReadyMedia(mediaItem: UnifiedMediaItemData): Promise<void>

  /**
   * 设置状态监听器
   */
  protected abstract setupWatcher(mediaItem: UnifiedMediaItemData): () => void

  /**
   * 注册到管理器
   */
  protected abstract registerToManager(): void
}