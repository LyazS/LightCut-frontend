import { ref, type Raw, type Ref } from 'vue'
import { cleanupTimelineItemBunny } from '@/core/bunnyUtils/timelineItemSetup'
import type { VisibleSprite } from '@webav/av-cliper'
import type {
  UnifiedTimelineItemData,
  UnknownMediaConfig,
} from '@/core/timelineitem/TimelineItemData'
import { TimelineItemQueries } from '@/core/timelineitem/TimelineItemQueries'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { UnifiedTrackData } from '@/core/track/TrackTypes'
import type { MediaType } from '@/core/mediaitem/types'
import type {
  VideoMediaConfig,
  ImageMediaConfig,
  TextMediaConfig,
} from '@/core/timelineitem/TimelineItemData'
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
import { syncTimeRange } from '@/core/utils/timeRangeUtils'
import { microsecondsToFrames, framesToTimecode } from '@/core/utils/timeUtils'
import { hasAudioCapabilities } from '@/core/utils/spriteTypeGuards'
import {
  globalWebAVAnimationManager,
  updateWebAVAnimation,
} from '@/core/utils/webavAnimationManager'
import {
  isReady,
  isVideoTimelineItem,
  isAudioTimelineItem,
} from '@/core/timelineitem/TimelineItemQueries'
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

  // ==================== 双向数据同步函数 ====================

  /**
   * 为UnifiedTimelineItem设置双向数据同步（类型安全版本）
   *
   * 数据流向说明：
   * 本系统采用分层数据流向策略：
   *
   * 【动画属性】- 遵循标准数据流向 UI → WebAV → TimelineItem → UI：
   * - x, y, width, height, rotation, zIndex
   * - 这些属性WebAV支持propsChange事件，可以自动同步
   *
   * 【非动画属性】- 直接修改config（技术限制导致的必要妥协）：
   * - opacity: 通过自定义回调实现类似数据流向
   * - volume, isMuted: WebAV不支持相关事件，只能直接修改config
   */
  function setupBidirectionalSync(timelineItem: UnifiedTimelineItemData<MediaType>) {
    // 只有已知类型且就绪状态的时间轴项目才需要双向同步
    if (!TimelineItemQueries.isReady(timelineItem)) {
      return
    }

    const sprite = timelineItem.runtime.sprite
    if (!sprite) {
      return
    }

    // 直接使用registry.get获取所需模块
    const configModule = registry.get<UnifiedConfigModule>(MODULE_NAMES.CONFIG)

    unifiedDebugLog('设置双向同步', { timelineItemId: timelineItem.id })

    // 直接使用WebAV原生的propsChange事件监听器
    // 设置VisibleSprite → TimelineItem 的同步（仅适用于动画属性）
    sprite.on('propsChange', (changedProps: ExtendedPropsChangeEvent) => {
      if (changedProps.rect && TimelineItemQueries.hasVisualProperties(timelineItem)) {
        const rect = changedProps.rect

        // 更新位置（坐标系转换）
        // 如果rect.x/rect.y为undefined，说明位置没有变化，使用sprite的当前值
        const currentRect = sprite.rect
        // hasVisualProps 类型守卫确保了 config 具有视觉属性
        const config = timelineItem.config as VideoMediaConfig | ImageMediaConfig | TextMediaConfig
        const projectCoords = webavToProjectCoords(
          rect.x !== undefined ? rect.x : currentRect.x,
          rect.y !== undefined ? rect.y : currentRect.y,
          rect.w !== undefined ? rect.w : config.width,
          rect.h !== undefined ? rect.h : config.height,
          configModule.videoResolution.value.width,
          configModule.videoResolution.value.height,
        )
        config.x = Math.round(projectCoords.x)
        config.y = Math.round(projectCoords.y)

        // 更新尺寸
        if (rect.w !== undefined) config.width = rect.w
        if (rect.h !== undefined) config.height = rect.h

        // 更新旋转角度
        if (rect.angle !== undefined) config.rotation = rect.angle

        // console.log('🔄 VisibleSprite → TimelineItem 同步:', {
        //   webavCoords: { x: rect.x, y: rect.y },
        //   projectCoords: { x: config.x, y: config.y },
        //   size: { w: config.width, h: config.height },
        //   rotation: config.rotation
        // })
      }

      // 同步zIndex属性
      if (changedProps.zIndex !== undefined) {
        ;(timelineItem.config as any).zIndex = changedProps.zIndex
      }

      // 同步opacity属性（使用新的事件系统）
      // 📝 现在 opacity 变化通过 propsChange 事件统一处理
      if (
        changedProps.opacity !== undefined &&
        TimelineItemQueries.hasVisualProperties(timelineItem)
      ) {
        // hasVisualProps 类型守卫确保了 config 具有视觉属性
        const config = timelineItem.config as VideoMediaConfig | ImageMediaConfig | TextMediaConfig
        config.opacity = changedProps.opacity
      }
    })
  }

  // ==================== 时间轴管理方法 ====================

  /**
   * 设置时间轴项目的Sprite属性
   * @param timelineItem 要设置的时间轴项目
   */
  async function setupTimelineItemSprite(
    timelineItem: UnifiedTimelineItemData<MediaType>,
  ): Promise<void> {
    if (!timelineItem.runtime.sprite) return

    // 直接使用registry.get获取所需模块
    const configModule = registry.get<UnifiedConfigModule>(MODULE_NAMES.CONFIG)
    const webavModule = registry.get<UnifiedWebavModule>(MODULE_NAMES.WEBAV)
    const trackModule = registry.get<UnifiedTrackModule>(MODULE_NAMES.TRACK)

    const sprite = timelineItem.runtime.sprite

    // 设置时间范围
    sprite.setTimeRange(timelineItem.timeRange)

    // 对于视觉项目设置变换
    if (TimelineItemQueries.hasVisualProperties(timelineItem)) {
      const config = timelineItem.config
      if (
        config.x !== undefined &&
        config.y !== undefined &&
        config.width !== undefined &&
        config.height !== undefined
      ) {
        // 根据新尺寸重新计算WebAV坐标
        const webavCoords = projectToWebavCoords(
          config.x,
          config.y,
          config.width,
          config.height,
          configModule.videoResolution.value.width,
          configModule.videoResolution.value.height,
        )
        sprite.rect.x = webavCoords.x
        sprite.rect.y = webavCoords.y
      }
      if (config.width !== undefined) sprite.rect.w = config.width
      if (config.height !== undefined) sprite.rect.h = config.height
      if (config.opacity !== undefined) sprite.opacity = config.opacity
      if (config.rotation !== undefined) sprite.rect.angle = config.rotation
      sprite.zIndex = config.zIndex
    }

    // 根据轨道的可见性和静音状态设置sprite属性
    const track = trackModule.tracks.value.find((t) => t.id === timelineItem.trackId)
    if (track) {
      // 设置可见性
      sprite.visible = track.isVisible

      // 为具有音频功能的片段设置静音状态
      if (sprite && hasAudioCapabilities(sprite)) {
        sprite.setTrackMuted(track.isMuted)
      }
    }

    // 应用动画配置到sprite（如果有）
    if (timelineItem.animation && timelineItem.animation.keyframes.length > 0) {
      try {
        console.log(`🎬 [UnifiedTimelineModule] 应用动画配置到sprite: ${timelineItem.id}`, {
          keyframeCount: timelineItem.animation.keyframes.length,
        })

        // 使用WebAVAnimationManager来应用动画
        await updateWebAVAnimation(timelineItem)

        console.log(`✅ [UnifiedTimelineModule] 动画配置应用成功: ${timelineItem.id}`)
      } catch (animationError) {
        console.error(
          `❌ [UnifiedTimelineModule] 应用动画配置失败: ${timelineItem.id}`,
          animationError,
        )
        // 动画应用失败不影响后续操作
      }
    }

    // 设置双向数据同步（仅就绪状态的已知类型时间轴项目）
    setupBidirectionalSync(timelineItem)

    // 添加sprite到WebAV画布
    if (sprite) {
      await webavModule.addSprite(sprite)
    }
  }

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

      // 初始化动画管理器（仅就绪状态的已知类型时间轴项目）
      globalWebAVAnimationManager.addManager(timelineItem)
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

      // 🆕 增强的清理逻辑：无论状态如何，都检查并清理sprite
      if (item.runtime.sprite) {
        try {
          console.log(`🧹 开始清理时间轴项目sprite: ${timelineItemId}`)
          webavModule.removeSprite(item.runtime.sprite)
          console.log(`✅ 成功从WebAV画布移除sprite: ${timelineItemId}`)
        } catch (error) {
          console.warn(`⚠️ 从WebAV画布移除sprite时出错: ${timelineItemId}`, error)
        }
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
        // 清理动画管理器（仅就绪状态的已知类型时间轴项目）
        globalWebAVAnimationManager.removeManager(timelineItemId)
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

      // 如果指定了新轨道，更新轨道ID
      if (newTrackId !== undefined) {
        item.trackId = newTrackId

        // 根据新轨道的可见性设置sprite的visible属性（仅就绪状态的已知类型时间轴项目）
        if (TimelineItemQueries.isReady(item)) {
          const newTrack = trackModule.tracks.value.find((t) => t.id === newTrackId)
          if (newTrack && item.runtime.sprite) {
            item.runtime.sprite.visible = newTrack.isVisible
          }
        }
      }

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
   * 更新UnifiedTimelineItem的VisibleSprite变换属性
   * 这会触发propsChange事件，自动同步到TimelineItem，然后更新属性面板显示
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
    if (!item || !item.runtime.sprite) return

    // 直接使用registry.get获取所需模块
    const configModule = registry.get<UnifiedConfigModule>(MODULE_NAMES.CONFIG)

    const sprite = item.runtime.sprite

    try {
      // 更新尺寸时使用中心缩放 - 仅对视觉媒体有效
      if (
        (transform.width !== undefined || transform.height !== undefined) &&
        TimelineItemQueries.hasVisualProperties(item)
      ) {
        // 获取当前中心位置（项目坐标系）
        // hasVisualProperties 类型守卫确保了 config 具有视觉属性
        const config = item.config as VideoMediaConfig | ImageMediaConfig | TextMediaConfig
        const currentCenterX = config.x
        const currentCenterY = config.y
        const newWidth = transform.width !== undefined ? transform.width : config.width
        const newHeight = transform.height !== undefined ? transform.height : config.height

        // 中心缩放：保持中心位置不变，更新尺寸
        sprite.rect.w = newWidth
        sprite.rect.h = newHeight

        // 根据新尺寸重新计算WebAV坐标（保持中心位置不变）
        const webavCoords = projectToWebavCoords(
          currentCenterX,
          currentCenterY,
          newWidth,
          newHeight,
          configModule.videoResolution.value.width,
          configModule.videoResolution.value.height,
        )
        sprite.rect.x = webavCoords.x
        sprite.rect.y = webavCoords.y
      }

      // 更新位置（需要坐标系转换）- 仅对视觉媒体有效
      if (
        (transform.x !== undefined || transform.y !== undefined) &&
        TimelineItemQueries.hasVisualProperties(item)
      ) {
        // hasVisualProperties 类型守卫确保了 config 具有视觉属性
        const config = item.config as VideoMediaConfig | ImageMediaConfig | TextMediaConfig
        const newX = transform.x !== undefined ? transform.x : config.x
        const newY = transform.y !== undefined ? transform.y : config.y

        // 🔧 使用当前的尺寸（可能已经在上面更新过）
        const currentWidth = transform.width !== undefined ? transform.width : config.width
        const currentHeight = transform.height !== undefined ? transform.height : config.height

        const webavCoords = projectToWebavCoords(
          newX,
          newY,
          currentWidth,
          currentHeight,
          configModule.videoResolution.value.width,
          configModule.videoResolution.value.height,
        )
        sprite.rect.x = webavCoords.x
        sprite.rect.y = webavCoords.y
      }

      // 更新其他属性
      if (transform.opacity !== undefined && TimelineItemQueries.hasVisualProperties(item)) {
        sprite.opacity = transform.opacity
        // 🔧 手动同步opacity到timelineItem（因为opacity没有propsChange回调）
        // hasVisualProperties 类型守卫确保了 config 具有视觉属性
        const config = item.config as VideoMediaConfig | ImageMediaConfig | TextMediaConfig
        config.opacity = transform.opacity
      }
      if (transform.zIndex !== undefined) {
        sprite.zIndex = transform.zIndex
        // zIndex有propsChange回调，会自动同步到timelineItem
      }
      // 更新旋转角度（WebAV的rect.angle支持旋转）
      if (transform.rotation !== undefined) {
        sprite.rect.angle = transform.rotation
      }
    } catch (error) {
      console.error('更新VisibleSprite变换属性失败:', error)
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

      // 更新sprite的播放速度（这会自动更新sprite内部的timeRange）
      // 视频和音频sprite都有setPlaybackRate方法
      if (isReady(item) && item.runtime.sprite) {
        if (isVideoTimelineItem(item)) {
          ;(item.runtime.sprite as VideoVisibleSprite).setPlaybackRate(clampedRate)
        } else if (isAudioTimelineItem(item)) {
          ;(item.runtime.sprite as AudioVisibleSprite).setPlaybackRate(clampedRate)
        }
      }

      // 使用同步函数更新TimelineItem的timeRange
      syncTimeRange(item)

      // 如果有动画，需要重新设置WebAV动画时长
      if (item.animation && item.animation.keyframes.length > 0) {
        // 异步更新动画，不阻塞播放速度调整
        updateWebAVAnimation(item)
          .then(() => {
            console.log('🎬 [Playback Rate] Animation duration updated after playback rate change')
          })
          .catch((error) => {
            console.error('🎬 [Playback Rate] Failed to update animation duration:', error)
          })
      }

      // 只有视频才记录详细的时间范围信息
      if (isVideoTimelineItem(item)) {
        const clipDurationFrames = microsecondsToFrames(
          item.timeRange.clipEndTime - item.timeRange.clipStartTime,
        )
        const timelineDurationFrames = microsecondsToFrames(
          item.timeRange.timelineEndTime - item.timeRange.timelineStartTime,
        )

        console.log('🎬 播放速度更新:', {
          timelineItemId,
          newRate: clampedRate,
          timeRange: {
            clipDuration: framesToTimecode(clipDurationFrames),
            timelineDuration: framesToTimecode(timelineDurationFrames),
          },
        })
      } else if (isAudioTimelineItem(item)) {
        console.log('🎬 [ClipOperations] 音频播放速度调整:', {
          timelineItemId,
          newRate: clampedRate,
        })
      } else {
        console.log('🎬 [ClipOperations] 图片不支持播放速度调整:', { timelineItemId })
      }
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
    setupBidirectionalSync,
    setupTimelineItemSprite,
    getReadyTimelineItem,
    updateTimelineItemPosition,
    updateTimelineItemTransform,
    updateTimelineItemPlaybackRate,
  }
}

// 导出类型定义
export type UnifiedTimelineModule = ReturnType<typeof createUnifiedTimelineModule>
