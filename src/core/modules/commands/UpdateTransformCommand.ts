/**
 * 更新变换属性命令
 * 支持变换属性（位置、大小、旋转、透明度、zIndex、时长、倍速）修改的撤销/重做操作
 */

import { generateCommandId } from '@/core/utils/idGenerator'
import { framesToMicroseconds, framesToTimecode } from '@/core/utils/timeUtils'
import type { SimpleCommand } from '@/core/modules/commands/types'

// ==================== 新架构类型导入 ====================
import type {
  VideoMediaConfig,
  AudioMediaConfig,
  UnifiedTimelineItemData,
  TransformData,
} from '@/core/timelineitem'

import type { UnifiedMediaItemData, MediaType } from '@/core/mediaitem'

// ==================== 新架构工具导入 ====================
import { TimelineItemQueries } from '@/core/timelineitem/queries'
import { TimelineItemFactory } from '@/core/timelineitem'

/**
 * 更新变换属性命令
 * 支持变换属性（位置、大小、旋转、透明度、zIndex、时长、倍速）修改的撤销/重做操作
 */
export class UpdateTransformCommand implements SimpleCommand {
  public readonly id: string
  public readonly description: string
  private _isDisposed = false

  constructor(
    private timelineItemId: string,
    private oldValues: {
      x?: number
      y?: number
      width?: number
      height?: number
      rotation?: number
      opacity?: number
      zIndex?: number
      duration?: number // 时长（帧数）
      playbackRate?: number // 倍速
      volume?: number // 音量（0-1之间）
      isMuted?: boolean // 静音状态
      gain?: number // 音频增益（dB）
    },
    private newValues: {
      x?: number
      y?: number
      width?: number
      height?: number
      rotation?: number
      opacity?: number
      zIndex?: number
      duration?: number // 时长（帧数）
      playbackRate?: number // 倍速
      volume?: number // 音量（0-1之间）
      isMuted?: boolean // 静音状态
      gain?: number // 音频增益（dB）
    },
    private timelineModule: {
      updateTimelineItemTransform: (id: string, transform: TransformData) => void
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
      updateTimelineItemPlaybackRate?: (id: string, rate: number) => void
    },
    private mediaModule: {
      getMediaItem: (id: string) => UnifiedMediaItemData | undefined
    },
  ) {
    this.id = generateCommandId()

    const timelineItem = this.timelineModule.getTimelineItem(timelineItemId)
    const mediaItem = timelineItem ? this.mediaModule.getMediaItem(timelineItem.mediaItemId) : null

    // 生成描述信息
    this.description = this.generateDescription(mediaItem?.name || '未知素材')

    console.log('💾 保存变换属性操作数据:', {
      timelineItemId,
      oldValues,
      newValues,
    })
  }

  /**
   * 执行命令：应用新的变换属性
   */
  async execute(): Promise<void> {
    try {
      // 检查项目是否存在
      const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
      if (!timelineItem) {
        console.warn(`⚠️ 时间轴项目不存在，无法更新变换属性: ${this.timelineItemId}`)
        return
      }

      // 应用新的变换属性（位置、大小、旋转、透明度、层级）
      const transformValues = {
        x: this.newValues.x,
        y: this.newValues.y,
        width: this.newValues.width,
        height: this.newValues.height,
        rotation: this.newValues.rotation,
        opacity: this.newValues.opacity,
        zIndex: this.newValues.zIndex,
      }

      // 过滤掉undefined的值
      const filteredTransform = Object.fromEntries(
        Object.entries(transformValues).filter(([_, value]) => value !== undefined),
      )

      if (Object.keys(filteredTransform).length > 0) {
        this.timelineModule.updateTimelineItemTransform(this.timelineItemId, filteredTransform)
      }

      // 处理倍速更新（对视频和音频有效）
      if (this.newValues.playbackRate !== undefined) {
        this.timelineModule.updateTimelineItemPlaybackRate?.(
          this.timelineItemId,
          this.newValues.playbackRate,
        )
      }

      // 处理时长更新（通过直接操作sprite的timeRange）
      if (this.newValues.duration !== undefined) {
        this.updateTimelineItemDuration(this.timelineItemId, this.newValues.duration)
      }

      // 处理音量更新（对视频和音频有效）
      if (TimelineItemQueries.hasAudioProperties(timelineItem)) {
        if (this.newValues.volume !== undefined) {
          const config = timelineItem.config as VideoMediaConfig | AudioMediaConfig
          if (config.volume !== undefined) {
            config.volume = this.newValues.volume
          }
        }

        if (this.newValues.isMuted !== undefined) {
          const config = timelineItem.config as VideoMediaConfig | AudioMediaConfig
          if (config.isMuted !== undefined) {
            config.isMuted = this.newValues.isMuted
          }
        }
      }

      const mediaItem = this.mediaModule.getMediaItem(timelineItem.mediaItemId)
      console.log(`🎯 已更新变换属性: ${mediaItem?.name || '未知素材'}`)
    } catch (error) {
      const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
      const mediaItem = timelineItem
        ? this.mediaModule.getMediaItem(timelineItem.mediaItemId)
        : null
      console.error(`❌ 更新变换属性失败: ${mediaItem?.name || '未知素材'}`, error)
      throw error
    }
  }

  /**
   * 撤销命令：恢复到旧的变换属性
   */
  async undo(): Promise<void> {
    try {
      // 检查项目是否存在
      const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
      if (!timelineItem) {
        console.warn(`⚠️ 时间轴项目不存在，无法撤销变换属性: ${this.timelineItemId}`)
        return
      }

      // 恢复到旧的变换属性（位置、大小、旋转、透明度、层级）
      const transformValues = {
        x: this.oldValues.x,
        y: this.oldValues.y,
        width: this.oldValues.width,
        height: this.oldValues.height,
        rotation: this.oldValues.rotation,
        opacity: this.oldValues.opacity,
        zIndex: this.oldValues.zIndex,
      }

      // 过滤掉undefined的值
      const filteredTransform = Object.fromEntries(
        Object.entries(transformValues).filter(([_, value]) => value !== undefined),
      )

      if (Object.keys(filteredTransform).length > 0) {
        this.timelineModule.updateTimelineItemTransform(this.timelineItemId, filteredTransform)
      }

      // 处理倍速恢复（对视频和音频有效）
      if (this.oldValues.playbackRate !== undefined) {
        this.timelineModule.updateTimelineItemPlaybackRate?.(
          this.timelineItemId,
          this.oldValues.playbackRate,
        )
      }

      // 处理时长恢复（通过直接操作sprite的timeRange）
      if (this.oldValues.duration !== undefined) {
        this.updateTimelineItemDuration(this.timelineItemId, this.oldValues.duration)
      }

      // 处理音量恢复（对视频和音频有效）
      if (TimelineItemQueries.hasAudioProperties(timelineItem)) {
        if (this.oldValues.volume !== undefined) {
          const config = timelineItem.config as VideoMediaConfig | AudioMediaConfig
          if (config.volume !== undefined) {
            config.volume = this.oldValues.volume
          }
        }

        if (this.oldValues.isMuted !== undefined) {
          const config = timelineItem.config as VideoMediaConfig | AudioMediaConfig
          if (config.isMuted !== undefined) {
            config.isMuted = this.oldValues.isMuted
          }
        }
      }

      const mediaItem = this.mediaModule.getMediaItem(timelineItem.mediaItemId)
      console.log(`↩️ 已撤销变换属性更新: ${mediaItem?.name || '未知素材'}`)
    } catch (error) {
      const timelineItem = this.timelineModule.getTimelineItem(this.timelineItemId)
      const mediaItem = timelineItem
        ? this.mediaModule.getMediaItem(timelineItem.mediaItemId)
        : null
      console.error(`❌ 撤销变换属性更新失败: ${mediaItem?.name || '未知素材'}`, error)
      throw error
    }
  }

  /**
   * 生成命令描述
   */
  private generateDescription(mediaName: string): string {
    const changes: string[] = []

    // 检查位置变化
    if (
      (this.newValues.x !== undefined && this.oldValues.x !== undefined) ||
      (this.newValues.y !== undefined && this.oldValues.y !== undefined)
    ) {
      const oldX = this.oldValues.x ?? 0
      const oldY = this.oldValues.y ?? 0
      const newX = this.newValues.x ?? oldX
      const newY = this.newValues.y ?? oldY
      changes.push(
        `位置: (${oldX.toFixed(0)}, ${oldY.toFixed(0)}) → (${newX.toFixed(0)}, ${newY.toFixed(0)})`,
      )
    }

    // 检查大小变化
    if (
      (this.newValues.width !== undefined && this.oldValues.width !== undefined) ||
      (this.newValues.height !== undefined && this.oldValues.height !== undefined)
    ) {
      const oldWidth = this.oldValues.width ?? 0
      const oldHeight = this.oldValues.height ?? 0
      const newWidth = this.newValues.width ?? oldWidth
      const newHeight = this.newValues.height ?? oldHeight
      changes.push(
        `大小: ${oldWidth.toFixed(0)}×${oldHeight.toFixed(0)} → ${newWidth.toFixed(0)}×${newHeight.toFixed(0)}`,
      )
    }

    if (this.newValues.rotation !== undefined && this.oldValues.rotation !== undefined) {
      // 将弧度转换为角度显示
      const oldDegrees = ((this.oldValues.rotation * 180) / Math.PI).toFixed(1)
      const newDegrees = ((this.newValues.rotation * 180) / Math.PI).toFixed(1)
      changes.push(`旋转: ${oldDegrees}° → ${newDegrees}°`)
    }

    if (this.newValues.opacity !== undefined && this.oldValues.opacity !== undefined) {
      const oldOpacity = (this.oldValues.opacity * 100).toFixed(0)
      const newOpacity = (this.newValues.opacity * 100).toFixed(0)
      changes.push(`透明度: ${oldOpacity}% → ${newOpacity}%`)
    }

    if (this.newValues.zIndex !== undefined && this.oldValues.zIndex !== undefined) {
      changes.push(`层级: ${this.oldValues.zIndex} → ${this.newValues.zIndex}`)
    }

    if (this.newValues.duration !== undefined && this.oldValues.duration !== undefined) {
      changes.push(
        `时长: ${framesToTimecode(this.oldValues.duration)} → ${framesToTimecode(this.newValues.duration)}`,
      )
    }

    if (this.newValues.playbackRate !== undefined && this.oldValues.playbackRate !== undefined) {
      changes.push(
        `倍速: ${this.oldValues.playbackRate.toFixed(1)}x → ${this.newValues.playbackRate.toFixed(1)}x`,
      )
    }

    if (this.newValues.volume !== undefined && this.oldValues.volume !== undefined) {
      const oldVolumePercent = (this.oldValues.volume * 100).toFixed(0)
      const newVolumePercent = (this.newValues.volume * 100).toFixed(0)
      changes.push(`音量: ${oldVolumePercent}% → ${newVolumePercent}%`)
    }

    if (this.newValues.isMuted !== undefined && this.oldValues.isMuted !== undefined) {
      const oldMuteText = this.oldValues.isMuted ? '静音' : '有声'
      const newMuteText = this.newValues.isMuted ? '静音' : '有声'
      changes.push(`静音状态: ${oldMuteText} → ${newMuteText}`)
    }

    if (this.newValues.gain !== undefined && this.oldValues.gain !== undefined) {
      changes.push(
        `增益: ${this.oldValues.gain.toFixed(1)}dB → ${this.newValues.gain.toFixed(1)}dB`,
      )
    }

    const changeText = changes.length > 0 ? ` (${changes.join(', ')})` : ''
    return `更新变换属性: ${mediaName}${changeText}`
  }

  /**
   * 更新时间轴项目的时长
   * @param timelineItemId 时间轴项目ID
   * @param newDurationFrames 新的时长（帧数）
   */
  private updateTimelineItemDuration(timelineItemId: string, newDurationFrames: number): void {
    const timelineItem = this.timelineModule.getTimelineItem(timelineItemId)
    if (!timelineItem) return

    // 直接使用帧数进行计算
    const timelineStartFrames = timelineItem.timeRange.timelineStartTime
    const newTimelineEndFrames = timelineStartFrames + newDurationFrames

    // 使用 TimelineItemFactory.setTimeRange 设置时间范围
    TimelineItemFactory.setTimeRange(timelineItem, {
      timelineEndTime: newTimelineEndFrames,
    })

    console.log('📝 [UpdateTimelineItemDuration] 时长已更新:', {
      mediaType: timelineItem.mediaType,
      startTime: timelineStartFrames,
      endTime: newTimelineEndFrames,
      duration: newDurationFrames,
    })
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
    console.log(`🗑️ [UpdateTransformCommand] 命令资源已清理: ${this.id}`)
  }
}
