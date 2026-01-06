<template>
  <div class="panel">
    <!-- 配置选择器 -->
    <SearchableSelect
      v-model="selectedConfig"
      :options="configOptions"
      :placeholder="t('aiPanel.selectConfig')"
      value-key="value"
      label-key="label"
      @change="handleConfigChange"
      style="padding: var(--spacing-md); padding-bottom: 0"
    >
      <template #option="{ option }">
        <div class="config-option">
          <div class="option-main">
            <component :is="getIconForContentType(option.value)" size="16px" class="config-icon" />
            <span class="option-label">{{ option.label }}</span>
          </div>
          <div v-if="option.description" class="option-description">
            {{ option.description }}
          </div>
        </div>
      </template>
    </SearchableSelect>

    <!-- 动态配置表单 -->
    <n-scrollbar style="flex: 1; max-height: 100%; padding: var(--spacing-md) var(--spacing-xl)">
      <div class="scrollable-content">
        <DynamicConfigForm
          v-if="uiConfig && aiConfig"
          :uiConfig="uiConfig"
          v-model:aiConfig="aiConfig"
          :locale="currentLang"
        />

        <!-- 输出位置选择 -->
        <div v-if="aiConfig" class="output-location-field">
          <label class="field-label">
            {{ t('aiPanel.outputLocation') }}
          </label>
          <n-radio-group v-model:value="outputLocation">
            <n-radio value="temp">
              {{ t('aiPanel.tempDirectory') }}
            </n-radio>
            <n-radio value="current">
              {{ t('aiPanel.currentDirectory') }}
            </n-radio>
          </n-radio-group>
        </div>

        <!-- 发送按钮 -->
        <button
          v-if="aiConfig"
          class="generate-button"
          :disabled="!selectedConfig || isGenerating"
          @click="handleGenerate"
        >
          <component :is="IconComponents.SPARKLING" size="16px" class="button-icon" />
          <span>{{ isGenerating ? t('aiPanel.generating') : t('aiPanel.generate') }}</span>
        </button>

        <!-- 调试输出按钮 -->
        <button v-if="aiConfig" class="generate-button" @click="handleDebugOutput">
          <component :is="IconComponents.DEBUG" size="16px" class="button-icon" />
          <span>调试输出</span>
        </button>
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { cloneDeep } from 'lodash'
import { NRadioGroup, NRadio, NScrollbar } from 'naive-ui'
import SearchableSelect from '@/components/base/SearchableSelect.vue'
import DynamicConfigForm from './DynamicConfigForm.vue'
import { collection, type ConfigKey } from '@/core/datasource/providers/ai-generation/configs'
import { IconComponents } from '@/constants/iconComponents'
import { useAppI18n } from '@/core/composables/useI18n'
import type { Component } from 'vue'
import type { UIConfig } from '@/core/datasource/providers/ai-generation'
import { useUnifiedStore } from '@/core/unifiedStore'
import { fetchClient } from '@/utils/fetchClient'
import { generateMediaId } from '@/core/utils/idGenerator'
import { BizyairFileUploader } from '@/core/utils/bizyairFileUploader'
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

interface ConfigOption {
  label: string
  value: ConfigKey
  description: string
}

// 初始化 unifiedStore
const unifiedStore = useUnifiedStore()

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

// 从 collection 生成选项列表，支持多语言
const configOptions = computed<ConfigOption[]>(() => {
  return Object.entries(collection).map(([key, config]) => {
    return {
      label: config.name[currentLang.value],
      value: key as ConfigKey,
      description: config.description[currentLang.value],
    }
  })
})

// 根据 contentType 获取对应的图标组件
const getIconForContentType = (configKey: ConfigKey): Component => {
  const config = collection[configKey]
  const contentType = config.contentType

  const iconMap: Record<string, Component> = {
    image: IconComponents.IMAGE_LARGE,
    video: IconComponents.VIDEO,
    audio: IconComponents.MUSIC,
  }

  return iconMap[contentType] || IconComponents.SPARKLING
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

    // 🆕 1. 使用管道函数处理文件上传
    const { newConfig, uploadResults } = await BizyairFileUploader.processConfigUploads(
      aiConfig.value,
      unifiedStore.getMediaItem,
      unifiedStore.getTimelineItem,
      (fileIndex, stage, progress) => {
        console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
      },
    )

    // 检查上传结果
    for (const [index, result] of uploadResults.entries()) {
      if (!result.success) {
        throw new Error(`文件上传失败: ${result.error}`)
      }
    }

    if (uploadResults.size > 0) {
      unifiedStore.messageSuccess('文件上传完成')
    }

    // 3. 准备请求参数
    const requestParams: MediaGenerationRequest = {
      ai_task_type: configData.aiTaskType, // 使用配置中的 aiTaskType
      content_type: configData.contentType, // image, video, audio
      task_config: {
        id: configData.id, // 添加配置 id
        ...newConfig, // AI配置（不包含 web_app_id）
      },
    }

    console.log('🚀 [GeneratePanel] 提交AI生成任务到后端...', requestParams)

    // 2. 提交任务到后端
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
        estimatedCost: submitResult.cost, // 使用后端返回的实际成本
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

  try {
    // 使用管道函数处理文件上传（仅用于调试）
    const { newConfig, uploadResults } = await BizyairFileUploader.processConfigUploads(
      aiConfig.value,
      unifiedStore.getMediaItem,
      unifiedStore.getTimelineItem,
      (fileIndex, stage, progress) => {
        console.log(`文件 ${fileIndex + 1}: ${stage} ${progress}%`)
      },
    )

    if (uploadResults.size > 0) {
      console.log('🔍 [GeneratePanel] 上传后的配置:')
      console.log(JSON.stringify(newConfig, null, 2))
    } else {
      console.log('🔍 [GeneratePanel] 无需上传文件')
      console.log('aiConfig:', JSON.stringify(aiConfig.value, null, 2))
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

.scrollable-content {
  padding-bottom: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.config-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.option-main {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.config-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.option-label {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-description {
  font-size: var(--font-size-xs);
  color: var(--color-text-hint);
  padding-left: 22px;
  line-height: 1.4;
}

.generate-button {
  padding: var(--spacing-md);
  background: var(--color-accent-primary);
  color: white;
  border: none;
  border-radius: var(--border-radius-small);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  transition: all 0.2s ease;
}

.generate-button:hover:not(:disabled) {
  background: var(--color-accent-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.generate-button:active:not(:disabled) {
  transform: translateY(0);
}

.generate-button:disabled {
  background: var(--color-bg-quaternary);
  color: var(--color-text-hint);
  cursor: not-allowed;
  opacity: 0.6;
}

.button-icon {
  flex-shrink: 0;
}

.output-location-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.field-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
  margin-bottom: var(--spacing-xs);
}
</style>
