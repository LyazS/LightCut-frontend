<template>
  <div class="panel">
    <!-- 卡片网格视图 -->
    <ConfigCardGrid
      v-if="viewMode === 'card_grid'"
      :locale="currentLang"
      @card-click="handleCardClick"
    />

    <!-- 配置表单视图 -->
    <ConfigFormView
      v-else
      :selected-config="selectedConfig"
      :ui-config="uiConfig"
      :ai-config="aiConfig"
      :is-generating="isGenerating"
      :locale="currentLang"
      @back="handleBack"
      @generate="handleGenerate"
      @debug-output="handleDebugOutput"
      @update:aiConfig="handleAiConfigUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { cloneDeep } from 'lodash'
import ConfigCardGrid from './ConfigCardGrid.vue'
import ConfigFormView from './ConfigFormView.vue'
import { collection, type ConfigKey } from './configs'
import { useAppI18n } from '@/core/composables/useI18n'
import type { UIConfig } from './types'
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
} from '@/core/datasource/providers/ai-generation/AIGenerationSource'
import { SourceOrigin } from '@/core/datasource/core/BaseDataSource'
import type { TaskSubmitResponse } from '@/types/taskApi'
import { TaskSubmitErrorCode } from '@/types/taskApi'
import {
  buildTaskErrorMessage,
  shouldShowRechargePrompt,
  isRetryableError,
} from '@/utils/errorMessageBuilder'
import { flattenAiConfig } from './utils/pathUtils'

// 初始化 unifiedStore
const unifiedStore = useUnifiedStore()

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

// 使用全局 i18n 获取当前语言和翻译函数
const { locale, t } = useAppI18n()

// 将 locale 转换为 collection 使用的语言格式
const currentLang = computed<'zh' | 'en'>(() => {
  return locale.value === 'zh-CN' ? 'zh' : 'en'
})

// 切换到配置表单视图
const handleCardClick = (configKey: ConfigKey) => {
  selectedConfig.value = configKey
  handleConfigChange(configKey)
  viewMode.value = 'config_form'
}

// 返回到卡片网格视图
const handleBack = () => {
  viewMode.value = 'card_grid'
  selectedConfig.value = ''
  uiConfig.value = null
  aiConfig.value = null
}

// 处理配置变更
const handleConfigChange = (value: ConfigKey) => {
  const selectedConfigData = collection[value]

  // 使用 lodash 深度拷贝 uiConfig（单向绑定，只读）
  uiConfig.value = cloneDeep(selectedConfigData.uiConfig)

  // 使用 lodash 深度拷贝 aiConfig（双向绑定，可修改）
  aiConfig.value = cloneDeep(selectedConfigData.aiConfig)

  console.log('选中的配置:', value)
  console.log('UI配置（只读）:', uiConfig.value)
  console.log('AI配置（可修改）:', aiConfig.value)
}

// 处理 AI 配置更新
const handleAiConfigUpdate = (value: Record<string, any>) => {
  aiConfig.value = value
}

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
 * 处理生成按钮点击
 * 参考 LibraryMediaGrid.vue:1302-1503
 */
async function handleGenerate() {
  if (!selectedConfig.value || !aiConfig.value) {
    return
  }

  try {
    isGenerating.value = true
    const configData = collection[selectedConfig.value]

    // 1. 扁平化 aiConfig，将包装器结构转换为简单结构
    let newConfig = flattenAiConfig(aiConfig.value)

    // 2. 根据 uploadServer 配置选择上传处理器
    const uploadServer = configData.uploadServer

    if (uploadServer) {
      if (uploadServer === 'bizyair') {
        newConfig = await BizyairFileUploader.processConfigUploads(
          newConfig, // 传递扁平化后的配置
          unifiedStore.getMediaItem,
          unifiedStore.getTimelineItem,
          (fileIndex, stage, progress) => {
            console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
          },
          () => {},
        )
      } else if (uploadServer === 'bltcy') {
        newConfig = await BltcyFileUploader.processConfigUploads(
          newConfig, // 传递扁平化后的配置
          unifiedStore.getMediaItem,
          unifiedStore.getTimelineItem,
          (fileIndex, stage, progress) => {
            console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
          },
          () => {},
        )
      } else if (uploadServer === 'runninghub') {
        newConfig = await RunningHubFileUploader.processConfigUploads(
          newConfig, // 传递扁平化后的配置
          unifiedStore.getMediaItem,
          unifiedStore.getTimelineItem,
          (fileIndex, stage, progress) => {
            console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
          },
          () => {},
        )
      } else if (uploadServer === 'runninghubstd') {
        newConfig = await RunningHubFileUploaderStd.processConfigUploads(
          newConfig, // 传递扁平化后的配置
          unifiedStore.getMediaItem,
          unifiedStore.getTimelineItem,
          (fileIndex, stage, progress) => {
            console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
          },
          () => {},
        )
      } else {
        // TODO: 实现其他上传处理器
        throw new Error(`不支持的上传服务器: ${uploadServer}`)
      }
    }

    // 3. 准备请求参数（newConfig 已经是扁平化的）
    const requestParams: MediaGenerationRequest = {
      ai_task_type: configData.aiTaskType, // 使用配置中的 aiTaskType
      content_type: configData.contentType, // image, video, audio
      task_config: {
        id: configData.id, // 添加配置 id
        ...newConfig, // 使用扁平化后的配置
      },
      sub_ai_task_type: configData.subAiTaskType, // 子任务类型（可选）
    }

    console.log('🚀 [GeneratePanel] 提交AI生成任务到后端...', requestParams)

    // 4. 提交任务到后端
    const submitResult = await submitAIGenerationTask(requestParams)

    // 3. 错误处理
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
            // TODO: 跳转到充值页面
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

      return
    }

    console.log(
      `✅ [GeneratePanel] 任务提交成功: ${submitResult.task_id}, 成本: ${submitResult.cost}`,
    )

    // 4. 创建AI生成数据源
    const aiSource = AIGenerationSourceFactory.createAIGenerationSource(
      {
        type: 'ai-generation',
        aiTaskId: submitResult.task_id, // 使用真实的后端任务ID
        requestParams: requestParams,
        taskStatus: TaskStatus.PENDING, // 初始状态为 PENDING
      },
      SourceOrigin.USER_CREATE,
    )

    // 5. 创建媒体项目
    // 根据内容类型确定文件扩展名
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

    const mediaItem = unifiedStore.createUnifiedMediaItemData(mediaId, mediaName, aiSource, {
      mediaType,
    })

    // 6. 添加到媒体库
    unifiedStore.addMediaItem(mediaItem)

    // 7. 根据输出位置添加到目录
    if (outputLocation.value === 'current') {
      // 添加到当前目录
      if (unifiedStore.currentDir) {
        unifiedStore.addMediaToDirectory(mediaId, unifiedStore.currentDir.id)
      } else {
        console.warn('⚠️ [GeneratePanel] 当前目录不存在，无法添加媒体项')
      }
    } else {
      // 添加到临时目录
      // TODO: 实现临时目录逻辑
      // 可以创建一个专门的"AI生成"目录
      console.log('📁 [GeneratePanel] 添加到临时目录（待实现）')
    }

    // 8. 启动媒体处理流程（进度监控和文件获取）
    unifiedStore.startMediaProcessing(mediaItem)

    // 9. 显示成功消息
    unifiedStore.messageSuccess(t('aiPanel.taskSubmitted'))

    console.log('✅ [GeneratePanel] AI生成流程启动完成')
  } catch (error) {
    console.error('❌ [GeneratePanel] 任务提交失败:', error)
    unifiedStore.messageError(
      t('aiPanel.submitFailed', {
        error: error instanceof Error ? error.message : '未知错误',
      }),
    )
  } finally {
    isGenerating.value = false
  }
}

/**
 * 处理调试输出按钮点击
 */
async function handleDebugOutput() {
  if (!aiConfig.value) {
    console.warn('⚠️ [GeneratePanel] aiConfig 为空')
    return
  }

  // 1. 扁平化配置用于调试
  const flattenedConfig = flattenAiConfig(aiConfig.value)
  console.log('🔍 [GeneratePanel] 扁平化后的配置:')
  console.log(JSON.stringify(flattenedConfig, null, 2))

  try {
    // 根据 uploadServer 配置选择上传处理器（仅用于调试）
    if (!selectedConfig.value) {
      console.warn('⚠️ [GeneratePanel] 未选择配置')
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

        console.log('🔍 [GeneratePanel] 上传后的配置:')
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

        console.log('🔍 [GeneratePanel] 上传后的配置:')
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

        console.log('🔍 [GeneratePanel] 上传后的配置:')
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

        console.log('🔍 [GeneratePanel] 上传后的配置:')
        console.log(JSON.stringify(newConfig, null, 2))
      } else {
        // TODO: 实现其他上传处理器
        console.warn(`⚠️ [GeneratePanel] 不支持的上传服务器: ${uploadServer}`)
      }
    }
  } catch (error) {
    console.error('❌ 调试输出失败:', error)
    unifiedStore.messageError(`调试失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
</style>
