import { ref, computed, type Raw, type Ref } from 'vue'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import type { ModuleRegistry } from './ModuleRegistry'
import { MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedTimelineModule } from './UnifiedTimelineModule'
import type { UnifiedDirectoryModule } from './UnifiedDirectoryModule'
import type { UnifiedMediaModule } from './UnifiedMediaModule'
import type { DisplayItem } from '@/core/directory/types'

/**
 * 统一的选择项类型
 */
export type SelectionItemType = 'timeline-item' | 'media-item'

/**
 * 统一的选择模式
 */
export type SelectionMode = 'replace' | 'toggle' | 'range'

/**
 * 统一选择管理模块
 * 基于新架构的统一类型系统重构的选择管理功能
 *
 * 主要变化：
 * 1. 使用 UnifiedTimelineItemData 替代原有的 LocalTimelineItem | AsyncProcessingTimelineItem
 * 2. 使用 UnifiedMediaItemData 替代原有的 LocalMediaItem
 * 3. 保持与原有模块相同的API接口，便于迁移
 * 4. 支持统一的时间轴项目选择状态管理
 * 5. 使用模块注册中心模式获取依赖，解决循环依赖问题
 * 6. 彻底重构，不保持向后兼容
 * 7. 支持素材区范围选择，时间轴不支持范围选择
 * 8. 时间轴和素材区选择互斥
 */
export function createUnifiedSelectionModule(registry: ModuleRegistry) {
  // 通过注册中心获取依赖模块
  const timelineModule = registry.get<UnifiedTimelineModule>(MODULE_NAMES.TIMELINE)
  const directoryModule = registry.get<UnifiedDirectoryModule>(MODULE_NAMES.DIRECTORY)
  const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)
  const getTimelineItem = (id: string) => timelineModule.getTimelineItem(id)

  // ==================== 状态定义 ====================

  // 时间轴项目选择状态
  const selectedTimelineItemIds = ref<Set<string>>(new Set()) // 选中时间轴项目ID集合
  const lastSelectedTimelineItemId = ref<string | null>(null) // 最后选中的时间轴项目ID

  // 媒体项目选择状态
  const selectedMediaItemIds = ref<Set<string>>(new Set()) // 选中媒体项目ID集合
  const lastSelectedMediaItemId = ref<string | null>(null) // 最后选中的媒体项目ID

  // 计算属性：从集合派生的状态
  const selectedTimelineItemId = computed(() => {
    // 单选时返回唯一ID，多选或无选择时返回null
    return selectedTimelineItemIds.value.size === 1
      ? Array.from(selectedTimelineItemIds.value)[0]
      : null
  })

  const isMultiSelectMode = computed(() => selectedTimelineItemIds.value.size > 1)
  const hasSelection = computed(() => selectedTimelineItemIds.value.size > 0)

  const selectedMediaItemId = computed(() => {
    return selectedMediaItemIds.value.size === 1
      ? Array.from(selectedMediaItemIds.value)[0]
      : null
  })

  const isMediaMultiSelectMode = computed(() => selectedMediaItemIds.value.size > 1)
  const hasMediaSelection = computed(() => selectedMediaItemIds.value.size > 0)

  // ==================== 选择管理方法 ====================

  /**
   * 统一选择方法
   * @param itemIds 要操作的项目ID数组
   * @param mode 操作模式
   * @param itemType 项目类型（timeline-item | media-item）
   */
  function selectItems(
    itemIds: string[],
    mode: SelectionMode = 'replace',
    itemType: SelectionItemType,
  ) {
    const targetSet = itemType === 'timeline-item'
      ? selectedTimelineItemIds.value
      : selectedMediaItemIds.value

    const oldSelection = new Set(targetSet)

    // 互斥选择：选中时间轴项目时清除素材区选择，反之亦然
    if (itemType === 'timeline-item' && selectedMediaItemIds.value.size > 0) {
      console.log('🔄 清除素材区选择（互斥）')
      selectedMediaItemIds.value.clear()
      lastSelectedMediaItemId.value = null
    } else if (itemType === 'media-item' && selectedTimelineItemIds.value.size > 0) {
      console.log('🔄 清除时间轴选择（互斥）')
      selectedTimelineItemIds.value.clear()
      lastSelectedTimelineItemId.value = null
    }

    if (mode === 'range') {
      // 范围选择模式（仅素材区支持）
      if (itemType === 'media-item') {
        handleMediaRangeSelection(itemIds[0])
      } else {
        console.warn('⚠️ 时间轴项目不支持范围选择模式')
        return
      }
    } else if (mode === 'replace') {
      // 替换模式
      targetSet.clear()
      itemIds.forEach((id) => targetSet.add(id))
    } else if (mode === 'toggle') {
      // 切换模式
      itemIds.forEach((id) => {
        if (targetSet.has(id)) {
          targetSet.delete(id)
        } else {
          targetSet.add(id)
        }
      })
    }

    // 更新最后选中项
    if (itemIds.length > 0) {
      if (itemType === 'timeline-item') {
        lastSelectedTimelineItemId.value = itemIds[itemIds.length - 1]
      } else {
        lastSelectedMediaItemId.value = itemIds[itemIds.length - 1]
      }
    }

    console.log('🎯 统一选择操作:', {
      itemType,
      mode,
      itemIds,
      oldSize: oldSelection.size,
      newSize: targetSet.size,
      isMultiSelect: itemType === 'timeline-item'
        ? isMultiSelectMode.value
        : isMediaMultiSelectMode.value,
      clearedOther: itemType === 'timeline-item'
        ? (selectedMediaItemIds.value.size === 0 && oldSelection.size > 0)
        : (selectedTimelineItemIds.value.size === 0 && oldSelection.size > 0),
    })
  }

  /**
   * 处理媒体项目范围选择
   * @param endItemId 结束项ID
   */
  function handleMediaRangeSelection(endItemId: string) {
    // 获取所有可选项的有序列表（包含文件夹和媒体项）
    const allItems = getOrderedDisplayItems()

    if (!allItems || allItems.length === 0) return

    // 获取起始项ID
    const startItemId = lastSelectedMediaItemId.value

    if (!startItemId) {
      // 如果没有起始项，则只选择结束项
      selectItems([endItemId], 'replace', 'media-item')
      return
    }

    // 查找起始和结束索引
    const startIndex = allItems.findIndex(item => item.id === startItemId)
    const endIndex = allItems.findIndex(item => item.id === endItemId)

    if (startIndex === -1 || endIndex === -1) {
      // 如果找不到项，则只选择结束项
      selectItems([endItemId], 'replace', 'media-item')
      return
    }

    // 选择范围内的所有项
    const [minIndex, maxIndex] = [
      Math.min(startIndex, endIndex),
      Math.max(startIndex, endIndex)
    ]
    const rangeItems = allItems.slice(minIndex, maxIndex + 1).map(item => item.id)

    selectItems(rangeItems, 'replace', 'media-item')
  }

  /**
   * 排序显示项（支持文件夹和媒体项）
   * 排序规则与 LibraryMediaGrid.vue 中的 sortItems 函数保持一致
   */
  function sortDisplayItems(
    items: DisplayItem[],
    sortBy: 'name' | 'date' | 'type',
    sortOrder: 'asc' | 'desc'
  ): DisplayItem[] {
    const sorted = [...items]

    sorted.sort((a, b) => {
      // 文件夹始终排在前面
      if (a.type === 'directory' && b.type !== 'directory') return -1
      if (a.type !== 'directory' && b.type === 'directory') return 1

      let comparison = 0

      if (a.type === 'directory' && b.type === 'directory') {
        // 两个都是文件夹，按名称排序
        const dirA = directoryModule.getDirectory(a.id)
        const dirB = directoryModule.getDirectory(b.id)
        const nameA = (dirA?.name || '').toLowerCase()
        const nameB = (dirB?.name || '').toLowerCase()
        comparison = nameA.localeCompare(nameB, 'zh-CN')
      } else if (a.type === 'media' && b.type === 'media') {
        // 两个都是媒体，按媒体类型排序
        const mediaA = mediaModule.getMediaItem(a.id)
        const mediaB = mediaModule.getMediaItem(b.id)

        if (!mediaA || !mediaB) return 0

        switch (sortBy) {
          case 'name':
            comparison = mediaA.name.localeCompare(mediaB.name, 'zh-CN')
            break
          case 'date':
            comparison = (mediaA.createdAt || '').localeCompare(mediaB.createdAt || '')
            break
          case 'type':
            comparison = mediaA.mediaType.localeCompare(mediaB.mediaType)
            if (comparison === 0) {
              comparison = mediaA.name.localeCompare(mediaB.name, 'zh-CN')
            }
            break
        }
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return sorted
  }

  /**
   * 获取有序的显示项列表（包含文件夹和媒体项）
   * @returns 按当前目录排序的显示项数组
   */
  function getOrderedDisplayItems(): DisplayItem[] {
    const currentDir = directoryModule.currentDir.value
    if (!currentDir) return []

    // 获取当前目录的内容（包含文件夹和媒体项）
    const content = directoryModule.getDirectoryContent(currentDir.id)

    // 按当前排序方式排序
    const sortBy = directoryModule.sortBy.value
    const sortOrder = directoryModule.sortOrder.value

    return sortDisplayItems(content, sortBy, sortOrder)
  }

  /**
   * 统一的时间轴项目选择方法
   * @param itemIds 要操作的项目ID数组
   * @param mode 操作模式：'replace'替换选择，'toggle'切换选择状态
   */
  function selectTimelineItems(
    itemIds: string[],
    mode: 'replace' | 'toggle' = 'replace',
  ) {
    return selectItems(itemIds, mode, 'timeline-item')
  }

  /**
   * 统一的媒体项目选择方法
   * @param itemIds 要操作的媒体项目ID数组
   * @param mode 操作模式：'replace'替换选择，'toggle'切换选择状态，'range'范围选择
   */
  function selectMediaItems(itemIds: string[], mode: SelectionMode = 'replace') {
    return selectItems(itemIds, mode, 'media-item')
  }

  /**
   * 检查媒体项目是否被选中
   * @param mediaItemId 媒体项目ID
   * @returns 是否被选中
   */
  function isMediaItemSelected(mediaItemId: string): boolean {
    return selectedMediaItemIds.value.has(mediaItemId)
  }

  /**
   * 选择单个时间轴项目
   * @param timelineItemId 时间轴项目ID，null表示取消选择
   */
  function selectTimelineItem(timelineItemId: string | null) {
    if (timelineItemId) {
      selectTimelineItems([timelineItemId], 'replace')
    } else {
      selectTimelineItems([], 'replace')
    }
  }

  /**
   * 选择单个媒体项目
   * @param mediaItemId 媒体项目ID，null表示取消选择
   */
  function selectMediaItem(mediaItemId: string | null) {
    if (mediaItemId) {
      selectMediaItems([mediaItemId], 'replace')
    } else {
      selectMediaItems([], 'replace')
    }
  }

  // ==================== 多选管理方法（兼容性） ====================

  /**
   * 添加项目到选择集合（兼容性方法）
   * @param timelineItemId 时间轴项目ID
   */
  function addToMultiSelection(timelineItemId: string) {
    // 如果项目未选中，则添加它
    if (!selectedTimelineItemIds.value.has(timelineItemId)) {
      selectTimelineItems([timelineItemId], 'toggle')
    }
  }

  /**
   * 从选择集合移除项目（兼容性方法）
   * @param timelineItemId 时间轴项目ID
   */
  function removeFromMultiSelection(timelineItemId: string) {
    // 如果项目已选中，则移除它
    if (selectedTimelineItemIds.value.has(timelineItemId)) {
      selectTimelineItems([timelineItemId], 'toggle')
    }
  }

  /**
   * 切换项目的选择状态（兼容性方法）
   * @param timelineItemId 时间轴项目ID
   */
  function toggleMultiSelection(timelineItemId: string) {
    selectTimelineItems([timelineItemId], 'toggle')
  }

  /**
   * 清空多选集合（兼容性方法）
   */
  function clearMultiSelection() {
    clearTimelineSelection()
  }

  /**
   * 检查项目是否在多选集合中
   * @param timelineItemId 时间轴项目ID
   * @returns 是否在多选集合中
   */
  function isInMultiSelection(timelineItemId: string): boolean {
    return selectedTimelineItemIds.value.has(timelineItemId)
  }

  /**
   * 切换时间轴项目的选择状态（兼容性方法）
   * @param timelineItemId 时间轴项目ID
   */
  function toggleTimelineItemSelection(timelineItemId: string) {
    if (selectedTimelineItemId.value === timelineItemId) {
      selectTimelineItem(null) // 取消选择
    } else {
      selectTimelineItem(timelineItemId) // 选择
    }
  }

  /**
   * 获取当前选中的时间轴项目
   * @returns 选中的时间轴项目或null
   */
  function getSelectedTimelineItem(): UnifiedTimelineItemData | null {
    if (!selectedTimelineItemId.value) return null
    return getTimelineItem(selectedTimelineItemId.value) || null
  }

  /**
   * 获取选择状态摘要
   * @returns 选择状态摘要对象
   */
  function getSelectionSummary() {
    const selectedItem = getSelectedTimelineItem()
    return {
      hasTimelineSelection: !!selectedTimelineItemId.value,
      selectedTimelineItemId: selectedTimelineItemId.value,
      selectedTimelineItem: selectedItem
        ? {
            id: selectedItem.id,
            mediaItemId: selectedItem.mediaItemId,
            trackId: selectedItem.trackId,
            startTime: selectedItem.timeRange.timelineStartTime / 1000000,
            endTime: selectedItem.timeRange.timelineEndTime / 1000000,
          }
        : null,
    }
  }

  /**
   * 重置选择状态为默认值
   */
  function resetToDefaults() {
    clearAllSelections()
    console.log('🔄 选择状态已重置为默认值')
  }

  /**
   * 检查时间轴项目是否被选中
   * @param timelineItemId 时间轴项目ID
   * @returns 是否被选中
   */
  function isTimelineItemSelected(timelineItemId: string): boolean {
    return selectedTimelineItemIds.value.has(timelineItemId)
  }

  /**
   * 清除时间轴项目选择
   */
  function clearTimelineSelection() {
    selectedTimelineItemIds.value.clear()
    lastSelectedTimelineItemId.value = null
    console.log('🔄 时间轴项目选择已清除')
  }

  /**
   * 清除媒体项目选择
   */
  function clearMediaSelection() {
    selectedMediaItemIds.value.clear()
    lastSelectedMediaItemId.value = null
    console.log('🔄 媒体项目选择已清除')
  }

  /**
   * 清除所有选择
   */
  function clearAllSelections() {
    clearTimelineSelection()
    clearMediaSelection()
  }

  // ==================== 导出接口 ====================

  return {
    // 状态
    selectedTimelineItemId,
    selectedTimelineItemIds,
    isMultiSelectMode,
    hasSelection,
    selectedMediaItemId,
    selectedMediaItemIds,
    isMediaMultiSelectMode,
    hasMediaSelection,

    // 时间轴项目选择方法
    selectTimelineItems,
    selectTimelineItem,
    isTimelineItemSelected,
    clearTimelineSelection,

    // 媒体项目选择方法
    selectMediaItems,
    selectMediaItem,
    isMediaItemSelected,
    clearMediaSelection,

    // 通用方法
    clearAllSelections,

    // 兼容性方法
    toggleTimelineItemSelection,
    getSelectedTimelineItem,
    getSelectionSummary,
    resetToDefaults,

    // 多选兼容性方法
    addToMultiSelection,
    removeFromMultiSelection,
    toggleMultiSelection,
    clearMultiSelection,
    isInMultiSelection,
  }
}

// 导出类型定义
export type UnifiedSelectionModule = ReturnType<typeof createUnifiedSelectionModule>
