/**
 * 统一项目配置类型定义
 * 基于新架构统一类型系统的项目配置接口，参考旧架构ProjectConfig设计
 */

import type { UnifiedMediaItemData } from '@/core/mediaitem'
import type { UnifiedTrackData } from '@/core/track'
import type { UnifiedTimelineItemData } from '@/core/timelineitem'
import type { MediaType } from '@/core/mediaitem'
// 移除导入
// import type { VirtualDirectory, DisplayTab } from '@/core/modules/UnifiedDirectoryModule'

/**
 * 媒体元数据接口
 */
export interface UnifiedMediaMetadata {
  id: string // 元数据ID
  originalFileName: string // 原始文件名
  fileSize: number // 文件大小
  mimeType: string // MIME类型
  checksum: string // 文件校验和
  importedAt: string // 导入时间
  duration?: number // 持续时间（视频/音频）
  width?: number // 宽度（视频/图片）
  height?: number // 高度（视频/图片）
  [key: string]: any // 其他元数据
}

/**
 * 媒体引用接口
 */
export interface UnifiedMediaReference {
  id: string // 媒体ID
  originalFileName: string // 原始文件名
  storedPath: string // 存储路径
  mediaType: MediaType // 媒体类型
  fileSize: number // 文件大小
  mimeType: string // MIME类型
  checksum: string // 文件校验和
  metadata?: UnifiedMediaMetadata // 媒体元数据
}

/**
 * 项目内容数据（从UnifiedProjectConfig中拆分出来）
 *
 * 🌟 阶段二彻底重构：移除 mediaItems 字段
 * 媒体项目通过扫描 media/ 目录下的 .meta 文件动态构建
 */
export interface UnifiedProjectTimeline {
  tracks: UnifiedTrackData[]
  timelineItems: UnifiedTimelineItemData[]
  // mediaItems 已移除，通过 Meta 文件管理
}

/**
 * 统一项目配置接口（移除timeline字段）
 */
export interface UnifiedProjectConfig {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  version: string
  thumbnail?: string
  duration: number // 项目总时长（秒）

  // 项目设置
  settings: {
    videoResolution: {
      name: string
      width: number
      height: number
      aspectRatio: string
    }
    frameRate: number // 固定30帧
    timelineDurationFrames: number
  }

  // ❌ 移除虚拟目录配置字段
  // directories?: {
  //   directories: VirtualDirectory[]
  //   openTabs: DisplayTab[]
  //   activeTabId: string
  // }

  // timeline字段被移除，单独保存到content.json
}
