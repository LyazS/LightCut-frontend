<template>
  <div class="media-item-properties">
    <!-- 基本信息区 -->
    <div class="properties-section">
      <h3 class="section-title">{{ t('properties.mediaItem.basicInfo') }}</h3>
      <div class="info-row">
        <span class="info-label">{{ t('properties.mediaItem.name') }}</span>
        <span class="info-value">{{ mediaItem.name }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">{{ t('properties.mediaItem.type') }}</span>
        <span class="info-value">{{ getMediaTypeLabel(mediaItem.mediaType) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">{{ t('properties.mediaItem.createdAt') }}</span>
        <span class="info-value">{{ formatCreatedAt(mediaItem.createdAt) }}</span>
      </div>
    </div>

    <!-- 状态信息区 -->
    <div class="properties-section">
      <h3 class="section-title">{{ t('properties.mediaItem.statusInfo') }}</h3>
      <div class="status-display">
        <component :is="statusIcon" size="20px" :class="statusIconClass" />
        <span class="status-text">{{ statusText }}</span>
      </div>

      <!-- 错误信息（error 状态） -->
      <div
        v-if="mediaItem.mediaStatus === 'error' && mediaItem.source.errorMessage"
        class="error-message"
      >
        <span class="error-label">{{ t('properties.mediaItem.errorDetails') }}:</span>
        <span class="error-text">{{ mediaItem.source.errorMessage }}</span>
      </div>
    </div>

    <!-- 技术信息区（仅 ready 状态显示） -->
    <div v-if="mediaItem.mediaStatus === 'ready'" class="properties-section">
      <h3 class="section-title">{{ t('properties.mediaItem.techInfo') }}</h3>

      <!-- 时长（视频和音频） -->
      <div
        v-if="
          (mediaItem.mediaType === 'video' || mediaItem.mediaType === 'audio') && mediaItem.duration
        "
        class="info-row"
      >
        <span class="info-label">{{ t('properties.mediaItem.duration') }}</span>
        <span class="info-value">{{ formatDuration(mediaItem.duration) }}</span>
      </div>

      <!-- 分辨率（视频和图片） -->
      <div
        v-if="mediaItem.mediaType === 'video' || mediaItem.mediaType === 'image'"
        class="info-row"
      >
        <span class="info-label">{{ t('properties.mediaItem.resolution') }}</span>
        <span class="info-value">
          {{ mediaItem.runtime.bunny?.originalWidth }}x{{ mediaItem.runtime.bunny?.originalHeight }}
        </span>
      </div>

      <!-- 文件大小（如果有） -->
      <div v-if="fileSize" class="info-row">
        <span class="info-label">{{ t('properties.mediaItem.fileSize') }}</span>
        <span class="info-value">{{ fileSize }}</span>
      </div>

      <!-- 文件路径（如果有） -->
      <div v-if="filePath" class="info-row">
        <span class="info-label">{{ t('properties.mediaItem.filePath') }}</span>
        <span class="info-value">{{ filePath }}</span>
      </div>
    </div>

    <!-- 操作区 -->
    <div v-if="showActions" class="properties-section actions-section">
      <h3 class="section-title">{{ t('properties.mediaItem.actions') }}</h3>

      <!-- 重试按钮（error/cancelled 状态，仅 AI 生成类型） -->
      <n-button v-if="canRetry" type="primary" size="small" @click="handleRetry">
        <template #icon>
          <component :is="IconComponents.REFRESH" size="16px" />
        </template>
        {{ t('properties.mediaItem.retry') }}
      </n-button>

      <!-- 取消按钮（pending 状态） -->
      <n-button
        v-if="mediaItem.mediaStatus === 'pending'"
        type="error"
        size="small"
        @click="handleCancel"
      >
        <template #icon>
          <component :is="IconComponents.CLOSE" size="16px" />
        </template>
        {{ t('properties.mediaItem.cancel') }}
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NButton } from 'naive-ui'
import { useUnifiedStore } from '@/core/unifiedStore'
import { useAppI18n } from '@/core/composables/useI18n'
import { framesToTimecode } from '@/core/utils/timeUtils'
import { IconComponents } from '@/constants/iconComponents'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import {
  AIGenerationSourceFactory,
  TaskStatus,
  type MediaGenerationRequest,
  type AIGenerationSourceData,
} from '@/core/datasource/providers/ai-generation/AIGenerationSource'
import { fetchClient } from '@/utils/fetchClient'
import type { TaskSubmitResponse } from '@/types/taskApi'
import { TaskSubmitErrorCode } from '@/types/taskApi'
import { buildTaskErrorMessage } from '@/utils/errorMessageBuilder'

interface Props {
  mediaItem: UnifiedMediaItemData
}

const props = defineProps<Props>()
const unifiedStore = useUnifiedStore()
const { t } = useAppI18n()

// 状态图标
const statusIcon = computed(() => {
  switch (props.mediaItem.mediaStatus) {
    case 'pending':
      return IconComponents.TIME
    case 'asyncprocessing':
      return IconComponents.LOADING
    case 'decoding':
      return IconComponents.SEARCH
    case 'error':
      return IconComponents.WARNING
    case 'cancelled':
      return IconComponents.CLOSE
    case 'ready':
      return IconComponents.CHECK
    default:
      return IconComponents.QUESTION
  }
})

// 状态图标样式类
const statusIconClass = computed(() => {
  switch (props.mediaItem.mediaStatus) {
    case 'pending':
      return 'status-icon-pending'
    case 'asyncprocessing':
    case 'decoding':
      return 'status-icon-processing'
    case 'error':
    case 'cancelled':
      return 'status-icon-error'
    case 'ready':
      return 'status-icon-ready'
    default:
      return 'status-icon-unknown'
  }
})

// 状态文本
const statusText = computed(() => {
  switch (props.mediaItem.mediaStatus) {
    case 'pending':
      return t('media.tooltip.pending')
    case 'asyncprocessing':
      return `${t('media.tooltip.processing')}: ${(props.mediaItem.source.progress ?? 0).toFixed(2)}%`
    case 'decoding':
      return t('media.tooltip.decoding')
    case 'error':
      return t('media.tooltip.error')
    case 'cancelled':
      return t('media.tooltip.cancelled')
    case 'ready':
      return t('media.tooltip.ready')
    default:
      return t('media.unknown')
  }
})

// 文件大小（从数据源获取）
const fileSize = computed(() => {
  const source = props.mediaItem.source
  if (source.type === 'user-selected' && source.selectedFile) {
    const size = source.selectedFile.size
    if (size < 1024) {
      return `${size} B`
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`
    } else {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`
    }
  }
  return null
})

// 文件路径（从数据源获取）
const filePath = computed(() => {
  const source = props.mediaItem.source
  if (source.type === 'user-selected' && source.selectedFile) {
    return source.selectedFile.name
  }
  return null
})

// 是否显示操作区
const showActions = computed(() => {
  const status = props.mediaItem.mediaStatus
  return status === 'pending' || status === 'error' || status === 'cancelled'
})

// 是否可以重试（仅 AI 生成类型）
const canRetry = computed(() => {
  const status = props.mediaItem.mediaStatus
  const isAIType = props.mediaItem.source.type === 'ai-generation'
  return (status === 'error' || status === 'cancelled') && isAIType
})

// 格式化时长显示
function formatDuration(frames: number): string {
  return framesToTimecode(frames)
}

// 格式化创建时间
function formatCreatedAt(createdAt: string): string {
  const date = new Date(createdAt)
  return date.toLocaleString()
}

// 获取媒体类型标签
function getMediaTypeLabel(mediaType: string): string {
  switch (mediaType) {
    case 'video':
      return t('media.video')
    case 'audio':
      return t('media.audio')
    case 'image':
      return t('media.image')
    case 'text':
      return t('media.text')
    default:
      return t('media.unknown')
  }
}

// 提交AI生成任务到后端
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

// 重试AI生成素材
async function retryAIGeneration(mediaItem: UnifiedMediaItemData): Promise<void> {
  const aiSource = mediaItem.source as AIGenerationSourceData

  // 1. 重新提交任务到后端
  const submitResult = await submitAIGenerationTask(aiSource.requestParams)

  if (!submitResult.success) {
    const errorMessage = buildTaskErrorMessage(
      submitResult.error_code,
      submitResult.error_details,
      t,
    )
    throw new Error(errorMessage)
  }

  // 2. 更新任务ID和状态
  aiSource.aiTaskId = submitResult.task_id
  aiSource.taskStatus = TaskStatus.PENDING
  aiSource.actualCost = undefined
  aiSource.resultPath = undefined

  // 3. 重置数据源状态
  aiSource.progress = 0
  aiSource.errorMessage = undefined
  aiSource.streamConnected = false

  // 4. 重置媒体状态
  mediaItem.mediaStatus = 'pending'

  // 5. 重新启动处理流程
  unifiedStore.startMediaProcessing(mediaItem)

  unifiedStore.messageSuccess(t('media.retryStarted', { name: mediaItem.name }))
}

// 重试操作
async function handleRetry(): Promise<void> {
  const mediaItem = props.mediaItem
  if (!mediaItem) return

  try {
    // 🌟 只支持 AI 生成类型的重试
    if (mediaItem.source.type === 'ai-generation') {
      await retryAIGeneration(mediaItem)
    } else {
      // 其他类型不支持重试
      unifiedStore.messageWarning(t('media.retryNotSupported'))
      return
    }
  } catch (error) {
    console.error('重试失败:', error)
    unifiedStore.messageError(
      t('media.retryFailed', {
        error: error instanceof Error ? error.message : '未知错误',
      }),
    )
  }
}

// 取消操作
async function handleCancel(): Promise<void> {
  const mediaItem = props.mediaItem
  if (!mediaItem) return

  try {
    console.log(`🛑 [MediaItemProperties] 尝试取消任务: ${mediaItem.name}`)

    const success = await unifiedStore.cancelMediaProcessing(mediaItem.id)

    if (success) {
      unifiedStore.messageSuccess(t('media.cancelSuccess', { name: mediaItem.name }))
    } else {
      unifiedStore.messageWarning(t('media.cancelFailed', { name: mediaItem.name }))
    }
  } catch (error) {
    console.error('取消任务失败:', error)
    unifiedStore.messageError(
      t('media.cancelFailed', {
        name: mediaItem.name,
      }),
    )
  }
}
</script>

<style scoped>
.media-item-properties {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0;
}

.properties-section {
  padding: 0 var(--spacing-lg);
}

.section-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xs) 0;
  font-size: var(--font-size-sm);
}

.info-label {
  color: var(--color-text-secondary);
}

.info-value {
  color: var(--color-text-primary);
  font-weight: 500;
}

.status-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--color-bg-quaternary);
  border-radius: var(--border-radius-small);
}

.status-text {
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.status-icon-pending {
  color: var(--color-status-pending);
}

.status-icon-processing {
  color: var(--color-status-processing);
  animation: spin 1s linear infinite;
}

.status-icon-error {
  color: var(--color-status-error);
}

.status-icon-ready {
  color: var(--color-success);
}

.status-icon-unknown {
  color: var(--color-text-hint);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.progress-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--color-progress-background);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-status-processing);
  transition: width 0.5s ease-in-out;
}

.progress-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  min-width: 45px;
  text-align: right;
}

.error-message {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: rgba(255, 0, 0, 0.1);
  border-radius: var(--border-radius-small);
  font-size: var(--font-size-sm);
}

.error-label {
  color: var(--color-status-error);
  font-weight: 600;
}

.error-text {
  color: var(--color-text-primary);
  margin-left: var(--spacing-xs);
}

.actions-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.actions-section .n-button {
  width: 100%;
  justify-content: center;
}
</style>
