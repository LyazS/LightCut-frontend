/**
 * ASR 语音识别处理器
 * 负责管理语音识别任务，包括任务提交、进度监控、结果获取等
 */

import {
  DataSourceProcessor,
  type AcquisitionTask,
} from '@/core/datasource/core/BaseDataSourceProcessor'
import { RuntimeStateActions, SourceOrigin } from '@/core/datasource/core/BaseDataSource'
import { DataSourceHelpers } from '@/core/datasource/core/DataSourceHelpers'
import { fetchClient, sleepWithAbortSignal } from '@/utils/fetchClient'
import type { UnifiedMediaItemData, MediaType } from '@/core/mediaitem/types'
import { globalMetaFileManager } from '@/core/managers/media/globalMetaFileManager'
import { DATA_SOURCE_CONCURRENCY } from '@/constants/ConcurrencyConstants'
import { useUnifiedStore } from '@/core/unifiedStore'
import { nextTick } from 'vue'
import { RENDERER_FPS } from '@/core/mediabunny/constant'
import { createTextTimelineItem } from '@/core/utils/textTimelineUtils'
import { setupTimelineItemBunny } from '@/core/bunnyUtils/timelineItemSetup'
import { splitAllUtterancesToSubtitles, type SplitSubtitle } from '@/core/utils/subtitleSplitter'

// 导入类型定义
import { ASRStreamEventType, ASRTaskStatus } from './types'
import type {
  BackendTaskStreamEvent,
  TaskResultData,
  ASRQueryResponse,
  ASRRequestConfig,
} from './types'
import { type ASRSourceData } from './ASRSource'

// ==================== ASR 任务提交请求 ====================

/**
 * ASR 任务提交请求接口
 */
export interface ASRTaskSubmitRequest {
  ai_task_type: 'volcengine_asr'
  content_type: 'audio'
  task_config: ASRRequestConfig
}

/**
 * ASR 任务提交响应接口
 */
export interface ASRTaskSubmitResponse {
  success: boolean
  task_id?: string
  error_message?: string
}

// ==================== ASR 处理器 ====================

/**
 * ASR 语音识别处理器 - 管理语音识别任务
 */
export class ASRProcessor extends DataSourceProcessor {
  private static instance: ASRProcessor

  // 存储每个任务的 AbortController
  private abortControllers: Map<string, AbortController> = new Map()

  /**
   * 获取单例实例
   */
  static getInstance(): ASRProcessor {
    if (!this.instance) {
      this.instance = new ASRProcessor()
    }
    return this.instance
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {
    super()
    // ASR 任务并发数限制
    this.maxConcurrentTasks = DATA_SOURCE_CONCURRENCY.AI_GENERATION_MAX_CONCURRENT_TASKS
  }

  // ==================== 实现抽象方法 ====================

  /**
   * 执行具体的获取任务
   */
  protected async executeTask(task: AcquisitionTask): Promise<void> {
    const mediaItem = task.mediaItem

    console.log(`🎬 [ASRProcessor] 开始执行任务: ${task.id} - ${mediaItem.name}`)

    // executeTask 内部调用 processMediaItem
    await this.processMediaItem(mediaItem)

    // 检查执行结果
    const source = task.mediaItem.source as ASRSourceData
    if (source.errorMessage) {
      throw new Error(source.errorMessage)
    }

    // 处理 ASR 结果：删除占位符，创建文本 items，删除 ASR media item
    // 放在最后执行，确保所有状态转换和 meta 保存都已完成
    if (source.resultData?.asr_result) {
      await this.processASRResult(source, source.resultData.asr_result, mediaItem)
    }

    console.log(`✅ [ASRProcessor] 任务执行成功: ${task.id}`)
  }

  /**
   * 获取处理器类型
   */
  getProcessorType(): string {
    return 'asr'
  }

  // ==================== ASR 特定行为方法 ====================

  /**
   * 提交 ASR 任务到后端
   * @param config ASR 请求配置
   * @returns 任务提交响应
   */
  async submitASRTask(config: ASRRequestConfig): Promise<ASRTaskSubmitResponse> {
    try {
      const request: ASRTaskSubmitRequest = {
        ai_task_type: 'volcengine_asr',
        content_type: 'audio',
        task_config: config,
      }

      const response = await fetchClient.post<ASRTaskSubmitResponse>('/api/media/generate', request)

      if (response.status !== 200) {
        return {
          success: false,
          error_message: `提交任务失败: ${response.statusText}`,
        }
      }

      return response.data
    } catch (error) {
      return {
        success: false,
        error_message: error instanceof Error ? error.message : '网络请求失败',
      }
    }
  }

  /**
   * 进度流处理（使用fetchClient的stream方法）
   * @param asrTaskId 任务ID
   * @param mediaItem 媒体项目
   * @returns 识别结果
   */
  private async startProgressStream(
    asrTaskId: string,
    mediaItem: UnifiedMediaItemData,
  ): Promise<ASRQueryResponse> {
    const source = mediaItem.source as ASRSourceData
    // 创建 AbortController
    const abortController = new AbortController()
    this.abortControllers.set(asrTaskId, abortController)

    return new Promise(async (resolve, reject) => {
      let needReconnect = true
      let delayTime = 1
      try {
        while (needReconnect) {
          // 使用fetchClient的stream方法处理NDJSON流
          await fetchClient
            .stream(
              'GET',
              `/api/media/tasks/${asrTaskId}/status`,
              (streamEvent: BackendTaskStreamEvent): boolean | void => {
                // 处理进度更新
                if (streamEvent.type === ASRStreamEventType.PROGRESS_UPDATE) {
                  console.log(`🎬 [ASRProcessor] 任务进度更新:`, streamEvent)
                  const shouldTransition = this.handleProgressUpdate(source, streamEvent)

                  if (shouldTransition) {
                    console.log(
                      `🔄 [ASRProcessor] 任务状态从 PENDING 转换到 PROCESSING，设置媒体状态为 asyncprocessing`,
                    )
                    this.transitionMediaStatus(mediaItem, 'asyncprocessing')
                  }
                  return false
                }
                // 处理完成
                else if (streamEvent.type === ASRStreamEventType.FINAL) {
                  console.log(`📋 [ASRProcessor] FINAL 事件状态: ${streamEvent.status}`)

                  // 如果是失败或取消状态
                  if (streamEvent.status === ASRTaskStatus.FAILED) {
                    source.taskStatus = ASRTaskStatus.FAILED
                    console.error(`❌ [ASRProcessor] 任务失败，状态: FAILED`)
                    reject(new Error(streamEvent.message))
                    needReconnect = false
                    return true
                  } else if (streamEvent.status === ASRTaskStatus.CANCELLED) {
                    source.taskStatus = ASRTaskStatus.CANCELLED
                    console.warn(`⚠️ [ASRProcessor] 任务已取消，状态: CANCELLED`)
                    reject(new Error(streamEvent.message))
                    needReconnect = false
                    return true
                  }

                  // 从 FINAL 事件中获取 result_data
                  if (!streamEvent.result_data) {
                    console.error(`❌ [ASRProcessor] FINAL 事件中缺少 result_data`)
                    reject(new Error('FINAL 事件中缺少 result_data'))
                    needReconnect = false
                    return true
                  }

                  // 直接保存 result_data（与 AIGenerationProcessor 保持一致）
                  // 处理成功结果
                  this.handleFinalResult(streamEvent.result_data, source)
                    .then(resolve)
                    .catch(reject)
                  needReconnect = false
                  return true
                }
                // 处理错误
                else if (streamEvent.type === ASRStreamEventType.ERROR) {
                  console.error(`❌ [ASRProcessor] 进度流错误: ${streamEvent.message}`)
                  reject(new Error(streamEvent.message))
                  needReconnect = false
                  return true
                }

                // 默认继续读取流
                return false
              },
              undefined,
              { signal: abortController.signal },
            )
            .catch((error) => {
              console.log(`⚠️ [ASRProcessor] 进度流连接中断: ${error.message}`)
            })
          // 只有需要重连时才延迟
          if (needReconnect) {
            console.log(`🔄 [ASRProcessor] 准备重连...`)
            const jitter = delayTime * 0.2 * (Math.random() * 2 - 1)
            const actualDelay = Math.max(0, delayTime + jitter)
            await sleepWithAbortSignal(actualDelay * 1000, abortController.signal)
            delayTime = Math.min(delayTime * 2, 60) // 指数退避，最大60秒
          }
        }
      } finally {
        // 清理 AbortController
        this.abortControllers.delete(asrTaskId)
        console.log(`🧹 [清理] 已清理 AbortController: ${asrTaskId}`)
      }
    })
  }

  /**
   * 处理进度更新
   * @returns 返回是否需要转换媒体状态
   */
  private handleProgressUpdate(
    source: ASRSourceData,
    streamEvent: BackendTaskStreamEvent,
  ): boolean {
    const oldStatus = source.taskStatus

    // 只在进度值真正变化时更新
    if (source.progress !== streamEvent.progress) {
      source.progress = streamEvent.progress ?? 0
    }

    // 只在状态真正变化时更新
    if (streamEvent.status && source.taskStatus !== streamEvent.status) {
      source.taskStatus = streamEvent.status
    }

    // 判断是否需要转换媒体状态
    return oldStatus === ASRTaskStatus.PENDING && streamEvent.status === ASRTaskStatus.PROCESSING
  }

  /**
   * 处理 FINAL 结果
   * @returns 识别结果
   */
  private async handleFinalResult(
    resultData: TaskResultData,
    source: ASRSourceData,
  ): Promise<ASRQueryResponse> {
    // 保存 resultData 到 source（与 AIGenerationProcessor 保持一致）
    source.resultData = resultData

    // 从 resultData.asr_result 中提取 ASR 结果
    const asrResult = resultData.asr_result
    if (!asrResult) {
      throw new Error('resultData 中缺少 asr_result')
    }

    // 注意：processASRResult 已移至 executeTask 的最后执行
    // 这样可以确保所有状态转换和 meta 保存都完成后再处理 ASR 结果

    // 设置 COMPLETED 状态
    source.taskStatus = ASRTaskStatus.COMPLETED
    console.log(`✅ [ASRProcessor] 语音识别任务完成，状态: COMPLETED`)

    // 完成获取流程
    await RuntimeStateActions.completeAcquisition(source)

    // 发送系统通知
    const unifiedStore = useUnifiedStore()
    await unifiedStore.notifySystem('语音识别完成', '您的音频已成功识别')

    return asrResult
  }

  /**
   * 处理ASR结果：删除占位符，批量创建文本items，删除ASR media item
   * @param source ASR数据源
   * @param asrResult ASR识别结果
   * @param mediaItem ASR媒体项目（创建文本后会被删除）
   */
  private async processASRResult(
    source: ASRSourceData,
    asrResult: ASRQueryResponse,
    mediaItem: UnifiedMediaItemData,
  ): Promise<void> {
    const unifiedStore = useUnifiedStore()

    // 1. 获取占位符item信息
    const placeholderId = source.placeholderTimelineItemId
    const sourceTimelineItemId = source.sourceTimelineItemId

    if (!placeholderId || !sourceTimelineItemId) {
      console.warn('⚠️ [ASRProcessor] 缺少占位符ID或源item ID，跳过文本创建')
      return
    }

    const placeholderItem = unifiedStore.getTimelineItem(placeholderId)
    if (!placeholderItem) {
      console.warn('⚠️ [ASRProcessor] 找不到占位符item:', placeholderId)
      return
    }

    // 2. 获取占位符的时间位置
    const startTimeFrames = placeholderItem.timeRange.timelineStartTime
    const trackId = placeholderItem.trackId

    // 3. 删除占位符item（不需要历史记录，直接删除）
    await unifiedStore.removeTimelineItem(placeholderId)
    console.log('🗑️ [ASRProcessor] 已删除占位符item:', placeholderId)

    // 4. 获取utterances并拆分为字幕片段
    const utterances = asrResult.result?.utterances || []
    if (utterances.length === 0) {
      console.warn('⚠️ [ASRProcessor] ASR结果中没有utterances')
      return
    }

    // 🆕 使用双指针法拆分长句为适合字幕的短句
    const subtitles: SplitSubtitle[] = splitAllUtterancesToSubtitles(utterances)
    console.log(`📝 [ASRProcessor] 拆分后共 ${subtitles.length} 个字幕片段`)

    // 5. 批量创建文本items
    let createdCount = 0

    for (const subtitle of subtitles) {
      // 将毫秒转换为帧数
      const subtitleStartFrames = startTimeFrames + Math.round(subtitle.start_time / 1000 * RENDERER_FPS)
      const subtitleDurationFrames = Math.round((subtitle.end_time - subtitle.start_time) / 1000 * RENDERER_FPS)

      // 跳过时长为0的字幕
      if (subtitleDurationFrames <= 0) {
        console.log('⏭️ [ASRProcessor] 跳过时长为0的字幕:', subtitle.text)
        continue
      }

      try {
        // 创建文本item
        const textItem = await createTextTimelineItem(
          subtitle.text,
          {
            fontSize: 48,
            color: '#ffffff',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          },
          subtitleStartFrames,
          trackId || '',
          subtitleDurationFrames,
        )

        // 设置为loading状态
        textItem.timelineStatus = 'loading'

        // 设置 bunny 对象（文本渲染需要）
        await setupTimelineItemBunny(textItem)

        // 从 textBitmap 获取实际宽高并设置到 config
        if (textItem.runtime.textBitmap) {
          textItem.config.width = textItem.runtime.textBitmap.width
          textItem.config.height = textItem.runtime.textBitmap.height
        }

        // 设置为ready状态
        textItem.timelineStatus = 'ready'
        textItem.runtime.isInitialized = true

        // 添加到时间轴（不需要历史记录）
        await unifiedStore.addTimelineItem(textItem)
        createdCount++
      } catch (error) {
        console.error('❌ [ASRProcessor] 创建文本item失败:', error)
      }
    }

    console.log(`✅ [ASRProcessor] 已创建 ${createdCount} 个文本items`)

    // 6. 删除ASR的text media item（已无用）
    // 查找mediaItem所在的所有目录
    const dirIds = unifiedStore.findAllDirectoriesByMediaId(mediaItem.id)
    if (dirIds.length > 0) {
      // 逐个从文件夹中移除（会更新引用计数）
      // 注意：只有最后一个目录删除时才会真正删除文件（引用计数降为0）
      for (const dirId of dirIds) {
        const result = await unifiedStore.deleteMediaItem(mediaItem.id, dirId)
        if (!result.success) {
          console.warn(`⚠️ [ASRProcessor] 从目录 ${dirId} 移除ASR media item失败: ${result.error}`)
        }
      }
      console.log(`🗑️ [ASRProcessor] 已删除ASR media item: ${mediaItem.name} (${mediaItem.id})`)
    } else {
      // 如果找不到目录，直接从媒体列表中移除
      await unifiedStore.removeMediaItem(mediaItem.id)
      console.log(`🗑️ [ASRProcessor] 已删除ASR media item（无目录）: ${mediaItem.name} (${mediaItem.id})`)
    }
  }

  /**
   * 为媒体项目准备数据
   * 支持三种场景：
   * - 场景A：任务已完成，本地有 resultData -> 直接使用 resultData（无需重新获取）
   * - 场景B：远程任务已完成，需要重新获取结果 -> 从 resultData 获取
   * - 场景C：任务进行中 -> startProgressStream
   */
  private async prepareDataForMediaItem(mediaItem: UnifiedMediaItemData): Promise<{
    success: boolean
    error?: string
    needSaveMeta: boolean
  }> {
    const source = mediaItem.source as ASRSourceData

    try {
      let needSaveMeta: boolean

      // 场景判断：优先尝试从本地恢复（ASR 结果是文本，存储在 resultData 中）
      if (source.resultData) {
        // 场景 A: 从本地加载已完成的 ASR 结果
        this.transitionMediaStatus(mediaItem, 'asyncprocessing')
        console.log(`📂 [场景A] 从项目加载已完成的ASR结果: ${mediaItem.id}`)
        needSaveMeta = false // meta 文件已存在
      } else {
        // 场景 C: 监听进行中的任务
        if (!source.asrTaskId) {
          throw new Error('ASR任务ID不存在，任务应该在UI层提交')
        }

        console.log(`🔄 [场景C] 监听进行中的ASR任务: ${source.asrTaskId}`)

        if (source.taskStatus === ASRTaskStatus.FAILED) {
          throw new Error('ASR任务已失败，无法继续')
        }

        if (source.taskStatus === ASRTaskStatus.CANCELLED) {
          throw new Error('ASR任务已取消，无法继续')
        }

        RuntimeStateActions.startAcquisition(source)

        await this.startProgressStream(source.asrTaskId, mediaItem)
        needSaveMeta = true
      }

      return { success: true, needSaveMeta }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '语音识别失败'
      RuntimeStateActions.setError(source, errorMessage)

      return {
        success: false,
        error: errorMessage,
        needSaveMeta: true, // 失败也要保存 meta
      }
    }
  }

  // ==================== 实现统一媒体项目处理 ====================

  /**
   * 处理完整的媒体项目生命周期
   * ASR 结果是文本类型，不需要下载文件
   * @param mediaItem 媒体项目
   */
  async processMediaItem(mediaItem: UnifiedMediaItemData): Promise<void> {
    const source = mediaItem.source as ASRSourceData

    try {
      console.log(`🚀 [ASRProcessor] 开始处理媒体项目: ${mediaItem.name}`)

      // 1. 状态转换
      if (mediaItem.mediaStatus === 'missing') {
        console.log(`🔄 [ASRProcessor] 媒体文件缺失，先转换到 pending: ${mediaItem.name}`)
        this.transitionMediaStatus(mediaItem, 'pending')
      } else if (mediaItem.mediaStatus === 'cancelled') return
      else if (mediaItem.mediaStatus === 'error') return

      // 2. USER_CREATE 预保存 meta 文件
      if (DataSourceHelpers.isUserCreate(source)) {
        console.log(`📝 [USER_CREATE] 预保存Meta文件: ${mediaItem.name}`)
        const saveMetaSuccess = await globalMetaFileManager.saveMetaFile(mediaItem)
        if (saveMetaSuccess) {
          console.log(`✅ [USER_CREATE] Meta文件预保存成功: ${mediaItem.name}`)
        } else {
          console.warn(`⚠️ [USER_CREATE] Meta文件预保存失败: ${mediaItem.name}`)
        }
      } else {
        console.log(`⏭️ [PROJECT_LOAD] 跳过Meta文件预保存: ${mediaItem.name}`)
      }

      // 3. 执行数据准备
      const prepareResult = await this.prepareDataForMediaItem(mediaItem)

      // 4. 处理失败情况
      if (!prepareResult.success) {
        this.transitionMediaStatus(mediaItem, 'error')
        source.errorMessage = prepareResult.error

        if (prepareResult.needSaveMeta) {
          console.log(`💾 [失败处理] 保存失败状态的Meta文件: ${mediaItem.name}`)
          await globalMetaFileManager.saveMetaFile(mediaItem)
        }

        return
      }

      // 5. 成功情况：设置媒体类型为 text
      mediaItem.mediaType = 'text'

      console.log(`🔧 [ASRProcessor] 元数据设置完成: ${mediaItem.name}`)

      // 7. 保存 meta 文件
      if (prepareResult.needSaveMeta) {
        console.log(`💾 [保存Meta] 保存Meta文件: ${mediaItem.name}`)
        const saveMetaSuccess = await globalMetaFileManager.saveMetaFile(mediaItem)
        if (!saveMetaSuccess) {
          console.warn(`⚠️ Meta文件保存失败: ${mediaItem.name}`)
        }
      }

      // 8. 设置为就绪状态（ASR 没有 decoding 环节，需要先设置 decoding 再设置 ready）
      this.transitionMediaStatus(mediaItem, 'decoding')
      await nextTick()
      this.transitionMediaStatus(mediaItem, 'ready')
      console.log(`✅ [ASRProcessor] 媒体项目处理完成: ${mediaItem.name}`)
    } catch (error) {
      console.error(`❌ [ASRProcessor] 媒体项目处理失败: ${mediaItem.name}`, error)
      this.transitionMediaStatus(mediaItem, 'error')
      source.errorMessage = error instanceof Error ? error.message : '处理失败'

      // 保存失败状态的 meta 文件
      console.log(`💾 [异常处理] 保存失败状态的Meta文件: ${mediaItem.name}`)
      await globalMetaFileManager.saveMetaFile(mediaItem)
    }
  }

  // ==================== 任务取消功能 ====================

  /**
   * 取消任务
   * @param taskId 任务ID
   * @returns 是否成功取消
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (!task) {
      console.warn(`⚠️ [ASRProcessor] 任务不存在: ${taskId}`)
      return false
    }

    // 检查状态是否为 pending
    if (task.mediaItem.mediaStatus !== 'pending') {
      console.warn(
        `⚠️ [ASRProcessor] 只能取消 pending 状态的任务，当前状态: ${task.mediaItem.mediaStatus}`,
      )
      return false
    }

    const source = task.mediaItem.source as ASRSourceData
    const asrTaskId = source.asrTaskId

    try {
      // 1. 先调用后端 API 取消远程任务
      if (asrTaskId) {
        const cancelSuccess = await this.cancelRemoteTask(asrTaskId)
        if (!cancelSuccess) {
          console.warn(`⚠️ [ASRProcessor] 后端任务取消失败，不更新本地状态: ${asrTaskId}`)
          return false
        }
      }

      // 2. 后端取消成功后，中断流式连接
      const abortController = this.abortControllers.get(asrTaskId)
      if (abortController) {
        console.log(`🛑 [ASRProcessor] 中断进度流: ${asrTaskId}`)
        abortController.abort()
        this.abortControllers.delete(asrTaskId)
      }

      // 3. 设置为 cancelled 状态
      this.transitionMediaStatus(task.mediaItem, 'cancelled')
      source.taskStatus = ASRTaskStatus.CANCELLED
      source.errorMessage = '任务已取消'

      // 4. 保存 cancelled 状态到 meta 文件
      await globalMetaFileManager.saveMetaFile(task.mediaItem)
      console.log(`💾 [ASRProcessor] 已保存 cancelled 状态到 meta: ${task.mediaItem.name}`)

      console.log(`✅ [ASRProcessor] 任务取消成功: ${asrTaskId}`)
      return true
    } catch (error) {
      console.error(`❌ [ASRProcessor] 取消任务失败: ${asrTaskId}`, error)
      return false
    }
  }

  /**
   * 调用后端 API 取消远程任务
   * @param asrTaskId ASR任务ID
   * @returns 是否成功取消
   */
  private async cancelRemoteTask(asrTaskId: string): Promise<boolean> {
    try {
      console.log(`🌐 [ASRProcessor] 调用后端 API 取消任务: ${asrTaskId}`)

      const response = await fetchClient.delete(`/api/media/tasks/${asrTaskId}`)

      if (response.status === 200) {
        console.log(`✅ [ASRProcessor] 后端任务取消成功: ${asrTaskId}`)
        return true
      } else {
        console.warn(`⚠️ [ASRProcessor] 后端任务取消失败: ${response.statusText}`)
        return false
      }
    } catch (error) {
      console.error(`❌ [ASRProcessor] 调用后端 API 失败: ${asrTaskId}`, error)
      return false
    }
  }
}
