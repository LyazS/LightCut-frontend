/**
 * AI生成数据源查询函数和工厂函数
 * 基于"核心数据与行为分离"的重构方案
 */

import type { BaseDataSourceData, DataSourceRuntimeState } from '@/core/datasource/core/BaseDataSource'
import { reactive } from 'vue'
import { RuntimeStateFactory, SourceOrigin } from '@/core/datasource/core/BaseDataSource'

// 导出所有类型定义
export * from './types'

// 导入枚举（作为值）和类型
import {
  AITaskType,
  ContentType,
  TaskStatus,
  TaskStreamEventType,
} from './types'

import type {
  MediaGenerationRequest,
} from './types'

// ==================== 数据源接口定义 ====================

/**
 * AI生成数据源基类型 - 只包含持久化数据
 */
export interface BaseAIGenerationSourceData extends BaseDataSourceData {
  type: 'ai-generation'
  aiTaskId: string
  requestParams: MediaGenerationRequest
  estimatedCost?: number
  actualCost?: number
  resultPath?: string // 远程任务完成后的结果路径
  taskStatus: TaskStatus // 🌟 新增：持久化任务状态（必填）
}

/**
 * AI生成数据源 - 继承基类型和运行时状态
 */
export interface AIGenerationSourceData extends BaseAIGenerationSourceData, DataSourceRuntimeState {
  estimatedTime?: number
  streamConnected?: boolean
  currentStage?: string
  metadata?: Record<string, any>
}

// ==================== 工厂函数 ====================

/**
 * AI生成数据源工厂函数
 */
export const AIGenerationSourceFactory = {
  /**
   * 创建AI生成数据源
   * @param param 基础数据
   * @param origin 数据源来源标识（必须明确传入）
   */
  createAIGenerationSource(
    param: BaseAIGenerationSourceData,
    origin: SourceOrigin, // 必须明确传入来源
  ): AIGenerationSourceData {
    return reactive({
      ...param,
      ...RuntimeStateFactory.createRuntimeState(origin),
      estimatedTime: undefined,
      currentStage: undefined,
      streamConnected: false,
      metadata: {},
    }) as AIGenerationSourceData
  },
}

// ==================== 类型守卫 ====================

/**
 * AI生成类型守卫
 */
export const AIGenerationTypeGuards = {
  isAIGenerationSource(source: BaseDataSourceData): source is AIGenerationSourceData {
    return source.type === 'ai-generation'
  },
}

// ==================== AI生成特定查询函数 ====================

/**
 * AI生成特定查询函数
 */
export const AIGenerationQueries = {
  /**
   * 获取AI任务ID
   */
  getAITaskId(source: BaseDataSourceData): string | null {
    return AIGenerationTypeGuards.isAIGenerationSource(source) ? source.aiTaskId : null
  },


  /**
   * 获取任务状态
   */
  getTaskStatus(source: AIGenerationSourceData): TaskStatus | undefined {
    return source.taskStatus
  },

  /**
   * 获取当前阶段描述
   */
  getCurrentStage(source: AIGenerationSourceData): string | undefined {
    return source.currentStage
  },

  /**
   * 是否已连接流
   */
  isStreamConnected(source: AIGenerationSourceData): boolean {
    return source.streamConnected || false
  },

  /**
   * 获取请求参数
   */
  getRequestParams(source: AIGenerationSourceData): MediaGenerationRequest {
    return source.requestParams
  },

  /**
   * 获取预估成本
   */
  getEstimatedCost(source: AIGenerationSourceData): number | undefined {
    return source.estimatedCost
  },

  /**
   * 获取实际成本
   */
  getActualCost(source: AIGenerationSourceData): number | undefined {
    return source.actualCost
  },
}

// ==================== 数据源提取函数 ====================

/**
 * 提取AI生成数据源的持久化数据
 */
export function extractAIGenerationSourceData(
  source: AIGenerationSourceData,
): BaseAIGenerationSourceData {
  return {
    // 基础字段
    type: source.type,
    // 🌟 阶段二彻底重构：不再保存 id 和 mediaReferenceId

    // 特定字段
    aiTaskId: source.aiTaskId,
    requestParams: source.requestParams,
    estimatedCost: source.estimatedCost,
    actualCost: source.actualCost,
    resultPath: source.resultPath, // 保存结果路径
    taskStatus: source.taskStatus, // 🌟 新增：保存任务状态

    // 不需要保存运行时状态
    // estimatedTime: source.estimatedTime, // 运行时状态
    // streamConnected: source.streamConnected, // 运行时状态
    // currentStage: source.currentStage, // 运行时状态
    // metadata: source.metadata, // 运行时状态
    // progress: source.progress, // 重新加载时会重置
    // errorMessage: source.errorMessage, // 重新加载时会重置
    // sourceOrigin: source.sourceOrigin, // 重新加载时会重新设置
  }
}

/**
 * 映射内容类型到媒体类型
 */
export function mapContentTypeToMediaType(contentType: ContentType): 'image' | 'video' | 'audio' {
  switch (contentType) {
    case ContentType.IMAGE:
      return 'image'
    case ContentType.VIDEO:
      return 'video'
    case ContentType.AUDIO:
      return 'audio'
    default:
      return 'image'
  }
}
