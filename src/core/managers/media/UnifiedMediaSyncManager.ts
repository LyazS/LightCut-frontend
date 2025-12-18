/**
 * 统一媒体同步管理器
 * 合并 setupCommandMediaSync 和 setupProjectLoadMediaSync 的功能
 */

import { watch } from 'vue'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/TimelineItemData'
import type { VideoMediaConfig, ImageMediaConfig } from '@/core/timelineitem/TimelineItemData'
import { UnifiedMediaItemQueries } from '@/core/mediaitem'
import { TimelineItemQueries } from '@/core/timelineitem/TimelineItemQueries'
import { useUnifiedStore } from '@/core/unifiedStore'
import { createSpriteFromUnifiedMediaItem } from '@/core/utils/spriteFactory'
import {
  globalWebAVAnimationManager,
  updateWebAVAnimation,
} from '@/core/utils/webavAnimationManager'
import { projectToWebavCoords } from '@/core/utils/coordinateTransform'
import { hasAudioCapabilities } from '@/core/utils/spriteTypeGuards'
/**
 * 媒体同步信息接口
 */
interface MediaSyncInfo {
  id: string // 唯一标识符，可以是 commandId 或 timelineItemId
  commandId?: string // 命令ID（可选）
  mediaItemId: string // 媒体项目ID
  timelineItemId?: string // 时间轴项目ID（可选）
  unwatch: () => void // 取消监听函数
  scenario: 'command' | 'projectLoad' // 使用场景
  description?: string // 描述信息
}

/**
 * 统一媒体同步管理器
 * 合并了 SimplifiedMediaSyncManager 和 ProjectLoadMediaSyncManager 的功能
 */
export class UnifiedMediaSyncManager {
  private static instance: UnifiedMediaSyncManager
  private syncMap = new Map<string, MediaSyncInfo>()

  private constructor() {}

  static getInstance(): UnifiedMediaSyncManager {
    if (!UnifiedMediaSyncManager.instance) {
      UnifiedMediaSyncManager.instance = new UnifiedMediaSyncManager()
    }
    return UnifiedMediaSyncManager.instance
  }

  /**
   * 注册媒体同步
   */
  register(
    id: string,
    mediaItemId: string,
    unwatch: () => void,
    scenario: 'command' | 'projectLoad',
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
    for (const [id, sync] of this.syncMap) {
      if (sync.commandId === commandId) {
        sync.unwatch()
        this.syncMap.delete(id)
      }
    }
  }

  /**
   * 根据时间轴项目ID清理媒体同步
   */
  cleanupByTimelineItemId(timelineItemId: string): void {
    for (const [id, sync] of this.syncMap) {
      if (sync.timelineItemId === timelineItemId) {
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
    scenario: 'command' | 'projectLoad'
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
 * 设置统一媒体同步
 * 合并了 setupCommandMediaSync 和 setupProjectLoadMediaSync 的功能
 */
export function setupMediaSync(options: {
  commandId?: string
  mediaItemId: string
  timelineItemId?: string
  description?: string
  scenario: 'command' | 'projectLoad'
}): void {
  try {
    const { commandId, mediaItemId, timelineItemId, description, scenario } = options
    const unifiedStore = useUnifiedStore()
    const syncManager = UnifiedMediaSyncManager.getInstance()

    // 获取媒体项目
    const mediaItem = unifiedStore.getMediaItem(mediaItemId)
    if (!mediaItem) {
      console.error(`❌ [UnifiedMediaSync] 找不到媒体项目: ${mediaItemId}`)
      return
    }

    // 检查媒体项目状态，只有非ready状态才需要设置同步
    const isReady = UnifiedMediaItemQueries.isReady(mediaItem)

    if (isReady) {
      console.log(`⏭️ [UnifiedMediaSync] 跳过同步设置，媒体项目已经ready: ${mediaItem.name}`, {
        scenario,
        commandId,
        timelineItemId,
        mediaItemId: mediaItem.id,
      })

      // 如果媒体已经ready且有时间轴项目，直接转换时间轴项目状态
      if (timelineItemId) {
        transitionTimelineItemToReady(timelineItemId, mediaItem, {
          scenario,
          commandId,
          description,
        })
      }
      return
    }

    const unwatch = watch(
      () => mediaItem.mediaStatus,
      async (newStatus, oldStatus) => {
        console.log(`🔄 [UnifiedMediaSync] 媒体状态变化: ${description}`, {
          scenario,
          commandId,
          mediaItemId,
          mediaName: mediaItem.name,
          statusChange: `${oldStatus} → ${newStatus}`,
        })

        let shouldCleanup = false

        // 只在状态变为ready时处理
        if (newStatus === 'ready') {
          // 如果是命令场景，先更新命令中的媒体数据
          if (scenario === 'command' && commandId) {
            const command = unifiedStore.getCommand(commandId)
            if (command && !command.isDisposed && command.updateMediaData) {
              command.updateMediaData(mediaItem, timelineItemId)
              console.log(
                `🔄 [UnifiedMediaSync] 已更新命令媒体数据: ${description} ${commandId} <- ${mediaItemId}`,
                {
                  mediaName: mediaItem.name,
                  mediaStatus: mediaItem.mediaStatus,
                },
              )
            } else {
              if (!command) {
                console.warn(`⚠️ [UnifiedMediaSync] 找不到命令实例: ${description} ${commandId}`)
              } else if (command.isDisposed) {
                console.warn(
                  `⚠️ [UnifiedMediaSync] 命令已被清理，跳过更新: ${description} ${commandId}`,
                )
              } else if (!command.updateMediaData) {
                console.warn(
                  `⚠️ [UnifiedMediaSync] 命令不支持媒体数据更新: ${description} ${commandId}`,
                )
              }
            }
          }

          // 如果有时间轴项目，转换时间轴项目状态
          if (timelineItemId) {
            await transitionTimelineItemToReady(timelineItemId, mediaItem, {
              scenario,
              commandId,
              description,
            })
          }

          // ready是终态，标记为需要清理
          shouldCleanup = true
        } else if (newStatus === 'error' || newStatus === 'cancelled' || newStatus === 'missing') {
          // 媒体状态变为错误、取消或缺失时，更新对应的时间轴项目状态
          if (timelineItemId) {
            const timelineItem = unifiedStore.getTimelineItem(timelineItemId)
            if (timelineItem) {
              timelineItem.timelineStatus = 'error'
              console.log(`❌ [UnifiedMediaSync] 时间轴项目状态已设置为错误: ${timelineItemId}`, {
                mediaItemId,
                mediaName: mediaItem.name,
                mediaStatus: newStatus,
              })
            }
          }
          // 错误状态是终态，标记为需要清理
          shouldCleanup = true
        }

        // 如果达到终态，自动清理监听器
        if (shouldCleanup) {
          console.log(
            `🧹 [UnifiedMediaSync] 媒体达到终态(${newStatus})，自动清理监听器: ${description} <-> ${mediaItemId}`,
          )

          // 根据场景使用不同的清理方式
          if (scenario === 'command' && commandId) {
            syncManager.cleanupByCommandId(commandId)
          } else if (timelineItemId) {
            syncManager.cleanupByTimelineItemId(timelineItemId)
          } else {
            syncManager.cleanup(commandId || timelineItemId || mediaItemId)
          }

          console.log(`✅ [UnifiedMediaSync] 监听器清理完成: ${description} <-> ${mediaItemId}`)
        }
      },
      { immediate: true },
    )

    // 注册到UnifiedMediaSyncManager中
    const id = commandId || timelineItemId || mediaItemId
    syncManager.register(id, mediaItemId, unwatch, scenario, {
      commandId,
      timelineItemId,
      description,
    })

    console.log(
      `💾 [UnifiedMediaSync] 已注册监听器到统一媒体同步管理器: ${description} <-> ${mediaItemId}`,
      {
        scenario,
        commandId,
        timelineItemId,
      },
    )
  } catch (error) {
    console.error(`❌ [UnifiedMediaSync] 设置媒体同步失败:`, {
      options,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 转换时间轴项目为 ready 状态
 * 合并了两个版本的 transitionTimelineItemToReady 函数
 */
async function transitionTimelineItemToReady(
  timelineItemId: string,
  mediaItem: UnifiedMediaItemData,
  options: {
    scenario: 'command' | 'projectLoad'
    commandId?: string
    description?: string
  },
): Promise<void> {
  try {
    const { scenario, commandId, description } = options
    console.log(`🎨 [UnifiedMediaSync] 开始转换时间轴项目状态: ${timelineItemId}`, {
      scenario,
      commandId,
      mediaItemId: mediaItem.id,
      mediaType: mediaItem.mediaType,
    })

    const unifiedStore = useUnifiedStore()

    // 获取时间轴项目
    const timelineItem = unifiedStore.getTimelineItem(timelineItemId)
    if (!timelineItem) {
      console.log(`⚠️ [UnifiedMediaSync] 找不到时间轴项目: ${timelineItemId}，跳过状态转换`)
      return
    }

    // 检查时间轴项目状态，只有loading状态才需要处理
    if (timelineItem.timelineStatus !== 'loading') {
      console.log(
        `⏭️ [UnifiedMediaSync] 跳过状态转换，时间轴项目状态不是loading: ${timelineItemId}`,
        {
          currentStatus: timelineItem.timelineStatus,
          scenario,
          commandId,
        },
      )
      return
    }

    // 1. 更新时间轴项目尺寸（命令场景需要）
    if (scenario === 'command') {
      updateTimelineItemDimensions(timelineItem, mediaItem)
    }

    // 2. 创建Sprite
    try {
      console.log(`🔄 [UnifiedMediaSync] 为时间轴项目创建Sprite: ${timelineItemId}`)
      const sprite = await createSpriteFromUnifiedMediaItem(mediaItem)

      // 将sprite存储到runtime中，并更新sprite时间
      timelineItem.runtime.sprite = sprite
      timelineItem.runtime.sprite.setTimeRange({ ...timelineItem.timeRange })
      await unifiedStore.addSpriteToCanvas(timelineItem.runtime.sprite)
      console.log(`✅ [UnifiedMediaSync] Sprite创建成功并存储到runtime: ${timelineItemId}`)

      // 3. 应用配置到sprite（项目加载场景需要）
      if (scenario === 'projectLoad') {
        await applyTimelineItemConfigToSprite(timelineItem)
      }
    } catch (spriteError) {
      console.error(`❌ [UnifiedMediaSync] 创建Sprite失败: ${timelineItemId}`, spriteError)
      // Sprite创建失败不影响后续操作
    }

    // 4. 为sprite设置轨道属性
    try {
      const track = unifiedStore.tracks.find((t) => t.id === timelineItem.trackId)
      if (track && timelineItem.runtime.sprite) {
        // 设置可见性
        timelineItem.runtime.sprite.visible = track.isVisible

        // 为具有音频功能的片段设置静音状态
        if (hasAudioCapabilities(timelineItem.runtime.sprite)) {
          timelineItem.runtime.sprite.setTrackMuted(track.isMuted)
        }

        console.log(`✅ [UnifiedMediaSync] 已设置轨道属性到sprite: ${timelineItemId}`, {
          trackId: track.id,
          trackName: track.name,
          isVisible: track.isVisible,
          isMuted: track.isMuted,
        })
      }
    } catch (trackError) {
      console.error(`❌ [UnifiedMediaSync] 设置轨道属性到sprite失败: ${timelineItemId}`, trackError)
      // 轨道属性设置失败不影响后续操作
    }

    // 5. 应用动画配置到sprite（如果有）
    if (timelineItem.animation && timelineItem.animation.keyframes.length > 0) {
      try {
        console.log(`🎬 [UnifiedMediaSync] 应用动画配置到sprite: ${timelineItemId}`, {
          keyframeCount: timelineItem.animation.keyframes.length,
        })

        // 使用WebAVAnimationManager来应用动画
        await updateWebAVAnimation(timelineItem)

        console.log(`✅ [UnifiedMediaSync] 动画配置应用成功: ${timelineItemId}`)
      } catch (animationError) {
        console.error(`❌ [UnifiedMediaSync] 应用动画配置失败: ${timelineItemId}`, animationError)
        // 动画应用失败不影响后续操作
      }
    }

    // 6. 更新时间轴项目状态
    timelineItem.timelineStatus = 'ready'

    // 7. 设置双向数据同步（仅就绪状态的已知类型时间轴项目）
    unifiedStore.setupBidirectionalSync(timelineItem)

    // 8. 初始化动画管理器（仅就绪状态的已知类型时间轴项目）
    globalWebAVAnimationManager.addManager(timelineItem)

    console.log(`🎉 [UnifiedMediaSync] 时间轴项目状态转换完成: ${timelineItemId}`)
  } catch (error) {
    console.error(`❌ [UnifiedMediaSync] 转换时间轴项目状态失败: ${timelineItemId}`, {
      scenario: options.scenario,
      commandId: options.commandId,
      mediaItemId: mediaItem.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 更新时间轴项目的尺寸信息
 * 从 commandMediaSyncUtils.ts 复制
 */
function updateTimelineItemDimensions(
  timelineItem: UnifiedTimelineItemData,
  mediaItem: UnifiedMediaItemData,
): void {
  try {
    // 更新timeRange - 使用媒体项目的duration
    if (mediaItem.duration && timelineItem.timeRange) {
      const duration = mediaItem.duration
      const startTime = timelineItem.timeRange.timelineStartTime

      // 更新时间范围，保持开始时间不变，更新结束时间
      timelineItem.timeRange = {
        ...timelineItem.timeRange,
        timelineEndTime: startTime + duration,
        clipStartTime: 0,
        clipEndTime: duration,
      }

      console.log(`⏱️ [UnifiedMediaSync] 已更新时间范围: ${timelineItem.id}`, {
        duration,
        startTime,
        endTime: startTime + duration,
      })
    }

    // 获取媒体的原始尺寸
    const originalSize = UnifiedMediaItemQueries.getOriginalSize(mediaItem)

    // 更新config中的宽高 - 仅对视频和图片类型，并且有原始尺寸时才更新
    if (
      originalSize &&
      (TimelineItemQueries.isVideoTimelineItem(timelineItem) ||
        TimelineItemQueries.isImageTimelineItem(timelineItem))
    ) {
      console.log(`📐 [UnifiedMediaSync] 更新时间轴项目尺寸: ${timelineItem.id}`, {
        originalWidth: originalSize.width,
        originalHeight: originalSize.height,
        mediaType: mediaItem.mediaType,
      })

      // 保留现有的配置，只更新尺寸相关字段
      const currentConfig = timelineItem.config

      // 更新宽度和高度
      currentConfig.width = originalSize.width
      currentConfig.height = originalSize.height

      // 更新原始宽度和高度
      currentConfig.originalWidth = originalSize.width
      currentConfig.originalHeight = originalSize.height

      console.log(`🖼️ [UnifiedMediaSync] 已更新配置尺寸: ${timelineItem.id}`, {
        width: originalSize.width,
        height: originalSize.height,
      })
    } else if (!originalSize) {
      console.warn(`⚠️ [UnifiedMediaSync] 无法获取媒体原始尺寸: ${mediaItem.id}`)
    }
  } catch (error) {
    console.error(`❌ [UnifiedMediaSync] 更新时间轴项目尺寸失败: ${timelineItem.id}`, {
      mediaItemId: mediaItem.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 将时间轴项目的配置应用到sprite中
 * 从 projectLoadMediaSyncManager.ts 复制
 */
async function applyTimelineItemConfigToSprite(timelineItem: any): Promise<void> {
  try {
    // 检查sprite是否存在
    if (!timelineItem.runtime.sprite) {
      console.warn(`⚠️ [UnifiedMediaSync] Sprite不存在，无法应用配置: ${timelineItem.id}`)
      return
    }

    const sprite = timelineItem.runtime.sprite
    const config = timelineItem.config

    console.log(`🎨 [UnifiedMediaSync] 将时间轴项目配置应用到sprite: ${timelineItem.id}`, {
      mediaType: timelineItem.mediaType,
      hasAnimation: !!(timelineItem.animation && timelineItem.animation.keyframes.length > 0),
    })

    // 设置sprite的基本属性
    // 注意：位置属性需要使用坐标转换系统，将项目坐标转换为WebAV坐标
    if (config.width !== undefined) sprite.rect.w = config.width
    if (config.height !== undefined) sprite.rect.h = config.height
    if (config.rotation !== undefined) sprite.rect.angle = config.rotation
    if (config.opacity !== undefined) sprite.opacity = config.opacity
    if (config.zIndex !== undefined) sprite.zIndex = config.zIndex

    // 对于有音频属性的类型
    if (TimelineItemQueries.hasAudioProperties(timelineItem)) {
      if (config.volume !== undefined) sprite.volume = config.volume
      if (config.isMuted !== undefined) sprite.isMuted = config.isMuted
    }

    // 使用坐标转换系统设置位置属性
    if (config.x !== undefined || config.y !== undefined) {
      try {
        // 导入坐标转换工具
        const unifiedStore = useUnifiedStore()

        // 获取当前配置值，如果未定义则使用sprite的当前值
        const x = config.x !== undefined ? config.x : sprite.x
        const y = config.y !== undefined ? config.y : sprite.y
        const width = config.width !== undefined ? config.width : sprite.width
        const height = config.height !== undefined ? config.height : sprite.height

        // 使用坐标转换系统将项目坐标转换为WebAV坐标
        const webavCoords = projectToWebavCoords(
          x,
          y,
          width,
          height,
          unifiedStore.videoResolution.width,
          unifiedStore.videoResolution.height,
        )

        // 设置转换后的坐标
        sprite.rect.x = webavCoords.x
        sprite.rect.y = webavCoords.y

        console.log(`🎯 [UnifiedMediaSync] 已使用坐标转换系统设置位置: ${timelineItem.id}`, {
          projectCoords: { x, y },
          webavCoords: { x: webavCoords.x, y: webavCoords.y },
          size: { width, height },
          canvasSize: {
            width: unifiedStore.videoResolution.width,
            height: unifiedStore.videoResolution.height,
          },
        })
      } catch (coordError) {
        console.error(`❌ [UnifiedMediaSync] 坐标转换失败: ${timelineItem.id}`, coordError)
        // 坐标转换失败时，尝试直接设置
        if (config.x !== undefined) sprite.x = config.x
        if (config.y !== undefined) sprite.y = config.y
      }
    }

    console.log(`✅ [UnifiedMediaSync] 基本配置已应用到sprite: ${timelineItem.id}`, {
      width: sprite.rect.w,
      height: sprite.rect.h,
      rotation: sprite.rect.angle,
      opacity: sprite.opacity,
      zIndex: sprite.zIndex,
      volume: sprite.volume,
      isMuted: sprite.isMuted,
      webavCoords: {
        x: sprite.rect.x,
        y: sprite.rect.y,
      },
    })
  } catch (error) {
    console.error(`❌ [UnifiedMediaSync] 应用时间轴项目配置到sprite失败: ${timelineItem.id}`, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 清理命令媒体同步（向后兼容）
 * @param commandId 命令ID
 */
export function cleanupCommandMediaSync(commandId: string): void {
  try {
    const syncManager = UnifiedMediaSyncManager.getInstance()
    syncManager.cleanupByCommandId(commandId)

    console.log(`🗑️ [UnifiedMediaSync] 已清理命令所有媒体同步: ${commandId}`)
  } catch (error) {
    console.error(`❌ [UnifiedMediaSync] 清理命令媒体同步失败:`, {
      commandId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 清理项目加载媒体同步（向后兼容）
 * @param timelineItemId 时间轴项目ID（可选，不提供则清理所有）
 */
export function cleanupProjectLoadMediaSync(timelineItemId?: string): void {
  try {
    const syncManager = UnifiedMediaSyncManager.getInstance()

    if (timelineItemId) {
      syncManager.cleanupByTimelineItemId(timelineItemId)
      console.log(`🗑️ [UnifiedMediaSync] 已清理指定时间轴项目的媒体同步: ${timelineItemId}`)
    } else {
      syncManager.cleanupAll()
      console.log(`🗑️ [UnifiedMediaSync] 已清理所有项目加载媒体同步`)
    }
  } catch (error) {
    console.error(`❌ [UnifiedMediaSync] 清理项目加载媒体同步失败:`, {
      timelineItemId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 获取统一媒体同步信息（用于调试）
 */
export function getUnifiedMediaSyncInfo(): Array<{
  id: string
  commandId?: string
  mediaItemId: string
  timelineItemId?: string
  scenario: 'command' | 'projectLoad'
  description?: string
}> {
  const syncManager = UnifiedMediaSyncManager.getInstance()
  return syncManager.getSyncInfo()
}
