import { useUnifiedStore } from '@/core/unifiedStore'
import { UnifiedMediaItemQueries } from '@/core/mediaitem'
import { generateId } from '@/core/utils/idGenerator'
import type { MediaType } from '@/core/mediaitem/types'
import type {
  UnifiedTimelineItemData,
  GetTimelineItemConfig,
  TimelineItemStatus,
} from '@/core/timelineitem/TimelineItemData'
import type {
  VideoMediaConfig,
  ImageMediaConfig,
  AudioMediaConfig,
  TextMediaConfig,
} from '@/core/timelineitem/TimelineItemData'

/**
 * 时间轴项目操作模块
 * 提供时间轴项目相关的操作功能，包括创建、移动、删除等
 */
export function useTimelineItemOperations() {
  const unifiedStore = useUnifiedStore()

  /**
   * 从素材库项创建时间轴项目
   * @param mediaItemId 素材项目ID
   * @param startTimeFrames 开始时间（帧数）
   * @param trackId 轨道ID
   */
  async function createMediaClipFromMediaItem(
    mediaItemId: string,
    startTimeFrames: number, // 帧数
    trackId?: string,
  ): Promise<void> {
    console.log('🔧 [UnifiedTimeline] 创建时间轴项目从素材库:', mediaItemId)

    // 如果没有指定轨道ID，使用第一个轨道
    if (!trackId) {
      const firstTrack = unifiedStore.tracks[0]
      if (firstTrack) {
        trackId = firstTrack.id
      } else {
        throw new Error('没有可用的轨道')
      }
    }

    try {
      // 等待WebAV初始化完成
      console.log('等待WebAV初始化完成...')
      // await unifiedStore.waitForWebAVReady() // 阻塞直到WebAV初始化完成

      // 获取对应的MediaItem
      const storeMediaItem = unifiedStore.getMediaItem(mediaItemId)
      if (!storeMediaItem) {
        throw new Error('找不到对应的素材项目')
      }

      // 检查素材状态和拖拽条件
      const isReady = UnifiedMediaItemQueries.isReady(storeMediaItem)
      const hasError = UnifiedMediaItemQueries.hasError(storeMediaItem)

      // 只阻止错误状态的素材
      if (hasError) {
        throw new Error('素材解析失败，无法添加到时间轴')
      }

      // 检查媒体类型是否已知 - 阻止未知类型素材创建时间轴项目
      if (storeMediaItem.mediaType === 'unknown') {
        throw new Error('素材类型未确定，请等待检测完成')
      }

      // 现在 mediaType 已经确定不是 'unknown'，可以安全地转换为 MediaType
      const knownMediaType = storeMediaItem.mediaType as MediaType

      // 检查是否有可用的时长信息
      const availableDuration = storeMediaItem.duration
      if (!availableDuration || availableDuration <= 0) {
        throw new Error('素材时长信息不可用，请等待解析完成')
      }

      // 根据素材状态确定时间轴项目状态
      const timelineStatus: TimelineItemStatus = isReady ? 'ready' : 'loading'

      console.log(
        '🎬 [UnifiedTimeline] 创建时间轴项目 for mediaItem:',
        storeMediaItem.id,
        'type:',
        knownMediaType,
      )

      // 获取媒体的原始分辨率（仅对视觉媒体有效）
      let originalResolution: { width: number; height: number } | null = null
      if (UnifiedMediaItemQueries.isVideo(storeMediaItem)) {
        originalResolution = unifiedStore.getVideoOriginalResolution(storeMediaItem.id) || null
        console.log('📐 [UnifiedTimeline] 视频原始分辨率:', originalResolution)
      } else if (UnifiedMediaItemQueries.isImage(storeMediaItem)) {
        originalResolution = unifiedStore.getImageOriginalResolution(storeMediaItem.id) || null
        console.log('📐 [UnifiedTimeline] 图片原始分辨率:', originalResolution)
      } else if (UnifiedMediaItemQueries.isAudio(storeMediaItem)) {
        console.log('🎵 [UnifiedTimeline] 音频类型，无需设置分辨率')
      }

      // 创建增强的默认配置
      const config = createEnhancedDefaultConfig(knownMediaType, originalResolution)

      // 创建时间轴项目数据
      const timelineItemData: UnifiedTimelineItemData = {
        id: generateId(),
        mediaItemId: storeMediaItem.id,
        trackId: trackId,
        mediaType: knownMediaType,
        timeRange: {
          timelineStartTime: startTimeFrames,
          timelineEndTime: startTimeFrames + availableDuration,
          clipStartTime: 0,
          clipEndTime: availableDuration,
        },
        config: config,
        animation: undefined, // 新创建的项目默认没有动画
        timelineStatus: timelineStatus, // 根据素材状态设置时间轴项目状态
        runtime: {}, // 添加必需的 runtime 字段
      }

      console.log('🔄 [UnifiedTimeline] 时间轴项目数据:', {
        id: timelineItemData.id,
        mediaType: timelineItemData.mediaType,
        timeRange: timelineItemData.timeRange,
        config: Object.keys(config),
      })

      // 添加到store（使用带历史记录的方法）
      console.log(
        `📝 [UnifiedTimeline] 添加时间轴项目: ${storeMediaItem.name} -> 轨道${trackId}, 位置${Math.max(0, startTimeFrames)}帧`,
      )
      await unifiedStore.addTimelineItemWithHistory(timelineItemData)

      console.log(`✅ [UnifiedTimeline] 时间轴项目创建完成: ${timelineItemData.id}`)
    } catch (error) {
      console.error('❌ [UnifiedTimeline] 创建时间轴项目失败:', error)
      unifiedStore.messageError(`创建时间轴项目失败：${(error as Error).message}`)
    }
  }

  /**
   * 创建增强的默认配置 - 考虑原始分辨率
   * @param mediaType 媒体类型
   * @param originalResolution 原始分辨率
   * @returns 增强的默认配置
   */
  function createEnhancedDefaultConfig(
    mediaType: MediaType,
    originalResolution: { width: number; height: number } | null,
  ): GetTimelineItemConfig<MediaType> {
    // 根据媒体类型创建对应的默认配置
    switch (mediaType) {
      case 'video': {
        const defaultWidth = originalResolution?.width || 1920
        const defaultHeight = originalResolution?.height || 1080

        return {
          // 视觉属性
          x: 0, // 居中位置（项目坐标系，中心原点）
          y: 0, // 居中位置
          width: defaultWidth,
          height: defaultHeight,
          rotation: 0,
          opacity: 1,
          // 原始尺寸
          originalWidth: defaultWidth,
          originalHeight: defaultHeight,
          // 等比缩放状态（默认开启）
          proportionalScale: true,
          // 音频属性
          volume: 1,
          isMuted: false,
          // 基础属性
          zIndex: 0,
        } as VideoMediaConfig
      }

      case 'image': {
        const defaultWidth = originalResolution?.width || 1920
        const defaultHeight = originalResolution?.height || 1080

        return {
          // 视觉属性
          x: 0, // 居中位置（项目坐标系，中心原点）
          y: 0, // 居中位置
          width: defaultWidth,
          height: defaultHeight,
          rotation: 0,
          opacity: 1,
          // 原始尺寸
          originalWidth: defaultWidth,
          originalHeight: defaultHeight,
          // 等比缩放状态（默认开启）
          proportionalScale: true,
          // 基础属性
          zIndex: 0,
        } as ImageMediaConfig
      }

      case 'audio':
        return {
          // 音频属性
          volume: 1,
          isMuted: false,
          gain: 0, // 默认增益为0dB
          // 基础属性
          zIndex: 0,
        } as AudioMediaConfig

      case 'text':
        return {
          // 文本属性
          text: '新文本',
          style: {
            fontSize: 48,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'normal',
            fontStyle: 'normal',
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.2,
          },
          // 视觉属性
          x: 0, // 居中位置
          y: 0, // 居中位置
          width: 400,
          height: 100,
          rotation: 0,
          opacity: 1,
          originalWidth: 400,
          originalHeight: 100,
          proportionalScale: true,
          // 基础属性
          zIndex: 0,
        } as TextMediaConfig

      default:
        // 由于类型系统已经约束为 MediaType，不应该到达这里
        throw new Error(`不支持的媒体类型: ${mediaType}`)
    }
  }

  /**
   * 移动单个项目
   * @param itemId 项目ID
   * @param newTimeFrames 新时间位置（帧数）
   * @param newTrackId 新轨道ID
   */
  async function moveSingleItem(itemId: string, newTimeFrames: number, newTrackId: string) {
    // newTimeFrames 是帧数，直接传给 handleTimelineItemPositionUpdate
    await handleTimelineItemPositionUpdate(itemId, newTimeFrames, newTrackId)
  }

  /**
   * 移动多个项目（保持相对位置）
   * @param itemIds 项目ID数组
   * @param newTimeFrames 新时间位置（帧数）
   * @param newTrackId 新轨道ID
   * @param originalStartTimeFrames 原始开始时间（帧数）
   */
  async function moveMultipleItems(
    itemIds: string[],
    newTimeFrames: number,
    newTrackId: string,
    originalStartTimeFrames: number,
  ) {
    console.log('🔄 [UnifiedTimeline] 开始批量移动项目:', {
      itemIds,
      newTimeFrames,
      newTrackId,
      originalStartTimeFrames,
    })

    // 计算时间偏移量（帧数）
    const timeOffsetFrames = newTimeFrames - originalStartTimeFrames

    // 批量移动所有选中的项目
    for (const itemId of itemIds) {
      const item = unifiedStore.getTimelineItem(itemId)
      if (item) {
        const currentStartTimeFrames = item.timeRange.timelineStartTime // 帧数
        const newStartTimeFrames = currentStartTimeFrames + timeOffsetFrames

        // 确保新位置不为负数（防止多选拖拽时某些项目被拖到负数时间轴）
        const clampedNewStartTimeFrames = Math.max(0, newStartTimeFrames)

        // 对于第一个项目，使用目标轨道；其他项目保持相对轨道关系
        const targetTrack = itemId === itemIds[0] ? newTrackId : item.trackId

        // 直接传递帧数给 handleTimelineItemPositionUpdate
        await handleTimelineItemPositionUpdate(itemId, clampedNewStartTimeFrames, targetTrack)
      }
    }
  }

  /**
   * 处理时间轴项目位置更新
   * @param timelineItemId 时间轴项目ID
   * @param newPositionFrames 新位置（帧数）
   * @param newTrackId 新轨道ID
   */
  async function handleTimelineItemPositionUpdate(
    timelineItemId: string,
    newPositionFrames: number,
    newTrackId?: string,
  ) {
    // 使用带历史记录的移动方法
    await unifiedStore.moveTimelineItemWithHistory(timelineItemId, newPositionFrames, newTrackId)
  }

  /**
   * 处理时间轴项目删除
   * @param timelineItemId 时间轴项目ID
   */
  async function handleTimelineItemRemove(timelineItemId: string) {
    const item = unifiedStore.getTimelineItem(timelineItemId)
    if (item) {
      const mediaItem = unifiedStore.getMediaItem(item.mediaItemId)
      console.log(`🗑️ 准备从时间轴删除项目: ${mediaItem?.name || '未知'} (ID: ${timelineItemId})`)

      // 使用统一架构的删除方法
      await unifiedStore.removeTimelineItemWithHistory(timelineItemId)
      console.log(`✅ 时间轴项目删除完成: ${timelineItemId}`)
    }
  }

  /**
   * 在指定位置创建文本项目
   * @param trackId 轨道ID
   * @param timePosition 时间位置（帧数）
   */
  async function createTextAtPosition(trackId: string, timePosition: number) {
    try {
      console.log('🔄 [UnifiedTimeline] 开始创建文本项目:', { trackId })

      // 导入统一架构的文本时间轴工具函数
      const { createTextTimelineItem } = await import('../utils/textTimelineUtils')

      // 创建文本时间轴项目（使用工具函数，对齐旧架构）
      const textItem = await createTextTimelineItem(
        '默认文本', // 默认文本内容
        { fontSize: 48, color: '#ffffff' }, // 默认样式
        timePosition, // 开始时间（帧数）
        trackId, // 轨道ID
        150, // 默认时长（5秒@30fps）
        unifiedStore.videoResolution, // 视频分辨率
      )

      // 添加到时间轴（带历史记录）
      await unifiedStore.addTimelineItemWithHistory(textItem)

      console.log('✅ [UnifiedTimeline] 文本项目创建成功:', {
        id: textItem.id,
        text: textItem.config.text,
        position: timePosition,
      })

      // 选中新创建的文本项目
      unifiedStore.selectTimelineItem(textItem.id)
    } catch (error) {
      console.error('❌ [UnifiedTimeline] 创建文本项目失败:', error)
      unifiedStore.messageError(`创建文本项目失败：${(error as Error).message}`)
    }
  }

  return {
    // 方法
    createMediaClipFromMediaItem,
    createEnhancedDefaultConfig,
    moveSingleItem,
    moveMultipleItems,
    handleTimelineItemPositionUpdate,
    handleTimelineItemRemove,
    createTextAtPosition,
  }
}
