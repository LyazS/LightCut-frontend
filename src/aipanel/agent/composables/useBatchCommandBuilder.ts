/**
 * 批量命令构建器 - 组合式API版本
 * 将操作配置转换为具体命令，专注于命令构建，不负责执行
 */

import type { SimpleCommand } from '@/core/modules/commands/types'
import { useUnifiedStore } from '@/core/unifiedStore'

// 导入共享类型定义
import type {
  OperationConfig,
  BuildOperationResult,
  BuildResult,
} from '../core/types'

/**
 * 批量命令构建器组合式函数
 * 提供批量操作配置到命令的转换功能
 */
export function useBatchCommandBuilder() {
  // 使用统一存储
  const unifiedStore = useUnifiedStore()

  /**
   * 构建批量操作命令
   */
  function buildOperations(operations: OperationConfig[]): BuildResult {
    const batchBuilder = unifiedStore.startBatch('用户脚本批量操作')
    const buildResults: BuildOperationResult[] = []

    for (const op of operations) {
      try {
        const command = createCommandFromOperation(op)
        batchBuilder.addCommand(command)
        buildResults.push({ success: true, operation: op })
      } catch (error: any) {
        buildResults.push({
          success: false,
          operation: op,
          error: error.message,
        })
      }
    }

    return {
      batchCommand: batchBuilder.build(),
      buildResults,
    }
  }

  /**
   * 根据操作类型创建对应的命令
   * 当前不实现任何命令
   */
  function createCommandFromOperation(op: OperationConfig): SimpleCommand {
    throw new Error(`不支持的操作类型: ${op.type}`)
  }

  return {
    buildOperations,
    createCommandFromOperation,
  }
}
