/**
 * WebAV动画管理器
 * 负责将关键帧动画配置应用到WebAV sprite，并管理动画的生命周期
 * 适配新架构版本
 */

import type { UnifiedTimelineItemData } from '@/core/timelineitem/TimelineItemData'
import { convertToWebAVAnimation, isValidAnimationConfig } from '@/core/utils/animationConverter'
import { hasAnimation } from '@/core/utils/unifiedKeyframeUtils'

// ==================== WebAV动画管理器 ====================

/**
 * WebAV动画管理器类
 * 管理单个TimelineItem的WebAV动画
 */
export class WebAVAnimationManager {
  private timelineItem: UnifiedTimelineItemData
  private isDestroyed: boolean = false

  constructor(timelineItem: UnifiedTimelineItemData) {
    this.timelineItem = timelineItem
  }

  /**
   * 更新WebAV动画
   * 将TimelineItem的动画配置应用到WebAV sprite
   */
  public async updateAnimation(): Promise<void> {
    if (this.isDestroyed) return

    const sprite = this.timelineItem.runtime.sprite
    if (!sprite) {
      console.warn('🎬 [WebAV Animation] No sprite found for TimelineItem:', this.timelineItem.id)
      return
    }

    try {
      // 检查是否有有效的动画配置
      if (!hasAnimation(this.timelineItem)) {
        // 清除现有动画
        await this.clearAnimation()
        return
      }

      const animationConfig = this.timelineItem.animation!

      // 验证动画配置
      if (!isValidAnimationConfig(animationConfig)) {
        console.warn('🎬 [WebAV Animation] Invalid animation config for:', this.timelineItem.id)

        return
      }

      // 获取画布尺寸信息
      // 动态导入unifiedStore来获取画布尺寸
      const { useUnifiedStore } = await import('@/core/unifiedStore')
      const unifiedStore = useUnifiedStore()
      const canvasWidth = unifiedStore.videoResolution.width
      const canvasHeight = unifiedStore.videoResolution.height

      // 转换为WebAV格式
      const webavConfig = convertToWebAVAnimation(
        animationConfig,
        this.timelineItem.timeRange,
        canvasWidth,
        canvasHeight,
      )

      // 检查是否有关键帧
      if (Object.keys(webavConfig.keyframes).length === 0) {
        console.warn('🎬 [WebAV Animation] No keyframes to apply for:', this.timelineItem.id)
        await this.clearAnimation()
        return
      }

      // 应用动画到WebAV sprite
      console.log('🎬 [WebAV Animation] Applying animation to WebAV sprite:', {
        itemId: this.timelineItem.id,
        keyframeCount: Object.keys(webavConfig.keyframes).length,
        duration: webavConfig.options.duration,
        keyframes: webavConfig.keyframes,
      })
      sprite.setAnimation(webavConfig.keyframes, webavConfig.options)

      // 立即触发AVCanvas.previewFrame以确保动画效果立即生效
      try {
        // 动态导入unifiedStore来获取当前帧和AVCanvas
        const { useUnifiedStore } = await import('@/core/unifiedStore')
        const unifiedStore = useUnifiedStore()

        // 使用项目时间轴的绝对时间，通过unifiedStore统一管理
        const currentFrame = unifiedStore.currentFrame
        unifiedStore.seekToFrame(currentFrame)

        console.log('🎬 [WebAV Animation] Triggered WebAV seekTo for immediate update:', {
          currentFrame: unifiedStore.currentFrame,
        })
      } catch (preFrameError) {
        console.warn('🎬 [WebAV Animation] Failed to trigger previewFrame:', preFrameError)
      }

      console.log('🎬 [WebAV Animation] Animation applied successfully:', {
        itemId: this.timelineItem.id,
        keyframeCount: Object.keys(webavConfig.keyframes).length,
        duration: webavConfig.options.duration,
        keyframes: webavConfig.keyframes,
      })
    } catch (error) {
      console.error('🎬 [WebAV Animation] Failed to update animation:', error)
    }
  }

  /**
   * 清除WebAV动画
   */
  public async clearAnimation(): Promise<void> {
    if (this.isDestroyed) return

    const sprite = this.timelineItem.runtime.sprite
    if (!sprite) return

    try {
      // 清除WebAV动画（传入空的关键帧）
      sprite.setAnimation({}, { duration: 0, iterCount: 1 })

      console.log('🎬 [WebAV Animation] Animation cleared for:', this.timelineItem.id)
    } catch (error) {
      console.error('🎬 [WebAV Animation] Failed to clear animation:', error)
    }
  }

  /**
   * 销毁管理器
   */
  public destroy(): void {
    this.isDestroyed = true
    console.log('🎬 [WebAV Animation] Manager destroyed for:', this.timelineItem.id)
  }
}

// ==================== 全局动画管理器 ====================

/**
 * 全局WebAV动画管理器
 * 管理所有TimelineItem的动画
 */
class GlobalWebAVAnimationManager {
  private managers = new Map<string, WebAVAnimationManager>()

  /**
   * 添加动画管理器
   */
  public addManager(timelineItem: UnifiedTimelineItemData): WebAVAnimationManager {
    const manager = new WebAVAnimationManager(timelineItem)
    this.managers.set(timelineItem.id, manager)
    return manager
  }

  /**
   * 移除动画管理器
   */
  public removeManager(itemId: string): void {
    const manager = this.managers.get(itemId)
    if (manager) {
      manager.destroy()
      this.managers.delete(itemId)
    }
  }

  /**
   * 获取动画管理器
   */
  public getManager(itemId: string): WebAVAnimationManager | undefined {
    return this.managers.get(itemId)
  }
}

// 导出全局实例
export const globalWebAVAnimationManager = new GlobalWebAVAnimationManager()

// ==================== 便捷函数 ====================

/**
 * 更新TimelineItem的WebAV动画
 */
export async function updateWebAVAnimation(timelineItem: UnifiedTimelineItemData): Promise<void> {
  let manager = globalWebAVAnimationManager.getManager(timelineItem.id)
  if (!manager) {
    manager = globalWebAVAnimationManager.addManager(timelineItem)
  }
  await manager.updateAnimation()
}
