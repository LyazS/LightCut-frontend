/**
 * 用户选择文件处理器（响应式重构版）
 * 专注于文件验证和格式检查，支持高并发处理
 * 包含所有用户选择文件相关的业务逻辑和操作行为
 */

import {
  DataSourceProcessor,
  type AcquisitionTask,
} from '@/core/datasource/core/BaseDataSourceProcessor'
import type { UserSelectedFileSourceData } from '@/core/datasource/providers/user-selected/UserSelectedFileSource'
import {
  SUPPORTED_MEDIA_TYPES,
  FILE_SIZE_LIMITS,
  detectFileMediaType,
  validateFile,
  type FileValidationResult,
} from '@/core/utils/mediaTypeDetector'
import { RuntimeStateActions } from '@/core/datasource/core/BaseDataSource'
import { DataSourceHelpers } from '@/core/datasource/core/DataSourceHelpers'
import { globalMetaFileManager } from '@/core/managers/media/globalMetaFileManager'
import type { UnifiedMediaItemData, MediaStatus, MediaType } from '@/core/mediaitem/types'
import { UnifiedMediaItemActions } from '@/core/mediaitem/actions'
import { DATA_SOURCE_CONCURRENCY } from '@/constants/ConcurrencyConstants'

// ==================== 用户选择文件处理器 ====================

/**
 * 用户选择文件处理器 - 适配响应式数据源
 */
export class UserSelectedFileProcessor extends DataSourceProcessor {
  private static instance: UserSelectedFileProcessor

  /**
   * 获取单例实例
   */
  static getInstance(): UserSelectedFileProcessor {
    if (!this.instance) {
      this.instance = new UserSelectedFileProcessor()
    }
    return this.instance
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {
    super()
    // 用户选择文件处理速度快，可以支持更高的并发数
    this.maxConcurrentTasks = DATA_SOURCE_CONCURRENCY.USER_SELECTED_MAX_CONCURRENT_TASKS
  }

  // ==================== 实现抽象方法 ====================

  /**
   * 执行具体的获取任务
   */
  protected async executeTask(task: AcquisitionTask): Promise<void> {
    const mediaItem = task.mediaItem

    console.log(`🎬 [UserSelectedFileProcessor] 开始执行任务: ${task.id} - ${mediaItem.name}`)

    // executeTask 内部调用 processMediaItem
    await this.processMediaItem(mediaItem)

    // 检查执行结果 - 通过检查错误信息来判断状态
    const source = task.mediaItem.source as UserSelectedFileSourceData
    if (source.errorMessage) {
      throw new Error(source.errorMessage)
    }

    console.log(`✅ [UserSelectedFileProcessor] 任务执行成功: ${task.id}`)
  }

  // ==================== 用户选择文件特定行为方法 ====================

  /**
   * 获取处理器类型
   */
  getProcessorType(): string {
    return 'user-selected'
  }

  /**
   * 取消任务
   * 用户选择文件的任务不支持取消（处理速度很快）
   */
  async cancelTask(taskId: string): Promise<boolean> {
    console.log(`⚠️ [UserSelectedFileProcessor] 用户选择文件的任务不支持取消: ${taskId}`)
    return false
  }

  // ==================== 新增：实现统一媒体项目处理 ====================

  /**
   * 处理完整的媒体项目生命周期
   * @param mediaItem 媒体项目
   */
  async processMediaItem(mediaItem: UnifiedMediaItemData): Promise<void> {
    try {
      console.log(`🚀 [UserSelectedFileProcessor] 开始处理媒体项目: ${mediaItem.name}`)
      const source = mediaItem.source as UserSelectedFileSourceData

      // 1. 执行文件验证和准备
      const prepareResult = await this.prepareFileForMediaItem(mediaItem)
      if (!prepareResult || !prepareResult.file) {
        throw new Error('数据源未准备好')
      }

      // 2. 设置媒体类型（仅在 USER_CREATE 时需要）
      const { file, mediaType } = prepareResult
      if (mediaType !== null) {
        mediaItem.mediaType = mediaType
      }

      // 3. 设置为WebAV解析状态
      this.transitionMediaStatus(mediaItem, 'webavdecoding')

      // 4. WebAV处理器负责具体处理
      const webavResult = await this.webavProcessor.processMedia(mediaItem, file)

      // 5. 直接设置元数据
      UnifiedMediaItemActions.setWebAVObjects(mediaItem, webavResult.webavObjects)
      UnifiedMediaItemActions.setDuration(mediaItem, webavResult.duration)
      console.log(`🔧 [UserSelectedFileProcessor] 元数据设置完成: ${mediaItem.name}`)

      // 6. 🌟 使用统一的保存逻辑判断
      if (DataSourceHelpers.isUserCreate(source)) {
        try {
          const saveResult = await globalMetaFileManager.saveMediaToProject(mediaItem, file)
          if (saveResult.success) {
            console.log(`💾 [USER_CREATE] 媒体和Meta文件保存成功: ${mediaItem.name}`)
          } else {
            throw new Error(saveResult.error || '保存失败')
          }
        } catch (saveError) {
          console.error(`❌ 媒体文件保存失败: ${mediaItem.name}`, saveError)
          console.warn(`媒体文件保存失败，但WebAV解析继续: ${mediaItem.name}`, saveError)
        }
      } else {
        console.log(`⏭️ [PROJECT_LOAD] 跳过文件保存: ${mediaItem.name}`)
      }

      // 7. 设置为就绪状态
      this.transitionMediaStatus(mediaItem, 'ready')

      console.log(`✅ [UserSelectedFileProcessor] 媒体项目处理完成: ${mediaItem.name}`)
    } catch (error) {
      console.error(`❌ [UserSelectedFileProcessor] 媒体项目处理失败: ${mediaItem.name}`, error)
      this.transitionMediaStatus(mediaItem, 'error')
      mediaItem.source.errorMessage = error instanceof Error ? error.message : '处理失败'
    }
  }

  /**
   * 为媒体项目准备文件（简化版）
   */
  private async prepareFileForMediaItem(
    mediaItem: UnifiedMediaItemData,
  ): Promise<{ file: File; mediaType: MediaType | null }> {
    const source = mediaItem.source as UserSelectedFileSourceData

    try {
      this.transitionMediaStatus(mediaItem, 'asyncprocessing')

      RuntimeStateActions.startAcquisition(source)

      let file: File
      let mediaType: MediaType | null = null

      // 🌟 使用辅助函数判断场景
      if (DataSourceHelpers.isUserCreate(source)) {
        // 用户创建：使用选择的文件并验证
        if (!source.selectedFile) {
          throw new Error('USER_CREATE 场景下 selectedFile 不能为 null')
        }
        
        file = source.selectedFile
        console.log(`📁 [USER_CREATE] 使用用户选择的文件: ${file.name}`)
        
        // ✅ 使用完毕后立即清除引用
        source.selectedFile = null
        console.log(`🧹 [USER_CREATE] 已清除 selectedFile 引用`)

        const validationResult = validateFile(file)
        if (!validationResult.isValid) {
          throw new Error(validationResult.errorMessage)
        }
        mediaType = validationResult.mediaType
      } else {
        // 项目加载：从项目目录加载文件
        file = await globalMetaFileManager.loadMediaFile(mediaItem.id)
        console.log(`📂 [PROJECT_LOAD] 从项目加载文件: ${mediaItem.id}`)
        // mediaType 保持为 null，外部无需设置
      }

      await RuntimeStateActions.completeAcquisition(source)
      return { file, mediaType }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文件处理失败'
      RuntimeStateActions.setError(source, errorMessage)
      throw error
    }
  }
}
