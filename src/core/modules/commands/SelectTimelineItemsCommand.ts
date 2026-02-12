import { generateCommandId } from '@/core/utils/idGenerator'
import type { SimpleCommand } from '@/core/modules/commands/types'

// 类型导入
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'

import type { UnifiedMediaItemData, MediaType } from '@/core/mediaitem/types'

/**
 * 选择时间轴项目命令
 * 支持已知和未知时间轴项目的单选和多选操作的撤销/重做
 * 记录选择状态的变化，支持恢复到之前的选择状态
 */
export class SelectTimelineItemsCommand implements SimpleCommand {
  public readonly id: string
  public readonly description: string
  private previousSelection: Set<string> // 保存操作前的选择状态
  private newSelection: Set<string> // 保存操作后的选择状态
  private _isDisposed = false

  constructor(
    private itemIds: string[],
    private mode: 'replace' | 'toggle',
    private selectionModule: {
      selectedTimelineItemIds: { value: Set<string> }
      selectTimelineItems: (itemIds: string[], mode: 'replace' | 'toggle') => void
    },
    private timelineModule: {
      getTimelineItem: (id: string) => UnifiedTimelineItemData<MediaType> | undefined
    },
    private mediaModule: {
      getMediaItem: (id: string | null) => UnifiedMediaItemData | undefined
    },
  ) {
    this.id = generateCommandId()

    // 保存当前选择状态
    this.previousSelection = new Set(this.selectionModule.selectedTimelineItemIds.value)

    // 计算新的选择状态
    this.newSelection = this.calculateNewSelection()

    // 生成描述信息
    this.description = this.generateDescription()

    console.log('💾 保存选择操作数据:', {
      itemIds,
      mode,
      previousSelection: Array.from(this.previousSelection),
      newSelection: Array.from(this.newSelection),
    })
  }

  /**
   * 计算新的选择状态
   */
  private calculateNewSelection(): Set<string> {
    const newSelection = new Set(this.previousSelection)

    if (this.mode === 'replace') {
      // 替换模式：清空现有选择，设置新选择
      newSelection.clear()
      this.itemIds.forEach((id) => newSelection.add(id))
    } else {
      // 切换模式：切换每个项目的选择状态
      this.itemIds.forEach((id) => {
        if (newSelection.has(id)) {
          newSelection.delete(id)
        } else {
          newSelection.add(id)
        }
      })
    }

    return newSelection
  }

  /**
   * 生成操作描述
   */
  private generateDescription(): string {
    const itemNames = this.itemIds.map((id) => {
      const timelineItem = this.timelineModule.getTimelineItem(id)
      if (!timelineItem) return '未知项目'

      // 根据项目类型获取名称
      const mediaItem = this.mediaModule.getMediaItem(timelineItem.mediaItemId)
      return mediaItem?.name || '未知素材'
    })

    if (this.mode === 'replace') {
      if (this.itemIds.length === 0) {
        return '取消选择所有项目'
      } else if (this.itemIds.length === 1) {
        return `选择项目: ${itemNames[0]}`
      } else {
        return `选择 ${this.itemIds.length} 个项目`
      }
    } else {
      // toggle模式
      if (this.itemIds.length === 1) {
        const wasSelected = this.previousSelection.has(this.itemIds[0])
        return wasSelected ? `取消选择: ${itemNames[0]}` : `添加选择: ${itemNames[0]}`
      } else {
        return `切换选择 ${this.itemIds.length} 个项目`
      }
    }
  }

  /**
   * 执行命令：应用新的选择状态
   */
  async execute(): Promise<void> {
    try {
      console.log(`🔄 执行选择操作: ${this.description}`)

      // 直接设置选择状态，避免触发新的历史记录
      this.applySelection(this.newSelection)

      console.log(`✅ 选择操作完成: ${Array.from(this.newSelection).length} 个项目被选中`)
    } catch (error) {
      console.error(`❌ 选择操作失败: ${this.description}`, error)
      throw error
    }
  }

  /**
   * 撤销命令：恢复到之前的选择状态
   */
  async undo(): Promise<void> {
    try {
      console.log(`🔄 撤销选择操作: ${this.description}`)

      // 恢复到之前的选择状态
      this.applySelection(this.previousSelection)

      console.log(`↩️ 已恢复选择状态: ${Array.from(this.previousSelection).length} 个项目被选中`)
    } catch (error) {
      console.error(`❌ 撤销选择操作失败: ${this.description}`, error)
      throw error
    }
  }

  /**
   * 应用选择状态（不触发历史记录）
   */
  private applySelection(selection: Set<string>): void {
    // 直接更新选择状态，不通过selectTimelineItems方法以避免循环调用
    this.selectionModule.selectedTimelineItemIds.value.clear()
    selection.forEach((id) => this.selectionModule.selectedTimelineItemIds.value.add(id))
  }

  /**
   * 检查命令是否已被清理
   */
  get isDisposed(): boolean {
    return this._isDisposed
  }

  /**
   * 清理命令持有的资源
   */
  dispose(): void {
    if (this._isDisposed) {
      return
    }

    this._isDisposed = true
    console.log(`🗑️ [SelectTimelineItemsCommand] 命令资源已清理: ${this.id}`)
  }
}
