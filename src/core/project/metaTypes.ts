import type { BaseDataSourcePersistedData } from '@/core/datasource/core/DataSourceTypes'
import type { MediaType } from '@/core/mediaitem/types'

/**
 * Meta 文件数据结构
 * 与 UnifiedMediaItemData 的可序列化字段对齐
 */
export interface MediaMetaFile {
  // 版本控制
  version: string // 配置版本（如 "1.0.0"）

  // 核心属性
  id: string // nanoid.ext 格式（如 "V1StGXR8_Z5j.mp4"）
  name: string // 显示名称
  createdAt: string // 创建时间

  // 媒体类型
  mediaType: MediaType | 'unknown'

  // 数据源（持久化数据）
  // 使用现有的 BaseDataSourcePersistedData 类型
  source: BaseDataSourcePersistedData

  // 媒体元数据
  duration?: number // 媒体时长
  durationN?: number // 本应该是bigint，但是需要是number才能序列化保存

  // 🌟 新增：可选的终态状态
  // 只在媒体达到终态时保存（ready/error/cancelled/missing）
  // 如果未设置，加载时默认为 pending
  mediaStatus?: 'ready' | 'error' | 'cancelled' | 'missing'
}
