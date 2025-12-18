import type { VirtualDirectory, DisplayTab } from '../modules/UnifiedDirectoryModule'

/**
 * 视图模式类型
 */
export type ViewMode = 'large-icon' | 'medium-icon' | 'small-icon' | 'list'

/**
 * 排序字段类型
 */
export type SortBy = 'name' | 'date' | 'type'

/**
 * 排序顺序类型
 */
export type SortOrder = 'asc' | 'desc'

/**
 * 统一目录配置接口
 * 独立于项目配置的目录数据结构
 */
export interface UnifiedDirectoryConfig {
  // 目录数据
  directories: VirtualDirectory[] // 目录列表
  openTabs: DisplayTab[] // 打开的标签页列表
  activeTabId: string // 当前活动标签页ID

  // 视图和排序设置
  viewMode: ViewMode // 视图模式
  sortBy: SortBy // 排序字段
  sortOrder: SortOrder // 排序顺序
}
