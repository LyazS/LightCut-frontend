/**
 * 批量命令构建器 - 组合式API版本
 * 将操作配置转换为具体命令，专注于命令构建，不负责执行
 */

import type { Ref } from 'vue'
import type { SimpleCommand } from '@/core/modules/commands/types'
import type { MediaType } from '@/core/mediaitem/types'
import type {
  VideoMediaConfig,
  ImageMediaConfig,
  AudioMediaConfig,
  TextMediaConfig,
} from '@/core/timelineitem/type'
import type {
  UnifiedHistoryModule,
  UnifiedTimelineModule,
  UnifiedWebavModule,
  UnifiedMediaModule,
  UnifiedConfigModule,
  UnifiedTrackModule,
  UnifiedSelectionModule,
} from '@/core/modules'
import { useUnifiedStore } from '@/core/unifiedStore'
import { useTimelineItemOperations } from '@/core/composables/useTimelineItemOperations'
import { AddTimelineItemCommand } from '@/core/modules/commands/AddTimelineItemCommand'
import { timecodeToFrames } from '@/core/utils/timeUtils'
import { generateId } from '@/core/utils/idGenerator'
import { UnifiedMediaItemQueries } from '@/core/mediaitem/queries'

// 导入共享类型定义
import type {
  AddTimelineItemOperation,
  OperationConfig,
  BuildOperationResult,
  BuildResult,
} from '../core/types'

/**
 * 批量命令构建器组合式函数
 * 提供批量操作配置到命令的转换功能
 */
export function useBatchCommandBuilder(
  unifiedHistoryModule: UnifiedHistoryModule,
  unifiedTimelineModule: UnifiedTimelineModule,
  unifiedMediaModule: UnifiedMediaModule,
  unifiedConfigModule: UnifiedConfigModule,
  unifiedTrackModule: UnifiedTrackModule,
  unifiedSelectionModule: UnifiedSelectionModule,
) {
  // 使用统一存储
  const unifiedStore = useUnifiedStore()
  const { createEnhancedDefaultConfig } = useTimelineItemOperations()

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
   */
  function createCommandFromOperation(op: OperationConfig): SimpleCommand {
    switch (op.type) {
      case 'addTimelineItem':
        return createAddTimelineItemCommand(op.params)
      // 其他命令类型暂时不实现
      default:
        throw new Error(`不支持的操作类型: ${op.type}`)
    }
  }

  /**
   * 创建添加时间轴项目命令
   */
  function createAddTimelineItemCommand(
    params: AddTimelineItemOperation['params'],
  ): AddTimelineItemCommand {
    // 将时间码转换为帧数
    const positionFrames = timecodeToFrames(params.position)

    // 获取对应的MediaItem
    const mediaItem = unifiedStore.getMediaItem(params.mediaItemId)
    if (!mediaItem) {
      throw new Error(`找不到对应的素材项目: ${params.mediaItemId}`)
    }

    // 检查素材状态和错误条件
    const hasError = UnifiedMediaItemQueries.hasAnyError(mediaItem)
    if (hasError) {
      throw new Error('素材解析失败，无法添加到时间轴')
    }

    // 检查媒体类型是否已知 - 阻止未知类型素材创建时间轴项目
    if (UnifiedMediaItemQueries.isUnknownType(mediaItem)) {
      throw new Error('素材类型未确定，请等待检测完成')
    }

    // 检查是否有可用的时长信息
    const availableDuration = mediaItem.duration
    if (!availableDuration || availableDuration <= 0) {
      throw new Error('素材时长信息不可用，请等待解析完成')
    }

    // 现在 mediaType 已经确定不是 'unknown'，可以安全地转换为 MediaType
    const knownMediaType = mediaItem.mediaType as MediaType

    // 根据素材状态确定时间轴项目状态
    const isReady = UnifiedMediaItemQueries.isReady(mediaItem)
    const timelineStatus: 'ready' | 'loading' = isReady ? 'ready' : 'loading'

    // 获取媒体的原始分辨率（仅对视觉媒体有效）- 使用 unifiedStore 的方法
    let originalResolution: { width: number; height: number } | null = null
    if (UnifiedMediaItemQueries.isVideo(mediaItem)) {
      originalResolution = unifiedStore.getVideoOriginalResolution(params.mediaItemId) || null
    } else if (UnifiedMediaItemQueries.isImage(mediaItem)) {
      originalResolution = unifiedStore.getImageOriginalResolution(params.mediaItemId) || null
    }

    // 创建增强的默认配置
    const config = createEnhancedDefaultConfig(knownMediaType, originalResolution)

    // 创建时间轴项目数据 - 与 createMediaClipFromMediaItem 对齐
    const timelineItemData = {
      id: generateId(),
      mediaItemId: params.mediaItemId,
      trackId: params.trackId,
      mediaType: knownMediaType,
      timeRange: {
        timelineStartTime: positionFrames,
        timelineEndTime: positionFrames + availableDuration, // 使用素材的实际时长
        clipStartTime: 0,
        clipEndTime: availableDuration,
      },
      timeRangeN:{
        timelineStart: BigInt(positionFrames),
        timelineEnd: BigInt(positionFrames + availableDuration),
        clipStart: 0n,
        clipEnd: BigInt(availableDuration),
      },
      config: config,
      animation: undefined, // 新创建的项目默认没有动画
      timelineStatus: timelineStatus,
      runtime: {}, // 添加必需的 runtime 字段
    }

    return new AddTimelineItemCommand(
      timelineItemData,
      unifiedTimelineModule,
      unifiedMediaModule,
      unifiedConfigModule,
    )
  }

  return {
    buildOperations,
    createCommandFromOperation,
    createAddTimelineItemCommand,
  }
}
