import { ref } from 'vue'
import type { SimpleCommand } from '@/core/modules/commands/types'
import type { ModuleRegistry } from './ModuleRegistry'
import { MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedUseNaiveUIModule } from './UnifiedUseNaiveUIModule'
import { useAppI18n } from '@/core/composables/useI18n'
import { generateBatchCommandId } from '@/core/utils/idGenerator'
import { HistoryPreconditionError } from './commands/HistoryPreconditionError'
import type { HistoryLabel } from './historyLabel'

/**
 * 批量命令基类
 * 支持将多个单个命令组合为一个批量操作，统一执行和撤销
 */
export abstract class BaseBatchCommand implements SimpleCommand {
  public readonly id: string
  public readonly historyLabel: HistoryLabel
  protected subCommands: SimpleCommand[] = []
  private _isDisposed = false

  constructor(historyLabel: HistoryLabel) {
    this.id = this.generateCommandId()
    this.historyLabel = historyLabel
  }

  /**
   * 批量执行：依次执行所有子命令
   */
  async execute(): Promise<void> {
    for (const command of this.subCommands) {
      await command.execute()
    }
  }

  /**
   * 批量撤销：逆序撤销所有子命令
   */
  async undo(): Promise<void> {
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      await this.subCommands[i].undo()
    }
  }

  /**
   * 添加子命令
   */
  protected addCommand(command: SimpleCommand): void {
    this.subCommands.push(command)
  }

  get commandCount(): number {
    return this.subCommands.length
  }

  /**
   * 检查命令是否已被清理
   */
  get isDisposed(): boolean {
    return this._isDisposed
  }

  /**
   * 清理批量命令及其子命令的资源
   */
  dispose(): void {
    if (this._isDisposed) {
      return
    }

    try {
      // 先清理所有子命令
      this.subCommands.forEach((command) => {
        command.dispose()
      })

      // 清空子命令数组
      this.subCommands = []

      this._isDisposed = true
      console.log('🧹 批量命令资源已清理:', this.historyLabel.key)
    } catch (error) {
      console.error('❌ 清理批量命令资源失败:', this.historyLabel.key, error)
      // 不抛出错误，避免影响主要功能
    }
  }

  /**
   * 生成命令ID
   */
  private generateCommandId(): string {
    return generateBatchCommandId()
  }
}

/**
 * 批量操作构建器
 * 提供链式调用方式构建批量命令
 */
export class BatchBuilder {
  private commands: SimpleCommand[] = []
  private historyLabel: HistoryLabel

  constructor(historyLabel: HistoryLabel) {
    this.historyLabel = historyLabel
  }

  /**
   * 添加命令到批量操作（支持链式调用）
   */
  addCommand(command: SimpleCommand): BatchBuilder {
    this.commands.push(command)
    return this
  }

  /**
   * 构建批量命令
   */
  build(): GenericBatchCommand {
    return new GenericBatchCommand(this.historyLabel, this.commands)
  }

  /**
   * 获取命令数量
   */
  getCommandCount(): number {
    return this.commands.length
  }
}

/**
 * 通用批量命令实现
 */
export class GenericBatchCommand extends BaseBatchCommand {
  constructor(historyLabel: HistoryLabel, commands: SimpleCommand[]) {
    super(historyLabel)
    this.subCommands = [...commands]
  }
}

/**
 * 历史管理模块
 * 提供响应式的撤销/重做状态和方法
 */
export function createUnifiedHistoryModule(registry: ModuleRegistry) {
  // 通过注册中心获取通知模块
  const useNaiveUIModule = registry.get<UnifiedUseNaiveUIModule>(MODULE_NAMES.USENAIVEUI)

  // 获取多语言函数
  const { t } = useAppI18n()
  // ==================== 状态定义 ====================

  // 历史管理相关变量（原SimpleHistoryManager的功能）
  const commands: SimpleCommand[] = []
  let currentIndex = -1

  // 响应式状态
  const canUndo = ref(false)
  const canRedo = ref(false)

  function formatHistoryLabel(historyLabel: HistoryLabel): string {
    return String(t(historyLabel.key, historyLabel.params ?? {}))
  }

  function formatCommandLabel(command: SimpleCommand): string {
    return formatHistoryLabel(command.historyLabel)
  }

  function formatExecutionError(): string {
    return String(t('notification.history.executionError'))
  }

  // ==================== 内部方法 ====================

  /**
   * 安全地调用命令的 dispose 方法
   * @param command 要清理的命令
   */
  function disposeCommand(command: SimpleCommand): void {
    try {
      // 检查命令是否已被清理
      if (command.isDisposed) {
        console.log('⚠️ 命令已被清理:', command.historyLabel.key)
        return
      }

      // 检查命令是否有 dispose 方法
      if (typeof command.dispose === 'function') {
        command.dispose()
        console.log('🧹 命令资源已清理:', command.historyLabel.key)
      }
    } catch (error) {
      console.error('❌ 清理命令资源失败:', command.historyLabel.key, error)
      // 不抛出错误，避免影响主要功能
    }
  }

  /**
   * 检查是否可以撤销
   * @returns 是否可以撤销
   */
  function canUndoInternal(): boolean {
    return currentIndex >= 0
  }

  /**
   * 检查是否可以重做
   * @returns 是否可以重做
   */
  function canRedoInternal(): boolean {
    return currentIndex < commands.length - 1
  }

  /**
   * 更新响应式状态
   */
  function updateReactiveState() {
    canUndo.value = canUndoInternal()
    canRedo.value = canRedoInternal()
  }

  function removeCommandAt(index: number, reason: string): void {
    const command = commands[index]
    if (!command) {
      return
    }

    commands.splice(index, 1)
    disposeCommand(command)

    if (currentIndex >= index) {
      currentIndex--
    }

    console.warn('🧹 已移除失效历史命令:', command.historyLabel.key, reason)
  }

  // ==================== 公共方法 ====================

  /**
   * 执行命令并添加到历史记录
   * @param command 要执行的命令
   */
  async function executeCommand(command: SimpleCommand): Promise<void> {
    try {
      // 执行命令
      await command.execute()

      // 清除当前位置之后的所有命令（如果用户在历史中间执行了新命令）
      if (currentIndex < commands.length - 1) {
        const removedCommands = commands.splice(currentIndex + 1)
        // 清理被移除命令的资源
        removedCommands.forEach((command) => disposeCommand(command))
        console.log(`🧹 已清理 ${removedCommands.length} 个被移除命令的资源`)
      }

      // 添加新命令到历史记录
      commands.push(command)
      currentIndex++

      console.log('✅ 命令已执行:', command.historyLabel.key)
      console.log(`📊 历史记录: ${currentIndex + 1}/${commands.length}`)
    } catch (error) {
      console.error('❌ 命令执行失败:', command.historyLabel.key, error)

      // 显示错误通知
      useNaiveUIModule.messageError(
        t('notification.executeFailed', {
          description: formatCommandLabel(command),
          error: formatExecutionError(),
        }),
      )

      throw error
    }
    updateReactiveState()
  }

  /**
   * 撤销上一个命令
   * @returns 是否成功撤销
   */
  async function undo(): Promise<boolean> {
    if (!canUndoInternal()) {
      console.log('⚠️ 没有可撤销的操作')
      useNaiveUIModule.messageWarning(t('notification.cannotUndo'))
      return false
    }

    try {
      const commandIndex = currentIndex
      const command = commands[commandIndex]
      await command.undo()
      currentIndex--

      console.log('↩️ 已撤销:', command.historyLabel.key)
      console.log(`📊 历史记录: ${currentIndex + 1}/${commands.length}`)

      // 显示成功通知
      useNaiveUIModule.messageSuccess(
        t('notification.undoSuccess', { description: formatCommandLabel(command) }),
      )

      updateReactiveState()
      return true
    } catch (error) {
      console.error('❌ 撤销操作失败', error)
      removeCommandAt(currentIndex, 'undo failed')
      updateReactiveState()

      if (error instanceof HistoryPreconditionError) {
        useNaiveUIModule.messageWarning(t('notification.historyPreconditionFailed'))
        return false
      }

      // 显示错误通知
      useNaiveUIModule.messageError(
        t('notification.undoFailed', {
          error:
            error instanceof Error ? error.message : t('common.unknownError', {}, 'Unknown error'),
        }),
      )

      return false
    }
  }

  /**
   * 重做下一个命令
   * @returns 是否成功重做
   */
  async function redo(): Promise<boolean> {
    if (!canRedoInternal()) {
      console.log('⚠️ 没有可重做的操作')
      useNaiveUIModule.messageWarning(t('notification.cannotRedo'))
      return false
    }

    try {
      currentIndex++
      const commandIndex = currentIndex
      const command = commands[commandIndex]
      await command.execute()

      console.log('↪️ 已重做:', command.historyLabel.key)
      console.log(`📊 历史记录: ${currentIndex + 1}/${commands.length}`)

      // 显示成功通知
      useNaiveUIModule.messageSuccess(
        t('notification.redoSuccess', { description: formatCommandLabel(command) }),
      )

      updateReactiveState()
      return true
    } catch (error) {
      console.error('❌ 重做操作失败', error)
      removeCommandAt(currentIndex, 'redo failed')
      updateReactiveState()

      if (error instanceof HistoryPreconditionError) {
        useNaiveUIModule.messageWarning(t('notification.historyPreconditionFailed'))
        return false
      }

      // 显示错误通知
      useNaiveUIModule.messageError(
        t('notification.redoFailed', {
          error:
            error instanceof Error ? error.message : t('common.unknownError', {}, 'Unknown error'),
        }),
      )

      return false
    }
  }

  /**
   * 清空历史记录
   */
  function clear(): void {
    // 清理所有命令的资源
    const commandsToDispose = [...commands]
    commandsToDispose.forEach((command) => disposeCommand(command))

    commands.length = 0
    currentIndex = -1
    console.log(`🗑️ 历史记录已清空，已清理 ${commandsToDispose.length} 个命令的资源`)
    updateReactiveState()
  }

  /**
   * 获取历史记录摘要（用于调试）
   * @returns 历史记录摘要
   */
  function getHistorySummary() {
    return {
      totalCommands: commands.length,
      currentIndex: currentIndex,
      canUndo: canUndoInternal(),
      canRedo: canRedoInternal(),
      commands: commands.map((cmd, index) => ({
        id: cmd.id,
        description: formatCommandLabel(cmd),
        historyLabel: cmd.historyLabel,
        isCurrent: index === currentIndex,
        isExecuted: index <= currentIndex,
        isBatch: cmd instanceof BaseBatchCommand,
        batchSummary:
          cmd instanceof BaseBatchCommand
            ? {
                description: formatCommandLabel(cmd),
                commandCount: cmd.commandCount,
              }
            : undefined,
      })),
    }
  }

  /**
   * 开始批量操作
   * @param historyLabel 批量操作的语义标签
   * @returns 批量操作构建器
   */
  function startBatch(historyLabel: HistoryLabel): BatchBuilder {
    return new BatchBuilder(historyLabel)
  }

  /**
   * 执行批量命令
   * @param batchCommand 要执行的批量命令
   */
  async function executeBatchCommand(batchCommand: BaseBatchCommand): Promise<void> {
    try {
      await batchCommand.execute()

      // 添加到历史记录（作为单个条目）
      if (currentIndex < commands.length - 1) {
        const removedCommands = commands.splice(currentIndex + 1)
        // 清理被移除命令的资源
        removedCommands.forEach((command) => disposeCommand(command))
        console.log(`🧹 已清理 ${removedCommands.length} 个被移除批量命令的资源`)
      }

      commands.push(batchCommand)
      currentIndex++

      console.log('✅ 批量命令已执行:', batchCommand.historyLabel.key)

      // 显示批量操作成功通知
      useNaiveUIModule.messageSuccess(
        t('notification.batchSuccess', { summary: formatCommandLabel(batchCommand) }),
      )
    } catch (error) {
      console.error('❌ 批量命令执行失败:', batchCommand.historyLabel.key, error)

      useNaiveUIModule.messageError(
        t('notification.batchFailed', {
          description: formatCommandLabel(batchCommand),
          error: formatExecutionError(),
        }),
      )

      throw error
    }
    updateReactiveState()
  }

  /**
   * 根据命令ID获取命令
   * @param id 命令ID
   * @returns 找到的命令或undefined
   */
  function getCommand(id: string): SimpleCommand | undefined {
    return commands.find((command) => command.id === id)
  }

  // ==================== 导出接口 ====================

  return {
    // 响应式状态
    canUndo,
    canRedo,

    // 历史操作方法
    executeCommand,
    undo,
    redo,
    clear,
    getHistorySummary,
    getCommand,

    // 批量操作方法
    startBatch,
    executeBatchCommand,
  }
}
export type UnifiedHistoryModule = ReturnType<typeof createUnifiedHistoryModule>
