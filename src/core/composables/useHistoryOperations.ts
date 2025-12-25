import type { MediaType } from '@/core'
import type {
  UnifiedTimelineItemData,
  VideoMediaConfig,
  AudioMediaConfig,
} from '@/core/timelineitem'
import type { AudioVisibleSprite, VideoVisibleSprite } from '@/core/visiblesprite'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import type { UnifiedTrackType, UnifiedTrackData } from '@/core/track/TrackTypes'
import type {
  UnifiedHistoryModule,
  UnifiedTimelineModule,
  UnifiedMediaModule,
  UnifiedConfigModule,
  UnifiedTrackModule,
  UnifiedSelectionModule,
} from '@/core/modules'
import {
  AddTimelineItemCommand,
  RemoveTimelineItemCommand,
  MoveTimelineItemCommand,
  UpdateTransformCommand,
  SplitTimelineItemCommand,
  ResizeTimelineItemCommand,
  AddTrackCommand,
  RemoveTrackCommand,
  RenameTrackCommand,
  ToggleTrackVisibilityCommand,
  ToggleTrackMuteCommand,
  SelectTimelineItemsCommand,
} from '@/core/modules/commands/timelineCommands'
import { BatchAutoArrangeTrackCommand } from '@/core/modules/commands/batchCommands'
import { TimelineItemQueries } from '@/core/timelineitem/'
import { duplicateTimelineItem } from '@/core/timelineitem/factory'
import { UpdateTextCommand } from '@/core/modules/commands/UpdateTextCommand'
import type { TextStyleConfig } from '@/core/timelineitem'
import {
  CreateKeyframeCommand,
  DeleteKeyframeCommand,
  UpdatePropertyCommand,
  ClearAllKeyframesCommand,
  ToggleKeyframeCommand,
  type TimelineModule as KeyframeTimelineModule,
  type PlaybackControls,
} from '@/core/modules/commands/keyframeCommands'

// 变换属性类型定义
interface TransformProperties {
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
}

/**
 * 历史记录操作相关方法
 * 包括时间轴项目和轨道相关的历史记录操作方法
 */
export function useHistoryOperations(
  unifiedHistoryModule: UnifiedHistoryModule,
  unifiedTimelineModule: UnifiedTimelineModule,
  unifiedMediaModule: UnifiedMediaModule,
  unifiedConfigModule: UnifiedConfigModule,
  unifiedTrackModule: UnifiedTrackModule,
  unifiedSelectionModule: UnifiedSelectionModule,
) {
  // ==================== 辅助函数 ====================

  /**
   * 检查变换属性是否有实际变化
   */
  function checkTransformChanges(
    oldTransform: TransformProperties,
    newTransform: TransformProperties,
  ): boolean {
    // 检查位置变化
    if (
      (newTransform.x !== undefined && oldTransform.x !== undefined) ||
      (newTransform.y !== undefined && oldTransform.y !== undefined)
    ) {
      const xChanged =
        newTransform.x !== undefined &&
        oldTransform.x !== undefined &&
        Math.abs(oldTransform.x - newTransform.x) > 0.1
      const yChanged =
        newTransform.y !== undefined &&
        oldTransform.y !== undefined &&
        Math.abs(oldTransform.y - newTransform.y) > 0.1
      if (xChanged || yChanged) return true
    }

    // 检查大小变化
    if (
      (newTransform.width !== undefined && oldTransform.width !== undefined) ||
      (newTransform.height !== undefined && oldTransform.height !== undefined)
    ) {
      const widthChanged =
        newTransform.width !== undefined &&
        oldTransform.width !== undefined &&
        Math.abs(oldTransform.width - newTransform.width) > 0.1
      const heightChanged =
        newTransform.height !== undefined &&
        oldTransform.height !== undefined &&
        Math.abs(oldTransform.height - newTransform.height) > 0.1
      if (widthChanged || heightChanged) return true
    }

    // 检查旋转变化
    if (newTransform.rotation !== undefined && oldTransform.rotation !== undefined) {
      const rotationChanged = Math.abs(oldTransform.rotation - newTransform.rotation) > 0.001 // 约0.06度
      if (rotationChanged) return true
    }

    // 检查透明度变化
    if (newTransform.opacity !== undefined && oldTransform.opacity !== undefined) {
      const opacityChanged = Math.abs(oldTransform.opacity - newTransform.opacity) > 0.001
      if (opacityChanged) return true
    }

    // 检查层级变化
    if (newTransform.zIndex !== undefined && oldTransform.zIndex !== undefined) {
      const zIndexChanged = oldTransform.zIndex !== newTransform.zIndex
      if (zIndexChanged) return true
    }

    // 检查时长变化
    if (newTransform.duration !== undefined && oldTransform.duration !== undefined) {
      const durationChanged = Math.abs(oldTransform.duration - newTransform.duration) > 0
      if (durationChanged) return true
    }

    // 检查倍速变化
    if (newTransform.playbackRate !== undefined && oldTransform.playbackRate !== undefined) {
      const playbackRateChanged =
        Math.abs(oldTransform.playbackRate - newTransform.playbackRate) >= 0.01 // 0.01倍速误差容忍
      if (playbackRateChanged) return true
    }

    // 检查音量变化
    if (newTransform.volume !== undefined && oldTransform.volume !== undefined) {
      const volumeChanged = Math.abs(oldTransform.volume - newTransform.volume) >= 0.01 // 0.01音量误差容忍
      if (volumeChanged) return true
    }

    // 检查静音状态变化
    if (newTransform.isMuted !== undefined && oldTransform.isMuted !== undefined) {
      const muteChanged = oldTransform.isMuted !== newTransform.isMuted
      if (muteChanged) return true
    }

    // 检查增益变化
    if (newTransform.gain !== undefined && oldTransform.gain !== undefined) {
      const gainChanged = Math.abs(oldTransform.gain - newTransform.gain) >= 0.1 // 0.1dB误差容忍
      if (gainChanged) return true
    }

    return false
  }

  // ==================== 时间轴项目历史记录方法 ====================

  /**
   * 带历史记录的添加时间轴项目方法
   * @param timelineItem 要添加的时间轴项目
   */
  async function addTimelineItemWithHistory(timelineItem: UnifiedTimelineItemData<MediaType>) {
    const command = new AddTimelineItemCommand(
      timelineItem,
      unifiedTimelineModule,
      unifiedMediaModule,
      unifiedConfigModule,
    )
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的删除时间轴项目方法
   * @param timelineItemId 要删除的时间轴项目ID
   */
  async function removeTimelineItemWithHistory(timelineItemId: string) {
    const command = new RemoveTimelineItemCommand(
      timelineItemId,
      unifiedTimelineModule,
      unifiedMediaModule,
      unifiedConfigModule,
    )
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的移动时间轴项目方法
   * @param timelineItemId 要移动的时间轴项目ID
   * @param newPositionFrames 新的时间位置（帧数）
   * @param newTrackId 新的轨道ID（可选）
   */
  async function moveTimelineItemWithHistory(
    timelineItemId: string,
    newPositionFrames: number,
    newTrackId?: string,
  ) {
    // 获取要移动的时间轴项目
    const timelineItem = unifiedTimelineModule.getTimelineItem(timelineItemId)
    if (!timelineItem) {
      console.warn(`⚠️ 时间轴项目不存在，无法移动: ${timelineItemId}`)
      return
    }

    // 获取当前位置和轨道
    const oldPositionFrames = timelineItem.timeRange.timelineStartTime // 帧数
    const oldTrackId = timelineItem.trackId || 'default-track' // 提供默认值
    const finalNewTrackId = newTrackId !== undefined ? newTrackId : oldTrackId

    // 检查是否有实际变化
    const positionChanged = Math.abs(oldPositionFrames - newPositionFrames) >= 1 // 允许1帧及以上的变化
    const trackChanged = oldTrackId !== finalNewTrackId

    if (!positionChanged && !trackChanged) {
      console.log('⚠️ 位置和轨道都没有变化，跳过移动操作')
      return
    }

    const command = new MoveTimelineItemCommand(
      timelineItemId,
      oldPositionFrames,
      newPositionFrames,
      oldTrackId,
      finalNewTrackId,
      unifiedTimelineModule,
      unifiedMediaModule,
    )
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的更新变换属性方法（增强版）
   * @param timelineItemId 要更新的时间轴项目ID
   * @param newTransform 新的变换属性
   */
  async function updateTimelineItemTransformWithHistory(
    timelineItemId: string,
    newTransform: TransformProperties,
  ) {
    // 获取要更新的时间轴项目
    const timelineItem = unifiedTimelineModule.getTimelineItem(timelineItemId)
    if (!timelineItem) {
      console.warn(`⚠️ 时间轴项目不存在，无法更新变换属性: ${timelineItemId}`)
      return
    }

    // 获取当前的变换属性（类型安全版本）
    const oldTransform: TransformProperties = {}

    // 检查是否具有视觉属性
    if (TimelineItemQueries.hasVisualProperties(timelineItem)) {
      const config = timelineItem.config as VideoMediaConfig
      if (newTransform.x !== undefined) {
        oldTransform.x = config.x
      }
      if (newTransform.y !== undefined) {
        oldTransform.y = config.y
      }
      if (newTransform.width !== undefined) {
        oldTransform.width = config.width
      }
      if (newTransform.height !== undefined) {
        oldTransform.height = config.height
      }
      if (newTransform.rotation !== undefined) {
        oldTransform.rotation = config.rotation
      }
      if (newTransform.opacity !== undefined) {
        oldTransform.opacity = config.opacity
      }
    }

    if (newTransform.zIndex !== undefined) {
      const config = timelineItem.config as VideoMediaConfig
      oldTransform.zIndex = config.zIndex
    }

    if (newTransform.duration !== undefined) {
      // 计算当前时长（帧数）
      const timeRange = timelineItem.timeRange
      const currentDurationFrames = timeRange.timelineEndTime - timeRange.timelineStartTime
      oldTransform.duration = currentDurationFrames
    }

    if (newTransform.playbackRate !== undefined) {
      // 获取当前倍速（对视频和音频有效）
      oldTransform.playbackRate = 1
      if (
        TimelineItemQueries.isVideoTimelineItem(timelineItem) ||
        TimelineItemQueries.isAudioTimelineItem(timelineItem)
      ) {
        const sprite = timelineItem.runtime.sprite as
          | VideoVisibleSprite
          | AudioVisibleSprite
          | undefined
        if (sprite) {
          oldTransform.playbackRate = sprite.getPlaybackRate()
        }
      }
    }

    // 检查是否具有音频属性
    if (TimelineItemQueries.hasAudioProperties(timelineItem)) {
      const config = timelineItem.config as AudioMediaConfig
      if (newTransform.volume !== undefined) {
        oldTransform.volume = config.volume ?? 1
      }
      if (newTransform.isMuted !== undefined) {
        oldTransform.isMuted = config.isMuted ?? false
      }
    }

    if (timelineItem.mediaType === 'audio' && newTransform.gain !== undefined) {
      // 获取当前增益（仅对音频有效）
      const config = timelineItem.config as AudioMediaConfig
      oldTransform.gain = config.gain ?? 0
    }

    // 检查是否有实际变化
    const hasChanges = checkTransformChanges(oldTransform, newTransform)
    if (!hasChanges) {
      console.log('⚠️ 变换属性没有变化，跳过更新操作')
      return
    }

    const command = new UpdateTransformCommand(
      timelineItemId,
      oldTransform,
      newTransform,
      unifiedTimelineModule,
      unifiedMediaModule,
    )
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的分割时间轴项目方法
   * @param timelineItemId 要分割的时间轴项目ID
   * @param splitTimeFrames 分割时间点（帧数）
   */
  async function splitTimelineItemAtTimeWithHistory(
    timelineItemId: string,
    splitTimeFrames: number,
  ) {
    // 获取要分割的时间轴项目
    const timelineItem = unifiedTimelineModule.getTimelineItem(timelineItemId)
    if (!timelineItem) {
      console.warn(`⚠️ 时间轴项目不存在，无法分割: ${timelineItemId}`)
      return
    }

    const command = new SplitTimelineItemCommand(
      timelineItemId,
      timelineItem,
      splitTimeFrames,
      unifiedTimelineModule,
      unifiedMediaModule,
    )
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的复制时间轴项目方法
   * @param timelineItemId 要复制的时间轴项目ID
   * @param newPositionFrames 新项目的时间位置（帧数，可选）
   * @param newTrackId 新项目的轨道ID（可选）
   */
  async function duplicateTimelineItemWithHistory(
    timelineItemId: string,
    newPositionFrames?: number,
    newTrackId?: string,
  ) {
    // 获取要复制的时间轴项目
    const timelineItem = unifiedTimelineModule.getTimelineItem(timelineItemId)
    if (!timelineItem) {
      console.warn(`⚠️ 时间轴项目不存在，无法复制: ${timelineItemId}`)
      return
    }

    // 计算时间偏移
    const currentPosition = timelineItem.timeRange.timelineStartTime
    const targetPosition = newPositionFrames || timelineItem.timeRange.timelineEndTime
    const timeOffset = targetPosition - currentPosition

    // 使用 TimelineItemFactory 复制项目
    const duplicatedItem = duplicateTimelineItem(
      timelineItem,
      newTrackId || timelineItem.trackId || 'default-track',
      timeOffset,
    )

    // 使用 AddTimelineItemCommand 添加复制后的项目
    const command = new AddTimelineItemCommand(
      duplicatedItem,
      unifiedTimelineModule,
      unifiedMediaModule,
      unifiedConfigModule,
    )
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的调整时间轴项目大小方法
   * @param timelineItemId 要调整的时间轴项目ID
   * @param newTimeRange 新的时间范围
   */
  async function resizeTimelineItemWithHistory(
    timelineItemId: string,
    newTimeRange: UnifiedTimeRange,
  ): Promise<boolean> {
    try {
      console.log('🔧 [UnifiedStore] 调整时间轴项目大小:', {
        timelineItemId,
        newTimeRange,
      })

      // 获取当前项目
      const currentItem = unifiedTimelineModule.getTimelineItem(timelineItemId)
      if (!currentItem) {
        console.error('❌ [UnifiedStore] 时间轴项目不存在:', timelineItemId)
        return false
      }

      // 检查时间范围是否有变化
      const currentTimeRange = currentItem.timeRange
      if (
        currentTimeRange.timelineStartTime === newTimeRange.timelineStartTime &&
        currentTimeRange.timelineEndTime === newTimeRange.timelineEndTime
      ) {
        console.log('ℹ️ [UnifiedStore] 时间范围无变化，跳过调整')
        return true
      }

      // 创建调整大小命令
      const command = new ResizeTimelineItemCommand(
        timelineItemId,
        currentTimeRange,
        newTimeRange,
        unifiedTimelineModule,
        unifiedMediaModule,
      )

      // 执行命令
      await unifiedHistoryModule.executeCommand(command)
      console.log('✅ [UnifiedStore] 时间轴项目大小调整成功')
      return true
    } catch (error) {
      console.error('❌ [UnifiedStore] 调整时间轴项目大小时发生错误:', error)
      return false
    }
  }

  /**
   * 带历史记录的添加轨道方法
   * @param type 轨道类型
   * @param position 插入位置（可选）
   */
  async function addTrackWithHistory(type: UnifiedTrackType = 'video', position?: number) {
    const command = new AddTrackCommand(type, position, unifiedTrackModule)
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的删除轨道方法
   * @param trackId 要删除的轨道ID
   */
  async function removeTrackWithHistory(trackId: string) {
    // 获取要删除的轨道
    const track = unifiedTrackModule.getTrack(trackId)
    if (!track) {
      console.warn(`⚠️ 轨道不存在，无法删除: ${trackId}`)
      return
    }

    const command = new RemoveTrackCommand(
      trackId,
      unifiedTrackModule,
      unifiedTimelineModule,
      unifiedMediaModule,
    )
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的重命名轨道方法
   * @param trackId 要重命名的轨道ID
   * @param newName 新名称
   */
  async function renameTrackWithHistory(trackId: string, newName: string) {
    // 获取要重命名的轨道
    const track = unifiedTrackModule.getTrack(trackId)
    if (!track) {
      console.warn(`⚠️ 轨道不存在，无法重命名: ${trackId}`)
      return
    }

    const command = new RenameTrackCommand(trackId, newName, unifiedTrackModule)
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的自动排列轨道方法
   * 根据轨道ID自动排列该轨道上的所有时间轴项目
   * @param trackId 要排列的轨道ID
   */
  async function autoArrangeTrackWithHistory(trackId: string) {
    const command = new BatchAutoArrangeTrackCommand(
      trackId,
      unifiedTimelineModule.timelineItems.value.filter((item) => item.trackId === trackId),
      unifiedTimelineModule,
      unifiedMediaModule,
      unifiedTrackModule,
    )
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的切换轨道可见性方法
   * @param trackId 要切换的轨道ID
   */
  async function toggleTrackVisibilityWithHistory(trackId: string) {
    // 获取要切换的轨道
    const track = unifiedTrackModule.getTrack(trackId)
    if (!track) {
      console.warn(`⚠️ 轨道不存在，无法切换可见性: ${trackId}`)
      return
    }

    const command = new ToggleTrackVisibilityCommand(trackId, unifiedTrackModule)
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的切换轨道静音方法
   * @param trackId 要切换的轨道ID
   */
  async function toggleTrackMuteWithHistory(trackId: string) {
    // 获取要切换的轨道
    const track = unifiedTrackModule.getTrack(trackId)
    if (!track) {
      console.warn(`⚠️ 轨道不存在，无法切换静音: ${trackId}`)
      return
    }

    const command = new ToggleTrackMuteCommand(trackId, unifiedTrackModule)
    await unifiedHistoryModule.executeCommand(command)
  }

  /**
   * 带历史记录的更新文本内容方法
   * @param timelineItemId 要更新的时间轴项目ID
   * @param newText 新的文本内容
   * @param newStyle 新的文本样式（可选）
   */
  async function updateTextContentWithHistory(
    timelineItemId: string,
    newText: string,
    newStyle: Partial<TextStyleConfig> = {},
  ) {
    // 验证文本项目存在
    const timelineItem = unifiedTimelineModule.getTimelineItem(timelineItemId)
    if (!timelineItem || !TimelineItemQueries.isTextTimelineItem(timelineItem)) {
      console.warn(`⚠️ 文本项目不存在或类型错误: ${timelineItemId}`)
      return
    }

    // 检查文本内容是否有实际变化
    if (timelineItem.config.text === newText.trim() && Object.keys(newStyle).length === 0) {
      console.log('⚠️ 文本内容没有变化，跳过更新操作')
      return
    }

    try {
      console.log('🔄 [useHistoryOperations] 更新文本内容:', {
        timelineItemId,
        newText: newText.substring(0, 20) + (newText.length > 20 ? '...' : ''),
        hasStyleUpdate: Object.keys(newStyle).length > 0,
      })

      // 创建更新文本命令
      const command = new UpdateTextCommand(
        timelineItemId,
        newText.trim(),
        newStyle,
        {
          getTimelineItem: (id: string) =>
            unifiedTimelineModule.getTimelineItem(id) as
              | UnifiedTimelineItemData<'text'>
              | undefined,
          setupBidirectionalSync: unifiedTimelineModule.setupTimelineItemSprite,
        },
        unifiedConfigModule,
      )

      // 执行命令（带历史记录）
      await unifiedHistoryModule.executeCommand(command)

      console.log('✅ [useHistoryOperations] 文本内容更新成功')
    } catch (error) {
      console.error('❌ [useHistoryOperations] 更新文本内容失败:', error)
      throw error
    }
  }

  /**
   * 带历史记录的更新文本样式方法
   * @param timelineItemId 要更新的时间轴项目ID
   * @param newStyle 新的文本样式
   */
  async function updateTextStyleWithHistory(
    timelineItemId: string,
    newStyle: Partial<TextStyleConfig>,
  ) {
    // 验证文本项目存在
    const timelineItem = unifiedTimelineModule.getTimelineItem(timelineItemId)
    if (!timelineItem || !TimelineItemQueries.isTextTimelineItem(timelineItem)) {
      console.warn(`⚠️ 文本项目不存在或类型错误: ${timelineItemId}`)
      return
    }

    // 获取当前样式进行对比
    const currentStyle = timelineItem.config.style
    if (!currentStyle) {
      console.warn(`⚠️ 文本项目样式数据不存在: ${timelineItemId}`)
      return
    }

    // 检查样式是否有实际变化
    const hasChanges = Object.keys(newStyle).some((key) => {
      const styleKey = key as keyof TextStyleConfig
      return newStyle[styleKey] !== currentStyle[styleKey]
    })

    if (!hasChanges) {
      console.log('⚠️ 文本样式没有变化，跳过更新操作')
      return
    }

    try {
      console.log('🔄 [useHistoryOperations] 更新文本样式:', {
        timelineItemId,
        styleChanges: Object.keys(newStyle),
        currentText:
          timelineItem.config.text.substring(0, 20) +
          (timelineItem.config.text.length > 20 ? '...' : ''),
      })

      // 创建更新文本命令（保持文本内容不变，只更新样式）
      const command = new UpdateTextCommand(
        timelineItemId,
        timelineItem.config.text, // 保持文本内容不变
        newStyle,
        {
          getTimelineItem: (id: string) =>
            unifiedTimelineModule.getTimelineItem(id) as
              | UnifiedTimelineItemData<'text'>
              | undefined,
          setupBidirectionalSync: unifiedTimelineModule.setupTimelineItemSprite,
        },
        unifiedConfigModule,
      )

      // 执行命令（带历史记录）
      await unifiedHistoryModule.executeCommand(command)

      console.log('✅ [useHistoryOperations] 文本样式更新成功')
    } catch (error) {
      console.error('❌ [useHistoryOperations] 更新文本样式失败:', error)
      throw error
    }
  }

  /**
   * 带历史记录的选择时间轴项目方法
   * @param itemIds 要操作的项目ID数组
   * @param mode 操作模式：'replace'替换选择，'toggle'切换选择状态
   * @param selectionModule 选择模块实例，提供选择状态和方法
   */
  async function selectTimelineItemsWithHistory(
    itemIds: string[],
    mode: 'replace' | 'toggle' = 'replace',
  ) {
    // 检查是否有实际的选择变化
    const currentSelection = new Set(unifiedSelectionModule.selectedTimelineItemIds.value)
    const newSelection = calculateNewSelection(itemIds, mode, currentSelection)

    // 如果选择状态没有变化，不创建历史记录
    if (setsEqual(currentSelection, newSelection)) {
      console.log('🎯 选择状态无变化，跳过历史记录')
      return
    }

    try {
      console.log('🎯 [useHistoryOperations] 选择时间轴项目:', {
        itemIds,
        mode,
        currentSelectionSize: currentSelection.size,
        newSelectionSize: newSelection.size,
      })

      // 创建选择命令
      const command = new SelectTimelineItemsCommand(
        itemIds,
        mode,
        unifiedSelectionModule,
        unifiedTimelineModule,
        unifiedMediaModule,
      )

      // 执行命令（带历史记录）
      await unifiedHistoryModule.executeCommand(command)

      console.log('✅ [useHistoryOperations] 时间轴项目选择成功')
    } catch (error) {
      console.error('❌ [useHistoryOperations] 时间轴项目选择失败:', error)
      throw error
    }
  }

  /**
   * 计算新的选择状态
   */
  function calculateNewSelection(
    itemIds: string[],
    mode: 'replace' | 'toggle',
    currentSelection: Set<string>,
  ): Set<string> {
    const newSelection = new Set(currentSelection)

    if (mode === 'replace') {
      newSelection.clear()
      itemIds.forEach((id) => newSelection.add(id))
    } else {
      itemIds.forEach((id) => {
        if (newSelection.has(id)) {
          newSelection.delete(id)
        } else {
          newSelection.add(id)
        }
      })
    }

    return newSelection
  }

  /**
   * 检查两个Set是否相等
   */
  function setsEqual(set1: Set<string>, set2: Set<string>): boolean {
    if (set1.size !== set2.size) return false
    for (const item of set1) {
      if (!set2.has(item)) return false
    }
    return true
  }

  /**
   * 带历史记录的创建关键帧方法
   * @param timelineItemId 时间轴项目ID
   * @param frame 帧数
   */
  async function createKeyframeWithHistory(timelineItemId: string, frame: number) {
    try {
      console.log('🎬 [useHistoryOperations] 创建关键帧:', { timelineItemId, frame })

      // 创建关键帧命令
      const command = new CreateKeyframeCommand(
        timelineItemId,
        frame,
        unifiedTimelineModule,
        {
          seekTo: (frame: number) => {
            // 播放头控制应该由调用方提供，这里简化为不控制播放头
            console.log('🔍 关键帧操作播放头控制:', frame)
          },
        },
      )

      // 执行命令（带历史记录）
      await unifiedHistoryModule.executeCommand(command)

      console.log('✅ [useHistoryOperations] 关键帧创建成功')
    } catch (error) {
      console.error('❌ [useHistoryOperations] 关键帧创建失败:', error)
      throw error
    }
  }

  /**
   * 带历史记录的删除关键帧方法
   * @param timelineItemId 时间轴项目ID
   * @param frame 帧数
   */
  async function deleteKeyframeWithHistory(timelineItemId: string, frame: number) {
    try {
      console.log('🎬 [useHistoryOperations] 删除关键帧:', { timelineItemId, frame })

      // 创建删除关键帧命令
      const command = new DeleteKeyframeCommand(
        timelineItemId,
        frame,
        unifiedTimelineModule,
        {
          seekTo: (frame: number) => {
            console.log('🔍 关键帧操作播放头控制:', frame)
          },
        },
      )

      // 执行命令（带历史记录）
      await unifiedHistoryModule.executeCommand(command)

      console.log('✅ [useHistoryOperations] 关键帧删除成功')
    } catch (error) {
      console.error('❌ [useHistoryOperations] 关键帧删除失败:', error)
      throw error
    }
  }

  /**
   * 带历史记录的更新关键帧属性方法
   * @param timelineItemId 时间轴项目ID
   * @param frame 帧数
   * @param property 属性名
   * @param value 新值
   */
  async function updatePropertyWithHistory(
    timelineItemId: string,
    frame: number,
    property: string,
    value: any,
  ) {
    try {
      console.log('🎬 [useHistoryOperations] 更新关键帧属性:', {
        timelineItemId,
        frame,
        property,
        value,
      })

      // 创建更新属性命令
      const command = new UpdatePropertyCommand(
        timelineItemId,
        frame,
        property,
        value,
        unifiedTimelineModule,
        {
          seekTo: (frame: number) => {
            console.log('🔍 关键帧操作播放头控制:', frame)
          },
        },
      )

      // 执行命令（带历史记录）
      await unifiedHistoryModule.executeCommand(command)

      console.log('✅ [useHistoryOperations] 关键帧属性更新成功')
    } catch (error) {
      console.error('❌ [useHistoryOperations] 关键帧属性更新失败:', error)
      throw error
    }
  }

  /**
   * 带历史记录的清除所有关键帧方法
   * @param timelineItemId 时间轴项目ID
   */
  async function clearAllKeyframesWithHistory(timelineItemId: string) {
    try {
      console.log('🎬 [useHistoryOperations] 清除所有关键帧:', { timelineItemId })

      // 创建清除所有关键帧命令
      const command = new ClearAllKeyframesCommand(
        timelineItemId,
        unifiedTimelineModule,
        {
          seekTo: (frame: number) => {
            console.log('🔍 关键帧操作播放头控制:', frame)
          },
        },
      )

      // 执行命令（带历史记录）
      await unifiedHistoryModule.executeCommand(command)

      console.log('✅ [useHistoryOperations] 所有关键帧清除成功')
    } catch (error) {
      console.error('❌ [useHistoryOperations] 清除所有关键帧失败:', error)
      throw error
    }
  }

  /**
   * 带历史记录的切换关键帧方法
   * @param timelineItemId 时间轴项目ID
   * @param frame 帧数
   */
  async function toggleKeyframeWithHistory(timelineItemId: string, frame: number) {
    try {
      console.log('🎬 [useHistoryOperations] 切换关键帧:', { timelineItemId, frame })

      // 创建切换关键帧命令
      const command = new ToggleKeyframeCommand(
        timelineItemId,
        frame,
        unifiedTimelineModule,
        {
          seekTo: (frame: number) => {
            console.log('🔍 关键帧操作播放头控制:', frame)
          },
        },
      )

      // 执行命令（带历史记录）
      await unifiedHistoryModule.executeCommand(command)

      console.log('✅ [useHistoryOperations] 关键帧切换成功')
    } catch (error) {
      console.error('❌ [useHistoryOperations] 关键帧切换失败:', error)
      throw error
    }
  }

  return {
    addTimelineItemWithHistory,
    removeTimelineItemWithHistory,
    moveTimelineItemWithHistory,
    updateTimelineItemTransformWithHistory,
    splitTimelineItemAtTimeWithHistory,
    duplicateTimelineItemWithHistory,
    resizeTimelineItemWithHistory,
    addTrackWithHistory,
    removeTrackWithHistory,
    renameTrackWithHistory,
    autoArrangeTrackWithHistory,
    toggleTrackVisibilityWithHistory,
    toggleTrackMuteWithHistory,
    updateTextContentWithHistory,
    updateTextStyleWithHistory,
    selectTimelineItemsWithHistory,
    createKeyframeWithHistory,
    deleteKeyframeWithHistory,
    updatePropertyWithHistory,
    clearAllKeyframesWithHistory,
    toggleKeyframeWithHistory,
  }
}
