/**
 * 时间轴项目状态转换器
 * 负责将时间轴项目从 loading 状态转换为 ready 状态
 *
 * 职责：
 * - 更新时间轴项目尺寸
 * - 创建和配置 Sprite
 * - 应用动画配置
 * - 设置轨道属性
 * - 初始化双向同步
 */

import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/TimelineItemData'
import type { TransitionOptions } from './types'
import { UnifiedMediaItemQueries } from '@/core/mediaitem'
import { TimelineItemQueries } from '@/core/timelineitem/TimelineItemQueries'
import { useUnifiedStore } from '@/core/unifiedStore'
import { createSpriteFromUnifiedMediaItem } from '@/core/utils/spriteFactory'
import { createSpriteForTextTimelineItem } from '@/core/utils/textTimelineUtils'
import {
  globalWebAVAnimationManager,
  updateWebAVAnimation,
} from '@/core/utils/webavAnimationManager'
import { projectToWebavCoords } from '@/core/utils/coordinateTransform'
import { hasAudioCapabilities } from '@/core/utils/spriteTypeGuards'
import { markRaw } from 'vue'
import { textToImageBitmap } from '@/core/bunnyUtils/ToBitmap'
import { BunnyClip } from '@/core/mediabunny/bunny-clip'
/**
 * 时间轴项目状态转换器（增强版 - 支持文本类型）
 */
export class TimelineItemTransitioner {
  constructor(
    private timelineItemId: string,
    private mediaItem?: UnifiedMediaItemData, // 文本类型时为 undefined
    private setupTimelineItemSprite?: (item: UnifiedTimelineItemData) => Promise<void>, // 文本类型需要
  ) {}

  /**
   * 转换时间轴项目为 ready 状态（支持文本类型）
   */
  async transitionToReady(options: TransitionOptions): Promise<void> {
    try {
      const { scenario, commandId, description } = options
      console.log(`🎨 [TimelineItemTransitioner] 开始转换时间轴项目状态: ${this.timelineItemId}`, {
        scenario,
        commandId,
        mediaType: this.mediaItem?.mediaType || 'text',
      })

      const store = useUnifiedStore()
      const timelineItem = store.getTimelineItem(this.timelineItemId)

      if (!timelineItem) {
        console.log(
          `⚠️ [TimelineItemTransitioner] 找不到时间轴项目: ${this.timelineItemId}，跳过状态转换`,
        )
        return
      }

      if (timelineItem.timelineStatus !== 'loading') {
        console.log(
          `⏭️ [TimelineItemTransitioner] 跳过状态转换，时间轴项目状态不是loading: ${this.timelineItemId}`,
          {
            currentStatus: timelineItem.timelineStatus,
            scenario,
            commandId,
          },
        )
        return
      }

      // 检查是否为文本类型
      if (TimelineItemQueries.isTextTimelineItem(timelineItem)) {
        await this.transitionTextTimelineItem(timelineItem, options)
      } else {
        await this.transitionMediaTimelineItem(timelineItem, options)
      }

      // 通用的后续处理
      timelineItem.timelineStatus = 'ready'
      store.setupBidirectionalSync(timelineItem)
      globalWebAVAnimationManager.addManager(timelineItem)

      console.log(`🎉 [TimelineItemTransitioner] 时间轴项目状态转换完成: ${this.timelineItemId}`)
    } catch (error) {
      console.error(
        `❌ [TimelineItemTransitioner] 转换时间轴项目状态失败: ${this.timelineItemId}`,
        error,
      )
      throw error
    }
  }

  /**
   * 处理文本类型的状态转换
   */
  private async transitionTextTimelineItem(
    timelineItem: UnifiedTimelineItemData<'text'>,
    options: TransitionOptions,
  ): Promise<void> {
    console.log(`🎨 [TimelineItemTransitioner] 转换文本时间轴项目: ${timelineItem.id}`)

    // 1. 使用 textTimelineUtils 中的工具函数创建精灵
    const newSprite = await createSpriteForTextTimelineItem(timelineItem)

    // 2. 将精灵添加到 runtime
    timelineItem.runtime.sprite = markRaw(newSprite)

    // 3. 设置sprite属性
    if (this.setupTimelineItemSprite) {
      await this.setupTimelineItemSprite(timelineItem)
    }
    const bmap = await textToImageBitmap(timelineItem.config.text, timelineItem.config.style)
    timelineItem.runtime.textBitmap = bmap

    // 4. 设置轨道属性
    this.applyTrackProperties(timelineItem)

    // 5. 应用动画（如果有）
    await this.applyAnimation(timelineItem)

    console.log(`✅ [TimelineItemTransitioner] 文本时间轴项目转换完成: ${timelineItem.id}`)
  }

  /**
   * 处理媒体类型的状态转换（现有逻辑）
   */
  private async transitionMediaTimelineItem(
    timelineItem: UnifiedTimelineItemData,
    options: TransitionOptions,
  ): Promise<void> {
    if (!this.mediaItem) {
      throw new Error('媒体类型的时间轴项目必须提供 mediaItem')
    }

    // 现有的媒体类型处理逻辑
    if (options.scenario === 'command') {
      this.updateDimensions(timelineItem)
    }

    await this.createBunny(timelineItem)

    if (options.scenario === 'projectLoad') {
      await this.applyConfig(timelineItem)
    }

    this.applyTrackProperties(timelineItem)
    await this.applyAnimation(timelineItem)
  }

  /**
   * 更新时间轴项目的尺寸信息
   */
  private updateDimensions(timelineItem: UnifiedTimelineItemData): void {
    if (!this.mediaItem) {
      console.warn(
        `⚠️ [TimelineItemTransitioner] 无法更新尺寸，mediaItem 不存在: ${timelineItem.id}`,
      )
      return
    }

    try {
      // 更新timeRange - 使用媒体项目的duration
      if (this.mediaItem.duration && timelineItem.timeRange) {
        const duration = this.mediaItem.duration
        const startTime = timelineItem.timeRange.timelineStartTime

        // 更新时间范围，保持开始时间不变，更新结束时间
        timelineItem.timeRange = {
          ...timelineItem.timeRange,
          timelineEndTime: startTime + duration,
          clipStartTime: 0,
          clipEndTime: duration,
        }

        console.log(`⏱️ [TimelineItemTransitioner] 已更新时间范围: ${timelineItem.id}`, {
          duration,
          startTime,
          endTime: startTime + duration,
        })
      }

      // 获取媒体的原始尺寸
      const originalSize = UnifiedMediaItemQueries.getOriginalSize(this.mediaItem)

      // 更新config中的宽高 - 仅对视频和图片类型，并且有原始尺寸时才更新
      if (
        originalSize &&
        (TimelineItemQueries.isVideoTimelineItem(timelineItem) ||
          TimelineItemQueries.isImageTimelineItem(timelineItem))
      ) {
        console.log(`📐 [TimelineItemTransitioner] 更新时间轴项目尺寸: ${timelineItem.id}`, {
          originalWidth: originalSize.width,
          originalHeight: originalSize.height,
          mediaType: this.mediaItem.mediaType,
        })

        // 保留现有的配置，只更新尺寸相关字段
        const currentConfig = timelineItem.config

        // 更新宽度和高度
        currentConfig.width = originalSize.width
        currentConfig.height = originalSize.height

        // 更新原始宽度和高度
        currentConfig.originalWidth = originalSize.width
        currentConfig.originalHeight = originalSize.height

        console.log(`🖼️ [TimelineItemTransitioner] 已更新配置尺寸: ${timelineItem.id}`, {
          width: originalSize.width,
          height: originalSize.height,
        })
      } else if (!originalSize) {
        console.warn(`⚠️ [TimelineItemTransitioner] 无法获取媒体原始尺寸: ${this.mediaItem.id}`)
      }
    } catch (error) {
      console.error(
        `❌ [TimelineItemTransitioner] 更新时间轴项目尺寸失败: ${timelineItem.id}`,
        error,
      )
    }
  }

  /**
   * 创建 Sprite
   */
  private async createBunny(timelineItem: UnifiedTimelineItemData): Promise<void> {
    if (!this.mediaItem) {
      console.warn(
        `⚠️ [TimelineItemTransitioner] 无法创建Sprite，mediaItem 不存在: ${this.timelineItemId}`,
      )
      return
    }

    try {
      console.log(`🔄 [TimelineItemTransitioner] 为时间轴项目创建Sprite: ${this.timelineItemId}`)

      if (this.mediaItem.runtime.bunny?.bunnyMedia) {
        const bunnyclip = new BunnyClip(this.mediaItem.runtime.bunny.bunnyMedia)
        bunnyclip.setTimeRange({
          clipStart: BigInt(timelineItem.timeRange.clipStartTime),
          clipEnd: BigInt(timelineItem.timeRange.clipEndTime),
          timelineStart: BigInt(timelineItem.timeRange.timelineStartTime),
          timelineEnd: BigInt(timelineItem.timeRange.timelineEndTime),
        })
        timelineItem.runtime.bunnyClip = markRaw(bunnyclip)
      }
      console.log(
        `✅ [TimelineItemTransitioner] Sprite创建成功并存储到runtime: ${this.timelineItemId}`,
      )
    } catch (error) {
      console.error(
        `❌ [TimelineItemTransitioner] 创建Sprite失败: ${this.timelineItemId}`,
        error,
      )
      // Sprite创建失败不影响后续操作
    }
  }

  /**
   * 将时间轴项目的配置应用到sprite中
   */
  private async applyConfig(timelineItem: UnifiedTimelineItemData): Promise<void> {
    try {
      // 检查sprite是否存在
      if (!timelineItem.runtime.sprite) {
        console.warn(`⚠️ [TimelineItemTransitioner] Sprite不存在，无法应用配置: ${timelineItem.id}`)
        return
      }

      const sprite = timelineItem.runtime.sprite
      const config = timelineItem.config as any // 使用 any 来避免类型检查问题

      console.log(
        `🎨 [TimelineItemTransitioner] 将时间轴项目配置应用到sprite: ${timelineItem.id}`,
        {
          mediaType: timelineItem.mediaType,
          hasAnimation: !!(timelineItem.animation && timelineItem.animation.keyframes.length > 0),
        },
      )

      // 设置sprite的基本属性（仅对视频和图片类型）
      if (
        TimelineItemQueries.isVideoTimelineItem(timelineItem) ||
        TimelineItemQueries.isImageTimelineItem(timelineItem)
      ) {
        if (config.width !== undefined) sprite.rect.w = config.width
        if (config.height !== undefined) sprite.rect.h = config.height
        if (config.rotation !== undefined) sprite.rect.angle = config.rotation
        if (config.opacity !== undefined) sprite.opacity = config.opacity
        if (config.zIndex !== undefined) sprite.zIndex = config.zIndex
      }

      // 对于有音频属性的类型
      if (TimelineItemQueries.hasAudioProperties(timelineItem)) {
        const audioSprite = sprite as any
        if (config.volume !== undefined) audioSprite.volume = config.volume
        if (config.isMuted !== undefined) audioSprite.isMuted = config.isMuted
      }

      // 使用坐标转换系统设置位置属性（仅对视频和图片类型）
      if (
        (TimelineItemQueries.isVideoTimelineItem(timelineItem) ||
          TimelineItemQueries.isImageTimelineItem(timelineItem)) &&
        (config.x !== undefined || config.y !== undefined)
      ) {
        try {
          const store = useUnifiedStore()
          const visualSprite = sprite as any

          // 获取当前配置值，如果未定义则使用sprite的当前值
          const x = config.x !== undefined ? config.x : visualSprite.x
          const y = config.y !== undefined ? config.y : visualSprite.y
          const width = config.width !== undefined ? config.width : visualSprite.width
          const height = config.height !== undefined ? config.height : visualSprite.height

          // 使用坐标转换系统将项目坐标转换为WebAV坐标
          const webavCoords = projectToWebavCoords(
            x,
            y,
            width,
            height,
            store.videoResolution.width,
            store.videoResolution.height,
          )

          // 设置转换后的坐标
          sprite.rect.x = webavCoords.x
          sprite.rect.y = webavCoords.y

          console.log(
            `🎯 [TimelineItemTransitioner] 已使用坐标转换系统设置位置: ${timelineItem.id}`,
            {
              projectCoords: { x, y },
              webavCoords: { x: webavCoords.x, y: webavCoords.y },
              size: { width, height },
              canvasSize: {
                width: store.videoResolution.width,
                height: store.videoResolution.height,
              },
            },
          )
        } catch (coordError) {
          console.error(
            `❌ [TimelineItemTransitioner] 坐标转换失败: ${timelineItem.id}`,
            coordError,
          )
          // 坐标转换失败时，尝试直接设置
          const visualSprite = sprite as any
          if (config.x !== undefined) visualSprite.x = config.x
          if (config.y !== undefined) visualSprite.y = config.y
        }
      }

      console.log(`✅ [TimelineItemTransitioner] 基本配置已应用到sprite: ${timelineItem.id}`, {
        width: sprite.rect.w,
        height: sprite.rect.h,
        rotation: sprite.rect.angle,
        opacity: sprite.opacity,
        zIndex: sprite.zIndex,
      })
    } catch (error) {
      console.error(
        `❌ [TimelineItemTransitioner] 应用时间轴项目配置到sprite失败: ${timelineItem.id}`,
        error,
      )
    }
  }

  /**
   * 为sprite设置轨道属性
   */
  private applyTrackProperties(timelineItem: UnifiedTimelineItemData): void {
    try {
      const store = useUnifiedStore()
      const track = store.tracks.find((t) => t.id === timelineItem.trackId)

      if (track && timelineItem.runtime.sprite) {
        // 设置可见性
        timelineItem.runtime.sprite.visible = track.isVisible

        // 为具有音频功能的片段设置静音状态
        if (hasAudioCapabilities(timelineItem.runtime.sprite)) {
          timelineItem.runtime.sprite.setTrackMuted(track.isMuted)
        }

        console.log(`✅ [TimelineItemTransitioner] 已设置轨道属性到sprite: ${timelineItem.id}`, {
          trackId: track.id,
          trackName: track.name,
          isVisible: track.isVisible,
          isMuted: track.isMuted,
        })
      }
    } catch (trackError) {
      console.error(
        `❌ [TimelineItemTransitioner] 设置轨道属性到sprite失败: ${timelineItem.id}`,
        trackError,
      )
      // 轨道属性设置失败不影响后续操作
    }
  }

  /**
   * 应用动画配置到sprite
   */
  private async applyAnimation(timelineItem: UnifiedTimelineItemData): Promise<void> {
    if (timelineItem.animation && timelineItem.animation.keyframes.length > 0) {
      try {
        console.log(`🎬 [TimelineItemTransitioner] 应用动画配置到sprite: ${timelineItem.id}`, {
          keyframeCount: timelineItem.animation.keyframes.length,
        })

        // 使用WebAVAnimationManager来应用动画
        await updateWebAVAnimation(timelineItem)

        console.log(`✅ [TimelineItemTransitioner] 动画配置应用成功: ${timelineItem.id}`)
      } catch (animationError) {
        console.error(
          `❌ [TimelineItemTransitioner] 应用动画配置失败: ${timelineItem.id}`,
          animationError,
        )
        // 动画应用失败不影响后续操作
      }
    }
  }
}
