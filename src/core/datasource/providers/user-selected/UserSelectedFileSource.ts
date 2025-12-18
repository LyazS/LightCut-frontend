/**
 * 用户选择文件数据源类型定义和查询函数
 * 基于"核心数据与行为分离"的重构方案
 * 行为函数已移动到 UserSelectedFileManager 中
 */
import type {
  BaseDataSourceData,
  DataSourceRuntimeState,
} from '@/core/datasource/core/BaseDataSource'
import { reactive } from 'vue'
import { RuntimeStateFactory, SourceOrigin } from '@/core/datasource/core/BaseDataSource'

// ==================== 用户选择文件数据源类型定义 ====================

/**
 * 用户选择文件数据源基类型 - 只包含持久化数据
 */
export interface BaseUserSelectedFileSourceData extends BaseDataSourceData {
  type: 'user-selected'
}

/**
 * 用户选择文件数据源 - 继承基类型和运行时状态
 * selectedFile 可以是 File 或 null：
 * - USER_CREATE 时初始为 File，使用后设为 null
 * - PROJECT_LOAD 时始终为 null
 */
export type UserSelectedFileSourceData = BaseUserSelectedFileSourceData &
  DataSourceRuntimeState & {
    selectedFile: File | null
  }

// ==================== 工厂函数 ====================

/**
 * 用户选择文件数据源工厂函数
 */
export const UserSelectedFileSourceFactory = {
  /**
   * 从文件对象创建用户选择文件数据源
   * File 对象 → 用户创建
   */
  createFromFile(file: File): UserSelectedFileSourceData {
    return reactive({
      type: 'user-selected' as const,
      selectedFile: file,
      ...RuntimeStateFactory.createRuntimeState(SourceOrigin.USER_CREATE),
    }) as UserSelectedFileSourceData
  },

  /**
   * 从保存的基础数据重建用户选择文件数据源
   */
  createFromBaseData(baseData: BaseUserSelectedFileSourceData): UserSelectedFileSourceData {
    return reactive({
      ...baseData,
      ...RuntimeStateFactory.createRuntimeState(SourceOrigin.PROJECT_LOAD),
      selectedFile: null, // PROJECT_LOAD 时 selectedFile 为 null
    }) as UserSelectedFileSourceData
  },
}

// ==================== 类型守卫 ====================

/**
 * 用户选择文件类型守卫
 */
export const UserSelectedFileTypeGuards = {
  isUserSelectedSource(source: BaseDataSourceData): source is UserSelectedFileSourceData {
    return source.type === 'user-selected'
  },
}

// ==================== 数据源提取函数 ====================

/**
 * 提取用户选择文件数据源的持久化数据
 */
export function extractUserSelectedFileSourceData(
  source: UserSelectedFileSourceData,
): BaseUserSelectedFileSourceData {
  return {
    // 基础字段
    type: source.type,
    // 🌟 阶段二彻底重构：不再保存 id 和 mediaReferenceId
    // 所有引用统一使用 UnifiedMediaItemData.id

    // 不需要保存运行时状态
    // progress: source.progress, // 重新加载时会重置
    // errorMessage: source.errorMessage, // 重新加载时会重置
    // sourceOrigin: source.sourceOrigin, // 重新加载时会重新设置
    // selectedFile 是 File 对象，不能直接序列化
  }
}
