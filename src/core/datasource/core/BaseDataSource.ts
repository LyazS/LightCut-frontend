/**
 * 数据源基础类型设计（响应式重构版）
 * 基于"核心数据与行为分离"的重构方案
 */

import { reactive } from 'vue'
import { generateUUID4 } from '@/core/utils/idGenerator'

// ==================== 核心数据结构 ====================

/**
 * 基础数据源数据接口 - 只包含持久化数据
 * 🌟 阶段二彻底重构：移除 id 和 mediaReferenceId 字段
 * 所有标识和引用统一由 UnifiedMediaItemData.id 管理
 */
export interface BaseDataSourceData {
  readonly type: string
}

/**
 * 数据源来源类型
 */
export enum SourceOrigin {
  /** 用户创建（需要保存文件） */
  USER_CREATE = 'user-create',
  /** 项目加载（不需要保存文件） */
  PROJECT_LOAD = 'project-load',
}

/**
 * 数据源运行时状态接口 - 包含所有运行时状态字段
 * 注意：此接口中的所有字段都是运行时字段，不会被持久化
 */
export interface DataSourceRuntimeState {
  progress: number
  errorMessage?: string
  sourceOrigin: SourceOrigin // 运行时字段：标识数据源来源
}

// 注意：UnifiedDataSourceData 类型在 DataSourceTypes.ts 中定义
// 这里只导出基础类型，避免循环依赖

// ==================== 运行时状态工厂函数 ====================

/**
 * 运行时状态工厂函数 - 创建运行时状态对象
 */
export const RuntimeStateFactory = {
  /**
   * 创建运行时状态对象
   * @param origin 数据源来源标识
   */
  createRuntimeState(origin: SourceOrigin): DataSourceRuntimeState {
    return reactive({
      progress: 0,
      sourceOrigin: origin,
    })
  },
}

// ==================== 基础类型守卫 ====================

/**
 * 基础类型守卫函数
 */
export const BaseDataSourceTypeGuards = {
  isBaseDataSource(source: unknown): source is BaseDataSourceData {
    return (
      typeof source === 'object' &&
      source !== null &&
      typeof (source as Record<string, unknown>).type === 'string'
    )
  },

  isRuntimeState(source: unknown): source is DataSourceRuntimeState {
    return (
      typeof source === 'object' &&
      source !== null &&
      typeof (source as Record<string, unknown>).progress === 'number'
    )
  },
}

// ==================== 业务协调层（协调完整的业务操作） ====================

/**
 * 运行时状态操作函数 - 协调数据操作和状态转换，处理完整的业务流程
 * 基础数据操作已直接内联到业务协调函数中
 */
export const RuntimeStateActions = {
  // 开始获取流程
  startAcquisition(state: DataSourceRuntimeState): void {
    state.errorMessage = undefined
  },

  // 完成获取流程（不包含媒体类型检测）
  completeAcquisition(state: DataSourceRuntimeState): void {
    // 设置数据
    state.progress = 100
    state.errorMessage = undefined
  },

  // 设置错误状态
  setError(state: DataSourceRuntimeState, errorMessage: string): void {
    state.errorMessage = errorMessage
    state.progress = 0
  },

  // 取消获取
  cancel(state: DataSourceRuntimeState): void {
    state.progress = 0
    state.errorMessage = undefined
  },

  // 设置缺失状态
  setMissing(state: DataSourceRuntimeState): void {
    state.progress = 0
    state.errorMessage = '文件缺失'
  },

  // ==================== 基础数据操作函数（保留以供直接调用） ====================

  // 进度管理
  setProgress(state: DataSourceRuntimeState, progress: number): void {
    state.progress = Math.max(0, Math.min(100, progress))
  },

  resetProgress(state: DataSourceRuntimeState): void {
    state.progress = 0
  },

  // 错误信息管理
  setErrorMessage(state: DataSourceRuntimeState, errorMessage: string): void {
    state.errorMessage = errorMessage
  },

  clearError(state: DataSourceRuntimeState): void {
    state.errorMessage = undefined
  },
}

// ==================== 通用查询函数 ====================

/**
 * 运行时状态查询函数 - 纯函数，用于状态查询和计算
 */
export const RuntimeStateQueries = {
  // 基础类型查询
  isRuntimeState(source: unknown): source is DataSourceRuntimeState {
    return BaseDataSourceTypeGuards.isRuntimeState(source)
  },
}
