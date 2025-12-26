/**
 * 项目导出工具
 * 提供视频项目导出为 MP4 文件的功能
 * 以及单个素材导出功能
 */

import { Combinator } from '@webav/av-cliper'
import type { MP4Clip } from '@webav/av-cliper'
import {
  VideoOffscreenSprite,
  ImageOffscreenSprite,
  AudioOffscreenSprite,
  // TextOffscreenSprite,
} from '@/core/offscreensprite'
import type { UnifiedOffscreenSprite } from '@/core/offscreensprite'
import type { UnifiedSprite } from '@/core/visiblesprite'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { MediaType } from '@/core/mediaitem'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import {
  isVideoTimelineItem,
  isImageTimelineItem,
  isAudioTimelineItem,
  isTextTimelineItem,
  hasVisualProperties,
  hasAudioProperties,
} from '@/core/timelineitem/queries'
import { projectToWebavCoords } from '@/core/utils/coordinateUtils'
import { convertToWebAVAnimation, isValidAnimationConfig } from '@/core/utils/animationConverter'
import { hasAnimation } from '@/core/utils/unifiedKeyframeUtils'
import { generateThumbnailForUnifiedMediaItem } from '@/core/utils/thumbnailGenerator'
import { ThumbnailMode } from '@/constants/ThumbnailConstants'
import { useUnifiedStore } from '@/core/unifiedStore'

/**
 * 导出项目参数接口
 */
export interface ExportProjectOptions {
  /** 视频分辨率宽度 */
  videoWidth: number
  /** 视频分辨率高度 */
  videoHeight: number
  /** 项目名称 */
  projectName: string
  /** 时间轴项目列表 */
  timelineItems: UnifiedTimelineItemData<MediaType>[]
  /** 轨道列表 */
  tracks: { id: string; isVisible: boolean; isMuted: boolean }[]
  /** 进度更新回调函数（可选） */
  onProgress?: (stage: string, progress: number, details?: string) => void
}

/**
 * 导出单个媒体项目参数
 */
export interface ExportMediaItemOptions {
  /** 媒体项目数据 */
  mediaItem: UnifiedMediaItemData
  /** 进度更新回调（可选） */
  onProgress?: (progress: number) => void
}

/**
 * 导出单个时间轴项目参数
 */
export interface ExportTimelineItemOptions {
  /** 时间轴项目数据 */
  timelineItem: UnifiedTimelineItemData
  /** 进度更新回调（可选） */
  onProgress?: (progress: number) => void
}

/**
 * 导出项目为 MP4 文件
 * @param options 导出项目参数
 */
export async function exportProject(options: ExportProjectOptions): Promise<void> {
  throw new Error('TODO')
}

/**
 * 导出单个媒体项目为 Blob（使用原始尺寸）
 */
export async function exportMediaItem(options: ExportMediaItemOptions): Promise<Blob> {
  throw new Error('TODO')
}

/**
 * 导出单个时间轴项目为 Blob（使用原始尺寸）
 */
export async function exportTimelineItem(options: ExportTimelineItemOptions): Promise<Blob> {
  throw new Error('TODO')
}
