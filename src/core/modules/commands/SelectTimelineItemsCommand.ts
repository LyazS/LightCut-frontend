import { generateCommandId } from '@/core/utils/idGenerator'
import type { SimpleCommand } from '@/core/modules/commands/types'
import { historyLabels, type HistoryLabel } from '@/core/modules/historyLabel'
import type { TimelineSelectionId } from '@/core/types/timelineSelection'

/**
 * 选择时间轴项目命令
 * 支持已知和未知时间轴项目的单选和多选操作的撤销/重做
 * 记录选择状态的变化，支持恢复到之前的选择状态
 */
export class SelectTimelineSelectionsCommand implements SimpleCommand {
  public readonly id: string
  public readonly historyLabel: HistoryLabel
  private previousSelection: Set<TimelineSelectionId> // 保存操作前的选择状态
  private newSelection: Set<TimelineSelectionId> // 保存操作后的选择状态
  private _isDisposed = false

  constructor(
    private itemIds: TimelineSelectionId[],
    private mode: 'replace' | 'toggle',
    private selectionModule: {
      selectedTimelineSelectionIds: { value: Set<TimelineSelectionId> }
    },
  ) {
    this.id = generateCommandId()

    // 保存当前选择状态
    this.previousSelection = new Set(this.selectionModule.selectedTimelineSelectionIds.value)

    // 计算新的选择状态
    this.newSelection = this.calculateNewSelection()

    // 生成描述信息
    this.historyLabel = this.generateHistoryLabel()

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
  private calculateNewSelection(): Set<TimelineSelectionId> {
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
  private generateHistoryLabel(): HistoryLabel {
    if (this.mode === 'replace') {
      if (this.itemIds.length === 0) {
        return historyLabels.clearSelection()
      }
      return historyLabels.selectItems(this.itemIds.length)
    } else {
      const selectedCount = this.itemIds.filter((id) => this.previousSelection.has(id)).length
      if (selectedCount === 0) {
        return historyLabels.addSelection(this.itemIds.length)
      }
      if (selectedCount === this.itemIds.length) {
        return historyLabels.removeSelection(selectedCount)
      }
      return historyLabels.toggleSelection(this.itemIds.length)
    }
  }

  /**
   * 执行命令：应用新的选择状态
   */
  async execute(): Promise<void> {
    try {
      console.log('🔄 执行选择操作:', this.historyLabel.key)

      // 直接设置选择状态，避免触发新的历史记录
      this.applySelection(this.newSelection)

      console.log(`✅ 选择操作完成: ${Array.from(this.newSelection).length} 个项目被选中`)
    } catch (error) {
      console.error('❌ 选择操作失败:', this.historyLabel.key, error)
      throw error
    }
  }

  /**
   * 撤销命令：恢复到之前的选择状态
   */
  async undo(): Promise<void> {
    try {
      console.log('🔄 撤销选择操作:', this.historyLabel.key)

      // 恢复到之前的选择状态
      this.applySelection(this.previousSelection)

      console.log(`↩️ 已恢复选择状态: ${Array.from(this.previousSelection).length} 个项目被选中`)
    } catch (error) {
      console.error('❌ 撤销选择操作失败:', this.historyLabel.key, error)
      throw error
    }
  }

  /**
   * 应用选择状态（不触发历史记录）
   */
  private applySelection(selection: Set<TimelineSelectionId>): void {
    this.selectionModule.selectedTimelineSelectionIds.value.clear()
    selection.forEach((id) => this.selectionModule.selectedTimelineSelectionIds.value.add(id))
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
    console.log(`🗑️ [SelectTimelineSelectionsCommand] 命令资源已清理: ${this.id}`)
  }
}
