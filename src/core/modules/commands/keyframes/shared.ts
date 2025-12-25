/**
 * 关键帧命令共享工具函数和类型定义
 * 适配新架构的统一类型系统
 */

import type {
  UnifiedTimelineItemData,
  VideoMediaConfig,
  AudioMediaConfig,
  ImageMediaConfig,
  TextMediaConfig,
} from '@/core/timelineitem/type'
import type { AnimationConfig } from '@/core/timelineitem/animationtypes'
import { hasVisualProperties } from '@/core/timelineitem/queries'
import { generateCommandId as generateId } from '@/core/utils/idGenerator'
import { isPlayheadInTimelineItem as checkPlayheadInTimelineItem } from '@/core/utils/timelineSearchUtils'
import { cloneDeep } from 'lodash'

// ==================== 关键帧数据快照接口 ====================

/**
 * 类型安全的关键帧状态快照
 * 用于保存和恢复关键帧的完整状态
 */
export interface KeyframeSnapshot {
  /** 动画配置的完整快照 */
  animationConfig: AnimationConfig | undefined
  /** 时间轴项目的属性快照 */
  itemProperties: VideoMediaConfig | AudioMediaConfig | ImageMediaConfig | TextMediaConfig
}

// ==================== 通用接口定义 ====================

/**
 * 时间轴模块接口
 */
export interface TimelineModule {
  getTimelineItem: (id: string) => UnifiedTimelineItemData | undefined
}

/**
 * 播放控制接口
 */
export interface PlaybackControls {
  seekTo: (frame: number) => void
}

// ==================== 通用工具函数 ====================

/**
 * 生成命令ID
 */
export function generateCommandId(): string {
  return generateId()
}

/**
 * 创建状态快照
 */
export function createSnapshot(item: UnifiedTimelineItemData): KeyframeSnapshot {
  return {
    animationConfig: item.animation ? cloneDeep(item.animation) : undefined,
    itemProperties: cloneDeep(item.config),
  }
}

/**
 * 通用的状态快照应用函数
 * 适配新架构的数据流向：UI → WebAV → TimelineItem
 * 基于旧架构的完整实现进行改进
 */
export async function applyKeyframeSnapshot(
  item: UnifiedTimelineItemData,
  snapshot: KeyframeSnapshot,
): Promise<void> {
  // 1. 恢复动画配置（关键帧数据）
  if (snapshot.animationConfig) {
    // 类型安全的动画配置恢复
    ;(item as any).animation = {
      keyframes: snapshot.animationConfig.keyframes.map((kf) => ({
        framePosition: kf.framePosition,
        properties: { ...kf.properties },
      })),
    }
  } else {
    ;(item as any).animation = undefined
  }

  // 2. 通过WebAV恢复属性值（遵循正确的数据流向）
  const sprite = (item as any).sprite || item.runtime.sprite
  if (sprite && snapshot.itemProperties) {
    try {
      // 类型安全的属性恢复 - 只处理视觉属性
      if (hasVisualProperties(item)) {
        // 类型守卫确保了 snapshot.itemProperties 具有视觉属性
        const visualProps = snapshot.itemProperties as VideoMediaConfig | ImageMediaConfig

        // 恢复位置和尺寸
        if ('x' in visualProps && (visualProps.x !== undefined || visualProps.y !== undefined)) {
          const { projectToWebavCoords } = await import('@/core/utils/coordinateUtils')
          const { useUnifiedStore } = await import('@/core/unifiedStore')
          const store = useUnifiedStore()

          // 获取视频分辨率
          const videoResolution = store.videoResolution || { width: 1920, height: 1080 }

          // 类型守卫确保了 config 具有视觉属性
          const config = item.config as VideoMediaConfig | ImageMediaConfig
          const webavCoords = projectToWebavCoords(
            visualProps.x ?? config.x,
            visualProps.y ?? config.y,
            visualProps.width ?? config.width,
            visualProps.height ?? config.height,
            videoResolution.width,
            videoResolution.height,
          )
          sprite.rect.x = webavCoords.x
          sprite.rect.y = webavCoords.y
        }

        // 恢复尺寸
        if ('width' in visualProps && visualProps.width !== undefined) {
          sprite.rect.w = visualProps.width
        }
        if ('height' in visualProps && visualProps.height !== undefined) {
          sprite.rect.h = visualProps.height
        }

        // 恢复旋转
        if ('rotation' in visualProps && visualProps.rotation !== undefined) {
          sprite.rect.angle = visualProps.rotation
        }

        // 恢复透明度
        if ('opacity' in visualProps && visualProps.opacity !== undefined) {
          sprite.opacity = visualProps.opacity
        }
      }

      // 触发渲染更新
      const { useUnifiedStore } = await import('@/core/unifiedStore')
      const store = useUnifiedStore()
      store.seekToFrame(store.currentFrame)
    } catch (error) {
      console.error('🎬 [Keyframe Command] Failed to restore properties via WebAV:', error)
      // 如果WebAV更新失败，回退到直接更新TimelineItem
      Object.assign(item.config, snapshot.itemProperties)
    }
  }

  // 3. 动画配置更新已迁移到 Bunny 组件，无需手动更新
}

/**
 * 检查播放头是否在时间轴项目范围内
 */
export function isPlayheadInTimelineItem(item: UnifiedTimelineItemData, frame: number): boolean {
  return checkPlayheadInTimelineItem(item, frame)
}

/**
 * 显示用户警告
 */
export async function showUserWarning(title: string, message: string): Promise<void> {
  try {
    const { useUnifiedStore } = await import('@/core/unifiedStore')
    const store = useUnifiedStore()
    // 假设新架构有类似的警告方法
    if (typeof store.messageWarning === 'function') {
      store.messageWarning(`${title}：${message}`)
    } else {
      console.warn(`${title}: ${message}`)
    }
  } catch (error) {
    console.warn(`${title}: ${message}`)
  }
}
