import { ref, type Raw, type Ref } from 'vue'
import { cleanupTimelineItemBunny } from '@/core/bunnyUtils/timelineItemSetup'
import type { VisibleSprite } from '@webav/av-cliper'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import { TimelineItemQueries } from '@/core/timelineitem/queries'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { UnifiedTrackData } from '@/core/track/TrackTypes'
import type { MediaType } from '@/core/mediaitem/types'
import type { VideoMediaConfig, ImageMediaConfig, TextMediaConfig } from '@/core/timelineitem/type'
import { VideoVisibleSprite } from '@/core/visiblesprite/VideoVisibleSprite'
import { ImageVisibleSprite } from '@/core/visiblesprite/ImageVisibleSprite'
import { AudioVisibleSprite } from '@/core/visiblesprite/AudioVisibleSprite'
import { webavToProjectCoords, projectToWebavCoords } from '@/core/utils/coordinateUtils'
import type { VideoResolution } from '@/core/types'
import { ModuleRegistry, MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedConfigModule } from './UnifiedConfigModule'
import type { UnifiedWebavModule } from './UnifiedWebavModule'
import type { UnifiedTrackModule } from './UnifiedTrackModule'
import type { UnifiedMediaModule } from './UnifiedMediaModule'
import type { UnifiedSelectionModule } from './UnifiedSelectionModule'

/**
 * 扩展的WebAV属性变化事件类型
 * 在原有PropsChangeEvent基础上添加opacity属性支持
 */
interface ExtendedPropsChangeEvent {
  rect?: {
    x?: number
    y?: number
    w?: number
    h?: number
    angle?: number
  }
  zIndex?: number
  opacity?: number
  // 文本更新事件数据
  textUpdate?: {
    text: string
    style: any
    needsRecreation: boolean
  }
  // 未来可扩展其他属性
}

// 临时调试函数，适用于统一类型
function unifiedDebugLog(operation: string, details: any) {
  if (import.meta.env.DEV) {
    console.log(`🎬 [UnifiedTimelineModule] ${operation}:`, details)
  }
}
import { isReady, isVideoTimelineItem, isAudioTimelineItem } from '@/core/timelineitem/queries'
import { adjustKeyframesForDurationChange } from '@/core/utils/unifiedKeyframeUtils'
import { TimelineItemFactory } from '../timelineitem'

/**
 * 统一时间轴核心管理模块
 * 基于新架构的统一类型系统重构的时间轴管理功能
 *
 * 主要变化：
 * 1. 使用 UnifiedTimelineItemData 替代原有的 LocalTimelineItem 和 AsyncProcessingTimelineItem
 * 2. 使用统一的状态管理系统（3状态：ready|loading|error）
 * 3. 保持与原有模块相同的API接口，便于迁移
 * 4. 支持更丰富的时间轴项目状态和属性管理
 */
export function createUnifiedTimelineModule(registry: ModuleRegistry) {
  // ==================== 状态定义 ====================

  const timelineItems = ref<UnifiedTimelineItemData<MediaType>[]>([])

  // ==================== 时间轴管理方法 ====================

  /**
   * 添加时间轴项目
   * @param timelineItem 要添加的时间轴项目
   */
  async function addTimelineItem(timelineItem: UnifiedTimelineItemData<MediaType>) {
    // 检查时间轴项目状态
    if (TimelineItemQueries.isLoading(timelineItem)) {
      // 加载中的时间轴项目不需要sprite相关的设置
      unifiedDebugLog('添加加载中的时间轴项目', { timelineItemId: timelineItem.id })
    } else if (TimelineItemQueries.isReady(timelineItem)) {
      // 设置sprite属性
      // await setupTimelineItemSprite(timelineItem)
    } else {
      // 错误状态的时间轴项目
      unifiedDebugLog('添加错误状态的时间轴项目', { timelineItemId: timelineItem.id })
    }

    timelineItems.value.push(timelineItem)
  }

  /**
   * 移除时间轴项目
   * @param timelineItemId 要移除的时间轴项目ID
   */
  async function removeTimelineItem(timelineItemId: string) {
    const index = timelineItems.value.findIndex(
      (item: UnifiedTimelineItemData<MediaType>) => item.id === timelineItemId,
    )
    if (index > -1) {
      // 直接使用registry.get获取所需模块
      const webavModule = registry.get<UnifiedWebavModule>(MODULE_NAMES.WEBAV)
      const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)
      const selectionModule = registry.get<UnifiedSelectionModule>(MODULE_NAMES.SELECTION)

      const item = timelineItems.value[index]
      const mediaItem = mediaModule.getMediaItem(item.mediaItemId)

      // 🆕 同步清理选择集合中的对应ID
      if (selectionModule.isTimelineItemSelected(timelineItemId)) {
        selectionModule.removeFromMultiSelection(timelineItemId)
        console.log(`🗑️ 已从选择集合中移除已删除的项目: ${timelineItemId}`)
      }

      // 🆕 清理 Bunny 相关资源
      try {
        console.log(`🧹 开始清理时间轴项目Bunny资源: ${timelineItemId}`)
        await cleanupTimelineItemBunny(item)
        console.log(`✅ 成功清理Bunny资源: ${timelineItemId}`)
      } catch (error) {
        console.warn(`⚠️ 清理Bunny资源时出错: ${timelineItemId}`, error)
      }

      // 检查时间轴项目状态
      if (TimelineItemQueries.isLoading(item) || TimelineItemQueries.hasError(item)) {
        // 加载中或错误状态的时间轴项目不需要额外清理sprite相关资源
        // （已经在上面统一处理）
        unifiedDebugLog('移除非就绪状态的时间轴项目', {
          timelineItemId,
          status: item.timelineStatus,
        })
      } else if (TimelineItemQueries.isReady(item)) {
        // 动画管理器已迁移到 Bunny 组件，无需清理
      }

      // 从数组中移除
      timelineItems.value.splice(index, 1)

      unifiedDebugLog('从时间轴删除素材', {
        timelineItemId,
        mediaItemId: item.mediaItemId,
        mediaItemName: mediaItem?.name || '未知',
        trackId: item.trackId,
        position: item.timeRange.timelineStartTime / 30, // timelineStartTime 是帧数，除以30得到秒数
        status: item.timelineStatus,
        mediaType: item.mediaType,
      })
    }
  }

  /**
   * 获取时间轴项目
   * @param timelineItemId 时间轴项目ID
   * @returns 时间轴项目或undefined
   */
  function getTimelineItem(timelineItemId: string): UnifiedTimelineItemData<MediaType> | undefined {
    return timelineItems.value.find(
      (item: UnifiedTimelineItemData<MediaType>) => item.id === timelineItemId,
    )
  }

  /**
   * 获取就绪状态的时间轴项目（过滤掉加载中和错误状态的项目）
   * @param timelineItemId 时间轴项目ID
   * @returns 就绪状态的时间轴项目或undefined
   */
  function getReadyTimelineItem(
    timelineItemId: string,
  ): UnifiedTimelineItemData<MediaType> | undefined {
    const item = getTimelineItem(timelineItemId)
    return item && item.timelineStatus === 'ready' ? item : undefined
  }

  /**
   * 更新时间轴项目位置
   * @param timelineItemId 时间轴项目ID
   * @param newPositionFrames 新位置（帧数）
   * @param newTrackId 新轨道ID（可选）
   */
  function updateTimelineItemPosition(
    timelineItemId: string,
    newPositionFrames: number,
    newTrackId?: string,
  ) {
    const item = getTimelineItem(timelineItemId)
    if (item) {
      // 直接使用registry.get获取所需模块
      const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)
      const trackModule = registry.get<UnifiedTrackModule>(MODULE_NAMES.TRACK)

      const oldPositionFrames = item.timeRange.timelineStartTime // 帧数
      const oldTrackId = item.trackId
      const mediaItem = mediaModule.getMediaItem(item.mediaItemId)

      // 确保新位置不为负数
      const clampedNewPositionFrames = Math.max(0, newPositionFrames)

      // 更新时间轴位置
      const durationFrames = item.timeRange.timelineEndTime - item.timeRange.timelineStartTime // 帧数
      TimelineItemFactory.setTimeRange(item, {
        timelineStartTime: clampedNewPositionFrames, // 帧数
        timelineEndTime: clampedNewPositionFrames + durationFrames, // 帧数
      })

      unifiedDebugLog('更新时间轴项目位置', {
        timelineItemId,
        mediaItemName: mediaItem?.name || '未知',
        oldPositionFrames: oldPositionFrames,
        newPositionFrames: clampedNewPositionFrames,
        originalNewPositionFrames: newPositionFrames,
        oldTrackId,
        newTrackId: item.trackId,
        positionChanged: oldPositionFrames !== clampedNewPositionFrames,
        trackChanged: oldTrackId !== item.trackId,
        positionClamped: newPositionFrames !== clampedNewPositionFrames,
        status: item.timelineStatus,
        mediaType: item.mediaType,
      })
    }
  }

  /**
   * 更新UnifiedTimelineItem的变换属性
   * 直接设置到 item.config 中，不设置到 sprite
   */
  function updateTimelineItemTransform(
    timelineItemId: string,
    transform: {
      x?: number
      y?: number
      width?: number
      height?: number
      rotation?: number
      opacity?: number
      zIndex?: number
    },
  ) {
    const item = getReadyTimelineItem(timelineItemId)
    if (!item) return

    try {
      // hasVisualProperties 类型守卫确保了 config 具有视觉属性
      if (TimelineItemQueries.hasVisualProperties(item)) {
        const config = item.config as VideoMediaConfig | ImageMediaConfig | TextMediaConfig

        // 直接更新 config 中的属性
        if (transform.x !== undefined) {
          config.x = transform.x
        }
        if (transform.y !== undefined) {
          config.y = transform.y
        }
        if (transform.width !== undefined) {
          config.width = transform.width
        }
        if (transform.height !== undefined) {
          config.height = transform.height
        }
        if (transform.rotation !== undefined) {
          config.rotation = transform.rotation
        }
        if (transform.opacity !== undefined) {
          config.opacity = transform.opacity
        }
        if (transform.zIndex !== undefined) {
          item.config.zIndex = transform.zIndex
        }
      }
    } catch (error) {
      console.error('更新时间轴项目变换属性失败:', error)
    }
  }

  /**
   * 更新时间轴项目播放速度
   * @param timelineItemId 时间轴项目ID
   * @param newRate 新的播放速度
   */
  function updateTimelineItemPlaybackRate(timelineItemId: string, newRate: number) {
    const item = getTimelineItem(timelineItemId)
    if (item) {
      // 确保播放速度在合理范围内（扩展到0.1-100倍）
      const clampedRate = Math.max(0.1, Math.min(100, newRate))

      // 🎯 关键帧位置调整：在更新播放速度之前计算时长变化
      let oldDurationFrames = 0
      let newDurationFrames = 0

      if (isVideoTimelineItem(item)) {
        const clipDurationFrames = item.timeRange.clipEndTime - item.timeRange.clipStartTime
        oldDurationFrames = item.timeRange.timelineEndTime - item.timeRange.timelineStartTime
        newDurationFrames = Math.round(clipDurationFrames / clampedRate)

        // 如果有关键帧，先调整位置
        if (item.animation && item.animation.keyframes.length > 0) {
          adjustKeyframesForDurationChange(item, oldDurationFrames, newDurationFrames)
          console.log('🎬 [Playback Rate] Keyframes adjusted for speed change:', {
            oldRate: clampedRate,
            newRate: clampedRate,
            oldDuration: oldDurationFrames,
            newDuration: newDurationFrames,
          })
        }
      }

      // 🎯 直接计算新的时间范围并使用 TimelineItemFactory.setTimeRange 设置
      const clipDurationFrames = item.timeRange.clipEndTime - item.timeRange.clipStartTime
      const newTimelineDurationFrames = Math.round(clipDurationFrames / clampedRate)
      const newTimelineEndTime = item.timeRange.timelineStartTime + newTimelineDurationFrames

      TimelineItemFactory.setTimeRange(item, {
        timelineEndTime: newTimelineEndTime,
      })
    }
  }

  // ==================== 导出接口 ====================

  return {
    // 状态
    timelineItems,

    // 方法
    addTimelineItem,
    removeTimelineItem,
    getTimelineItem,
    getReadyTimelineItem,
    updateTimelineItemPosition,
    updateTimelineItemTransform,
    updateTimelineItemPlaybackRate,
  }
}

// 导出类型定义
export type UnifiedTimelineModule = ReturnType<typeof createUnifiedTimelineModule>
