/**
 * 清除所有关键帧命令
 * 支持清除时间轴项目的所有关键帧并禁用动画
 * 适配新架构的统一类型系统
 */

import type { SimpleCommand } from '@/core/modules/commands/types'
import {
  type KeyframeSnapshot,
  type TimelineModule,
  type WebAVAnimationManager,
  type PlaybackControls,
  generateCommandId,
  createSnapshot,
  applyKeyframeSnapshot,
} from './shared'

export class ClearAllKeyframesCommand implements SimpleCommand {
  public readonly id: string
  public readonly description: string
  private beforeSnapshot: KeyframeSnapshot
  private afterSnapshot: KeyframeSnapshot | null = null

  constructor(
    private timelineItemId: string,
    private timelineModule: TimelineModule,
    private webavAnimationManager: WebAVAnimationManager,
    private playbackControls?: PlaybackControls,
  ) {
    this.id = generateCommandId()
    this.description = `清除所有关键帧`

    // 保存执行前的状态快照
    const item = this.timelineModule.getTimelineItem(timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${timelineItemId}`)
    }
    this.beforeSnapshot = createSnapshot(item)
  }

  /**
   * 执行命令：清除所有关键帧
   */
  async execute(): Promise<void> {
    const item = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${this.timelineItemId}`)
    }

    try {
      // 动态导入关键帧工具函数
      const { clearAllKeyframes } = await import('@/core/utils/unifiedKeyframeUtils')

      // 清除所有关键帧
      clearAllKeyframes(item)

      // 更新WebAV动画
      await this.webavAnimationManager.updateWebAVAnimation(item)

      // 保存执行后的状态快照
      this.afterSnapshot = createSnapshot(item)

      // 重做清除关键帧操作时，跳转到时间轴项目的开始位置
      if (this.playbackControls && item.timeRange) {
        this.playbackControls.seekTo(item.timeRange.timelineStartTime)
      }

      console.log('✅ 清除所有关键帧命令执行成功:', {
        itemId: this.timelineItemId,
      })
    } catch (error) {
      console.error('❌ 清除所有关键帧命令执行失败:', error)
      throw error
    }
  }

  /**
   * 撤销命令：恢复到清除前的状态
   */
  async undo(): Promise<void> {
    const item = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${this.timelineItemId}`)
    }

    try {
      await applyKeyframeSnapshot(item, this.beforeSnapshot, this.webavAnimationManager)

      // 撤销清除关键帧操作时，跳转到第一个关键帧位置（seekTo会自动触发渲染更新）
      if (this.playbackControls && this.beforeSnapshot.animationConfig?.keyframes?.length) {
        const firstKeyframe = this.beforeSnapshot.animationConfig.keyframes[0]
        if (firstKeyframe && item.timeRange) {
          // 将帧位置转换为绝对帧数
          const { relativeFrameToAbsoluteFrame } = await import(
            '@/core/utils/unifiedKeyframeUtils'
          )
          const absoluteFrame = relativeFrameToAbsoluteFrame(
            firstKeyframe.framePosition,
            item.timeRange,
          )
          this.playbackControls.seekTo(absoluteFrame)
        }
      }

      console.log('↩️ 清除所有关键帧命令撤销成功:', {
        itemId: this.timelineItemId,
      })
    } catch (error) {
      console.error('❌ 清除所有关键帧命令撤销失败:', error)
      throw error
    }
  }
}
