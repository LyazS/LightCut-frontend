/**
 * 统一属性更新命令
 * 根据当前动画状态智能处理属性修改：
 * - 无动画状态：直接更新属性
 * - 在关键帧上：更新现有关键帧
 * - 在关键帧之间：创建新关键帧
 * 适配新架构的统一类型系统
 */

import type { SimpleCommand } from '@/core/modules/commands/types'
import {
  type KeyframeSnapshot,
  type TimelineModule,
  type PlaybackControls,
  generateCommandId,
  createSnapshot,
  applyKeyframeSnapshot,
  isPlayheadInTimelineItem,
  showUserWarning,
} from './shared'

export class UpdatePropertyCommand implements SimpleCommand {
  public readonly id: string
  public readonly description: string
  private beforeSnapshot: KeyframeSnapshot
  private afterSnapshot: KeyframeSnapshot | null = null
  private _isDisposed = false

  constructor(
    private timelineItemId: string,
    private frame: number,
    private property: string,
    private newValue: any,
    private timelineModule: TimelineModule,
    private playbackControls?: PlaybackControls,
  ) {
    this.id = generateCommandId()
    this.description = `修改属性: ${property} (帧 ${frame})`

    // 保存执行前的状态快照
    const item = this.timelineModule.getTimelineItem(timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${timelineItemId}`)
    }
    this.beforeSnapshot = createSnapshot(item)
  }

  /**
   * 执行命令：更新属性（智能处理关键帧）
   */
  async execute(): Promise<void> {
    const item = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${this.timelineItemId}`)
    }

    // 检查播放头是否在clip时间范围内
    if (!isPlayheadInTimelineItem(item, this.frame)) {
      await showUserWarning(
        '无法更新属性',
        '播放头不在当前视频片段的时间范围内。请将播放头移动到片段内再尝试修改属性。',
      )

      console.warn('🎬 [Update Property Command] 播放头不在当前clip时间范围内，无法更新属性:', {
        itemId: this.timelineItemId,
        frame: this.frame,
        property: this.property,
        value: this.newValue,
        clipTimeRange: {
          start: item.timeRange.timelineStartTime,
          end: item.timeRange.timelineEndTime,
        },
      })
      throw new Error('播放头不在当前clip时间范围内，无法更新属性')
    }

    try {
      // 动态导入关键帧工具函数
      const { handlePropertyChange } = await import('@/core/utils/unifiedKeyframeUtils')

      // 使用统一的属性修改处理逻辑
      const actionType = await handlePropertyChange(item, this.frame, this.property, this.newValue)

      // 保存执行后的状态快照
      this.afterSnapshot = createSnapshot(item)

      // 重做属性修改时，跳转到相关帧位置
      if (this.playbackControls) {
        this.playbackControls.seekTo(this.frame)
      }

      // 根据实际处理类型显示不同的日志
      const actionMessages = {
        'no-animation': '✅ 属性更新完成（无动画）',
        'updated-keyframe': '✅ 关键帧属性更新完成',
        'created-keyframe': '✅ 创建关键帧并更新属性完成',
      }

      console.log(actionMessages[actionType] || '✅ 属性更新完成', {
        itemId: this.timelineItemId,
        frame: this.frame,
        property: this.property,
        value: this.newValue,
        actionType,
      })
    } catch (error) {
      console.error('❌ 属性更新命令执行失败:', error)
      throw error
    }
  }

  /**
   * 撤销命令：恢复到修改前的状态
   */
  async undo(): Promise<void> {
    const item = this.timelineModule.getTimelineItem(this.timelineItemId)
    if (!item) {
      throw new Error(`时间轴项目不存在: ${this.timelineItemId}`)
    }

    try {
      await applyKeyframeSnapshot(item, this.beforeSnapshot)

      // 撤销属性修改时，跳转到相关帧位置（seekTo会自动触发渲染更新）
      if (this.playbackControls) {
        this.playbackControls.seekTo(this.frame)
      }

      console.log('↩️ 属性更新命令撤销成功:', {
        itemId: this.timelineItemId,
        frame: this.frame,
        property: this.property,
      })
    } catch (error) {
      console.error('❌ 属性更新命令撤销失败:', error)
      throw error
    }
  }

  /**
   * 检查命令是否已被清理
   */
  get isDisposed(): boolean {
    return this._isDisposed
  }

  /**
   * 清理命令持有的资源
   */
  dispose(): void {
    if (this._isDisposed) {
      return
    }

    this._isDisposed = true
    console.log(`🗑️ [UpdatePropertyCommand] 命令资源已清理: ${this.id}`)
  }
}
