import { ref, computed, type Ref } from 'vue'
import { cloneDeep } from 'lodash'
import { collection, type ConfigKey } from '../configs'
import { useAppI18n } from '@/core/composables/useI18n'
import type { UIConfig } from '../types'
import type {
  AIGenerateConfig,
  AIConfigFlattened,
} from '@/core/datasource/providers/ai-generation/types'
import { useUnifiedStore } from '@/core/unifiedStore'
import { fetchClient } from '@/utils/fetchClient'
import { generateMediaId } from '@/core/utils/idGenerator'
import { BizyairFileUploader } from '@/core/utils/bizyairFileUploader'
import { BltcyFileUploader } from '@/core/utils/bltcyFileUploader'
import { RunningHubFileUploader } from '@/core/utils/runninghubFileUploader'
import { RunningHubFileUploaderStd } from '@/core/utils/runninghubFileUploaderStd'
import {
  AIGenerationSourceFactory,
  TaskStatus,
  type MediaGenerationRequest,
  type AIGenerationSourceData,
} from '@/core/datasource/providers/ai-generation/AIGenerationSource'
import { SourceOrigin } from '@/core/datasource/core/BaseDataSource'
import type { TaskSubmitResponse } from '@/types/taskApi'
import { TaskSubmitErrorCode } from '@/types/taskApi'
import {
  BizyAirSourceFactory,
  BizyAirTaskStatus,
  type BizyAirSourceData,
} from '@/core/datasource/providers/bizyair/BizyAirSource'
import { BizyAirAPIClient } from '@/core/datasource/providers/bizyair/BizyAirAPIClient'
import { BizyAirConfigManager } from '@/core/datasource/providers/bizyair/BizyAirConfigManager'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import {
  buildTaskErrorMessage,
  shouldShowRechargePrompt,
  isRetryableError,
} from '@/utils/errorMessageBuilder'
import { flattenAiConfig } from '../utils/pathUtils'
import { ConfigCacheManager } from '../utils/configCacheManager'

/**
 * AI 生成 Composable
 * 封装 AI 生成相关的业务逻辑
 */
export function useAIGeneration() {
  // 初始化 unifiedStore
  const unifiedStore = useUnifiedStore()

  // 使用全局 i18n 获取当前语言和翻译函数
  const { locale, t } = useAppI18n()

  // 将 locale 转换为 collection 使用的语言格式
  const currentLang = computed<'zh' | 'en'>(() => {
    return locale.value === 'zh-CN' ? 'zh' : 'en'
  })

  // 视图模式状态
  const viewMode = ref<'card_grid' | 'config_form'>('card_grid')
  const selectedConfig = ref<ConfigKey | ''>('')
  // UI配置 - 单向绑定，用于渲染界面（只读）
  const uiConfig = ref<UIConfig[] | null>(null)
  // AI配置 - 双向绑定，用于存储用户输入的实际配置值
  const aiConfig = ref<Record<string, any> | null>(null)
  // 生成状态
  const isGenerating = ref(false)
  // 输出位置，默认为临时目录
  const outputLocation = ref<'temp' | 'current'>('current')

  // ==================== 配置管理 ====================

  /**
   * 处理配置变更
   */
  function handleConfigChange(value: ConfigKey) {
    const selectedConfigData = collection[value]

    // 使用 lodash 深度拷贝 uiConfig（单向绑定，只读）
    uiConfig.value = cloneDeep(selectedConfigData.uiConfig)

    // 优先从缓存加载 aiConfig，失败则使用默认配置
    const cachedConfig = ConfigCacheManager.loadConfig(value)

    if (cachedConfig) {
      // 使用缓存的配置
      aiConfig.value = cloneDeep(cachedConfig)
    } else {
      // 使用默认配置
      aiConfig.value = cloneDeep(selectedConfigData.aiConfig)
    }
  }

  /**
   * 处理 AI 配置更新
   */
  function handleAiConfigUpdate(value: Record<string, any>) {
    aiConfig.value = value

    // 自动保存到缓存
    if (selectedConfig.value) {
      ConfigCacheManager.saveConfig(selectedConfig.value, value)
    }
  }

  /**
   * 切换到配置表单视图
   */
  function handleCardClick(configKey: ConfigKey) {
    selectedConfig.value = configKey
    handleConfigChange(configKey)
    viewMode.value = 'config_form'
  }

  /**
   * 返回到卡片网格视图
   */
  function handleBack() {
    viewMode.value = 'card_grid'
    selectedConfig.value = ''
    uiConfig.value = null
    aiConfig.value = null
  }

  // ==================== 任务提交 ====================

  /**
   * 提交AI生成任务到后端
   * @param requestParams 请求参数
   * @returns 任务提交响应
   */
  async function submitAIGenerationTask(
    requestParams: MediaGenerationRequest,
  ): Promise<TaskSubmitResponse> {
    try {
      const response = await fetchClient.post<TaskSubmitResponse>(
        '/api/media/generate',
        requestParams,
      )

      if (response.status !== 200) {
        throw new Error(`提交任务失败: ${response.statusText}`)
      }

      return response.data
    } catch (error) {
      // 网络错误时返回失败响应
      return {
        success: false,
        error_code: TaskSubmitErrorCode.UNKNOWN_ERROR,
        error_details: {
          error: error instanceof Error ? error.message : '网络请求失败',
        },
      }
    }
  }

  /**
   * 处理文件上传（统一逻辑）
   * @param config 扁平化后的配置
   * @param uploadServer 上传服务器类型
   * @returns 处理后的配置
   */
  async function processFileUploads(
    config: AIConfigFlattened,
    uploadServer?: string,
  ): Promise<AIConfigFlattened> {
    if (!uploadServer) {
      return config
    }

    const uploadHandlers = {
      bizyair: BizyairFileUploader,
      bltcy: BltcyFileUploader,
      runninghub: RunningHubFileUploader,
      runninghubstd: RunningHubFileUploaderStd,
    }

    const handler = uploadHandlers[uploadServer as keyof typeof uploadHandlers]
    if (!handler) {
      throw new Error(`不支持的上传服务器: ${uploadServer}`)
    }

    return await handler.processConfigUploads(
      config,
      unifiedStore.getMediaItem,
      unifiedStore.getTimelineItem,
      (fileIndex, stage, progress) => {
        console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
      },
      () => {},
    )
  }

  /**
   * 创建媒体项并添加到库（统一逻辑）
   * @param source 数据源
   * @param configData 配置数据
   * @returns 创建的媒体项
   */
  function createAndAddMediaItem(
    source: AIGenerationSourceData | BizyAirSourceData,
    configData: AIGenerateConfig,
  ): UnifiedMediaItemData {
    // 根据内容类型确定文件扩展名和媒体类型
    let extension = 'png'
    let mediaType: 'image' | 'video' | 'audio' = 'image'

    if (configData.contentType === 'video') {
      extension = 'mp4'
      mediaType = 'video'
    } else if (configData.contentType === 'audio') {
      extension = 'mp3'
      mediaType = 'audio'
    }

    const mediaId = generateMediaId(extension)
    const mediaName = `${configData.name[currentLang.value]}_${Date.now()}`

    const mediaItem = unifiedStore.createUnifiedMediaItemData(
      mediaId,
      mediaName,
      source,
      {
        mediaType,
      },
    )

    // 添加到媒体库
    unifiedStore.addMediaItem(mediaItem)

    // 根据输出位置添加到目录
    if (outputLocation.value === 'current') {
      if (unifiedStore.currentDir) {
        unifiedStore.addMediaToDirectory(mediaId, unifiedStore.currentDir.id)
      } else {
        console.warn('⚠️ [useAIGeneration] 当前目录不存在，无法添加媒体项')
      }
    } else {
      console.log('📁 [useAIGeneration] 添加到临时目录（待实现）')
    }

    return mediaItem
  }

  // ==================== 提交策略 ====================

  /**
   * BizyAir 直接调用策略
   */
  const bizyAirSubmitStrategy = {
    /**
     * 检查是否可以使用此策略
     */
    canUse: async (configData: AIGenerateConfig): Promise<boolean> => {
      if (configData.aiTaskType !== 'bizyair_generate_media') {
        return false
      }
      const apiKey = await unifiedStore.getBizyAirApiKey()
      return !!apiKey
    },

    /**
     * 提交任务到 BizyAir API
     */
    submit: async (requestParams: MediaGenerationRequest, configData: AIGenerateConfig) => {
      console.log('🚀 [useAIGeneration] 准备提交 BizyAir 任务...', requestParams)

      // 1. 获取 BizyAir API Key
      const apiKey = await unifiedStore.getBizyAirApiKey()
      if (!apiKey) {
        unifiedStore.dialogWarning({
          title: t('media.error.apiKeyMissing'),
          content: '请先在设置中配置 BizyAir API Key',
          positiveText: t('media.confirm'),
          negativeText: t('media.cancel'),
          onPositiveClick: () => {
            console.log('跳转到设置页面')
          },
        })
        throw new Error('BizyAir API Key 未配置')
      }

      // 2. 获取 BizyAir 应用配置
      const appConfig = BizyAirConfigManager.getConfig(requestParams.task_config)
      console.log('📋 [useAIGeneration] BizyAir 应用配置:', appConfig)

      // 3. 构建 BizyAir API 请求数据
      const bizyAirRequestData = BizyAirConfigManager.getRequestBuilder(
        requestParams.task_config,
      )(requestParams.task_config, appConfig)
      console.log('📤 [useAIGeneration] BizyAir API 请求数据:', bizyAirRequestData)

      // 4. 提交任务到 BizyAir API
      const bizyairTaskId = await BizyAirAPIClient.submitAsyncTask(
        bizyAirRequestData,
        apiKey,
      )
      console.log(`✅ [useAIGeneration] BizyAir 任务提交成功: ${bizyairTaskId}`)

      // 5. 创建 BizyAir 数据源
      const bizyAirSource = BizyAirSourceFactory.createBizyAirSource(
        {
          type: 'bizyair',
          bizyairTaskId: bizyairTaskId,
          requestParams: requestParams,
          taskStatus: BizyAirTaskStatus.QUEUING,
        },
        SourceOrigin.USER_CREATE,
      )

      return {
        taskId: bizyairTaskId,
        source: bizyAirSource,
      }
    },
  }

  /**
   * 后端代理策略
   */
  const backendSubmitStrategy = {
    /**
     * 检查是否可以使用此策略（总是可用）
     */
    canUse: async () => true,

    /**
     * 提交任务到后端 API
     */
    submit: async (requestParams: MediaGenerationRequest, _configData: AIGenerateConfig) => {
      console.log('🚀 [useAIGeneration] 提交AI生成任务到后端...', requestParams)

      // 1. 提交任务到后端
      const submitResult = await submitAIGenerationTask(requestParams)

      // 2. 错误处理
      if (!submitResult.success) {
        const errorMessage = buildTaskErrorMessage(
          submitResult.error_code,
          submitResult.error_details,
          t,
        )

        // 根据错误类型提供不同的用户体验
        if (shouldShowRechargePrompt(submitResult.error_code)) {
          // 余额不足：显示充值引导对话框
          unifiedStore.dialogWarning({
            title: t('media.error.insufficientBalance'),
            content: errorMessage + '\n\n' + t('media.error.rechargePrompt'),
            positiveText: t('media.confirm'),
            negativeText: t('media.cancel'),
            onPositiveClick: () => {
              console.log('跳转到充值页面')
            },
          })
        } else if (isRetryableError(submitResult.error_code)) {
          // 可重试错误：显示重试选项
          unifiedStore.dialogWarning({
            title: t('media.generationFailed', { error: '' }),
            content: errorMessage,
            positiveText: t('media.retry'),
            negativeText: t('media.cancel'),
            onPositiveClick: () => {
              // 重新提交任务
              handleGenerate()
            },
          })
        } else {
          // 其他错误：直接显示错误消息
          unifiedStore.messageError(errorMessage)
        }

        throw new Error(errorMessage)
      }

      console.log(
        `✅ [useAIGeneration] 任务提交成功: ${submitResult.task_id}, 成本: ${submitResult.cost}`,
      )

      // 3. 创建AI生成数据源
      const aiSource = AIGenerationSourceFactory.createAIGenerationSource(
        {
          type: 'ai-generation',
          aiTaskId: submitResult.task_id,
          requestParams: requestParams,
          taskStatus: TaskStatus.PENDING,
        },
        SourceOrigin.USER_CREATE,
      )

      return {
        taskId: submitResult.task_id,
        cost: submitResult.cost,
        source: aiSource,
      }
    },
  }

  // ==================== 生成处理 ====================

  /**
   * 处理生成按钮点击（统一的生成入口）
   * 参考 LibraryMediaGrid.vue:1302-1503
   *
   * 逻辑：
   * 1. 如果 aiTaskType 是 bizyair_generate_media 且有 API Key → 使用 BizyAir 直接调用
   * 2. 否则 → 使用后端代理
   */
  async function handleGenerate() {
    if (!selectedConfig.value || !aiConfig.value) {
      return
    }

    try {
      isGenerating.value = true
      const configData = collection[selectedConfig.value]

      // 1. 扁平化配置
      let newConfig = flattenAiConfig(aiConfig.value)

      // 2. 处理文件上传（统一逻辑）
      newConfig = await processFileUploads(newConfig, configData.uploadServer)

      // 3. 准备请求参数
      const requestParams: MediaGenerationRequest = {
        ai_task_type: configData.aiTaskType,
        content_type: configData.contentType,
        task_config: {
          id: configData.id,
          ...newConfig,
        },
        sub_ai_task_type: configData.subAiTaskType,
      }

      // 4. 选择提交策略
      const strategy = (await bizyAirSubmitStrategy.canUse(configData))
        ? bizyAirSubmitStrategy
        : backendSubmitStrategy

      console.log(
        `🎯 [useAIGeneration] 使用策略: ${strategy === bizyAirSubmitStrategy ? 'BizyAir 直接调用' : '后端代理'}`,
      )

      // 5. 提交任务
      const result = await strategy.submit(requestParams, configData)

      // 6. 创建并添加媒体项
      const mediaItem = createAndAddMediaItem(result.source, configData)

      // 7. 启动媒体处理流程
      unifiedStore.startMediaProcessing(mediaItem)

      // 8. 显示成功消息
      unifiedStore.messageSuccess(t('aiPanel.taskSubmitted'))

      console.log('✅ [useAIGeneration] 生成流程启动完成')
    } catch (error) {
      console.error('❌ [useAIGeneration] 任务提交失败:', error)

      // 处理 BizyAir API 错误
      const errorMessage = error instanceof Error ? error.message : '未知错误'

      // 检查是否是认证错误
      if (
        errorMessage.includes('401') ||
        errorMessage.includes('403') ||
        errorMessage.includes('API Key')
      ) {
        unifiedStore.dialogWarning({
          title: t('media.error.apiKeyInvalid'),
          content: errorMessage + '\n\n请检查您的 BizyAir API Key 配置',
          positiveText: t('media.confirm'),
          negativeText: t('media.cancel'),
          onPositiveClick: () => {
            console.log('跳转到设置页面')
          },
        })
      } else if (errorMessage.includes('429')) {
        unifiedStore.dialogWarning({
          title: t('media.error.rateLimit'),
          content: errorMessage + '\n\n请稍后再试',
          positiveText: t('media.confirm'),
          negativeText: t('media.cancel'),
        })
      } else if (!errorMessage.includes('BizyAir API Key 未配置')) {
        // 避免重复显示已处理的错误
        unifiedStore.messageError(
          t('aiPanel.submitFailed', {
            error: errorMessage,
          }),
        )
      }
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * 处理调试输出按钮点击
   */
  async function handleDebugOutput() {
    if (!aiConfig.value) {
      console.warn('⚠️ [useAIGeneration] aiConfig 为空')
      return
    }

    // 1. 扁平化配置用于调试
    const flattenedConfig = flattenAiConfig(aiConfig.value)
    console.log('🔍 [useAIGeneration] 扁平化后的配置:')
    console.log(JSON.stringify(flattenedConfig, null, 2))

    try {
      // 根据 uploadServer 配置选择上传处理器（仅用于调试）
      if (!selectedConfig.value) {
        console.warn('⚠️ [useAIGeneration] 未选择配置')
        return
      }
      const configData = collection[selectedConfig.value]
      const uploadServer = configData.uploadServer
      let newConfig: Record<string, any>

      if (uploadServer) {
        if (uploadServer === 'bizyair') {
          newConfig = await BizyairFileUploader.processConfigUploads(
            flattenedConfig, // 传递扁平化后的配置
            unifiedStore.getMediaItem,
            unifiedStore.getTimelineItem,
            (fileIndex, stage, progress) => {
              console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
            },
          )

          console.log('🔍 [useAIGeneration] 上传后的配置:')
          console.log(JSON.stringify(newConfig, null, 2))
        } else if (uploadServer === 'bltcy') {
          newConfig = await BltcyFileUploader.processConfigUploads(
            flattenedConfig, // 传递扁平化后的配置
            unifiedStore.getMediaItem,
            unifiedStore.getTimelineItem,
            (fileIndex, stage, progress) => {
              console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
            },
          )

          console.log('🔍 [useAIGeneration] 上传后的配置:')
          console.log(JSON.stringify(newConfig, null, 2))
        } else if (uploadServer === 'runninghub') {
          newConfig = await RunningHubFileUploader.processConfigUploads(
            flattenedConfig, // 传递扁平化后的配置
            unifiedStore.getMediaItem,
            unifiedStore.getTimelineItem,
            (fileIndex, stage, progress) => {
              console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
            },
          )

          console.log('🔍 [useAIGeneration] 上传后的配置:')
          console.log(JSON.stringify(newConfig, null, 2))
        } else if (uploadServer === 'runninghubstd') {
          newConfig = await RunningHubFileUploaderStd.processConfigUploads(
            flattenedConfig, // 传递扁平化后的配置
            unifiedStore.getMediaItem,
            unifiedStore.getTimelineItem,
            (fileIndex, stage, progress) => {
              console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
            },
          )

          console.log('🔍 [useAIGeneration] 上传后的配置:')
          console.log(JSON.stringify(newConfig, null, 2))
        } else {
          // TODO: 实现其他上传处理器
          console.warn(`⚠️ [useAIGeneration] 不支持的上传服务器: ${uploadServer}`)
        }
      }
    } catch (error) {
      console.error('❌ 调试输出失败:', error)
      unifiedStore.messageError(`调试失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // ==================== 导出接口 ====================

  return {
    // 状态
    viewMode,
    selectedConfig,
    uiConfig,
    aiConfig,
    isGenerating,
    outputLocation,
    currentLang,

    // 配置管理方法
    handleConfigChange,
    handleAiConfigUpdate,
    handleCardClick,
    handleBack,

    // 生成处理方法
    handleGenerate,
    handleDebugOutput,
  }
}
