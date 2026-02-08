/**
 * BizyAir 数据源查询函数和工厂函数
 * 基于"核心数据与行为分离"的重构方案
 */

import type {
  BaseDataSourceData,
  DataSourceRuntimeState,
} from '@/core/datasource/core/BaseDataSource'
import { reactive } from 'vue'
import { RuntimeStateFactory, SourceOrigin } from '@/core/datasource/core/BaseDataSource'

// 导出所有类型定义
export * from './types'

// 导入枚举（作为值）和类型
import { BizyAirTaskStatus } from './types'

import type {
  BizyAirMediaGenerationRequest,
  BizyAirTaskResultData,
  BaseBizyAirSourceData,
} from './types'

// ==================== 数据源接口定义 ====================
// 注意：BaseBizyAirSourceData 已在 types.ts 中定义，此处不需要重复定义

/**
 * BizyAir 数据源 - 继承基类型和运行时状态
 */
export interface BizyAirSourceData extends BaseBizyAirSourceData, DataSourceRuntimeState {}

// ==================== 工厂函数 ====================

/**
 * BizyAir 数据源工厂函数
 */
export const BizyAirSourceFactory = {
  /**
   * 创建 BizyAir 数据源
   * @param param 基础数据
   * @param origin 数据源来源标识（必须明确传入）
   */
  createBizyAirSource(
    param: BaseBizyAirSourceData,
    origin: SourceOrigin, // 必须明确传入来源
  ): BizyAirSourceData {
    return reactive({
      ...param,
      ...RuntimeStateFactory.createRuntimeState(origin),
    }) as BizyAirSourceData
  },
}

// ==================== 类型守卫 ====================

/**
 * BizyAir 类型守卫
 */
export const BizyAirTypeGuards = {
  isBizyAirSource(source: BaseDataSourceData): source is BizyAirSourceData {
    return source.type === 'bizyair'
  },
}

// ==================== BizyAir 特定查询函数 ====================

/**
 * BizyAir 特定查询函数
 */
export const BizyAirQueries = {
  /**
   * 获取 BizyAir 任务 ID
   */
  getBizyAirTaskId(source: BaseDataSourceData): string | null {
    return BizyAirTypeGuards.isBizyAirSource(source) ? source.bizyairTaskId : null
  },

  /**
   * 获取任务状态
   */
  getTaskStatus(source: BizyAirSourceData): BizyAirTaskStatus {
    return source.taskStatus
  },

  /**
   * 获取请求参数
   */
  getRequestParams(source: BizyAirSourceData): BizyAirMediaGenerationRequest {
    return source.requestParams
  },

  /**
   * 获取结果数据
   */
  getResultData(source: BizyAirSourceData): BizyAirTaskResultData | undefined {
    return source.resultData
  },

  /**
   * 检查任务是否已完成
   */
  isTaskCompleted(source: BizyAirSourceData): boolean {
    return source.taskStatus === BizyAirTaskStatus.SUCCESS
  },

  /**
   * 检查任务是否失败
   */
  isTaskFailed(source: BizyAirSourceData): boolean {
    return source.taskStatus === BizyAirTaskStatus.FAILED
  },

  /**
   * 检查任务是否已取消
   */
  isTaskCanceled(source: BizyAirSourceData): boolean {
    return source.taskStatus === BizyAirTaskStatus.CANCELED
  },

  /**
   * 检查任务是否正在进行中
   */
  isTaskRunning(source: BizyAirSourceData): boolean {
    return (
      source.taskStatus === BizyAirTaskStatus.QUEUING ||
      source.taskStatus === BizyAirTaskStatus.PREPARING ||
      source.taskStatus === BizyAirTaskStatus.RUNNING
    )
  },
}

// ==================== 数据源提取函数 ====================

/**
 * 提取 BizyAir 数据源的持久化数据
 */
export function extractBizyAirSourceData(source: BizyAirSourceData): BaseBizyAirSourceData {
  return {
    // 基础字段
    type: source.type,

    // 特定字段
    bizyairTaskId: source.bizyairTaskId,
    requestParams: source.requestParams,
    resultData: source.resultData, // 保存结果数据
    taskStatus: source.taskStatus, // 保存任务状态

    // 不需要保存运行时状态和敏感信息
    // progress: source.progress, // 运行时状态
    // errorMessage: source.errorMessage, // 运行时状态
    // sourceOrigin: source.sourceOrigin, // 运行时状态
    // apiKey: source.apiKey, // API Key 从统一Store获取，不持久化
  }
}

/**
 * 映射内容类型到媒体类型（BizyAir 版本）
 */
export function mapBizyAirContentTypeToMediaType(contentType: string): 'image' | 'video' | 'audio' {
  switch (contentType) {
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'audio':
      return 'audio'
    default:
      return 'image'
  }
}
