<template>
  <div class="character-editor">
    <!-- 标题栏 -->
    <div class="editor-header">
      <h1 class="character-name-title">{{ characterName || tFunc('media.character.untitled') }}</h1>
      <HoverButton
        variant="small"
        class="close-button"
        @click="handleClose"
        :title="tFunc('media.character.exitEdit')"
      >
        {{ tFunc('media.character.exitEdit') }}
      </HoverButton>
    </div>

    <!-- 角色名称 -->
    <div class="form-group">
      <label>{{ tFunc('media.character.name') }}</label>
      <input
        v-model="characterName"
        type="text"
        class="form-input"
        :placeholder="tFunc('media.character.namePlaceholder')"
      />
    </div>

    <!-- 角色备注 -->
    <div class="form-group">
      <label>{{ tFunc('media.character.remark') }}</label>
      <textarea
        v-model="characterRemark"
        class="form-textarea"
        :placeholder="tFunc('media.character.remarkPlaceholder')"
        rows="8"
      />
    </div>

    <!-- 参考视频 -->
    <div class="form-group">
      <FileInputField :config="refVideoConfig" v-model="refVideo" :locale="fieldLocale" />
    </div>

    <!-- 时间戳范围 -->
    <div class="form-group">
      <label>{{ tFunc('media.character.timestamps') }}</label>
      <div class="timestamps-inputs">
        <NumberInput
          v-model="timestampsStart"
          :min="0"
          :step="1"
          :precision="0"
          :placeholder="tFunc('media.character.timestampsStartPlaceholder')"
          class="timestamps-number-input"
        />
        <span class="timestamps-separator">-</span>
        <NumberInput
          v-model="timestampsEnd"
          :min="0"
          :step="1"
          :precision="0"
          :placeholder="tFunc('media.character.timestampsEndPlaceholder')"
          class="timestamps-number-input"
        />
      </div>
    </div>

    <!-- 生成按钮或加载提示 -->
    <div class="form-actions">
      <!-- 生成按钮 -->
      <HoverButton
        v-if="!isGenerating && !isMediaLoading"
        variant="large"
        class="generate-button"
        :disabled="!canGenerate"
        @click="handleGenerate"
      >
        <template #icon>
          <component :is="IconComponents.SPARKLING" size="16px" />
        </template>
        {{ generateButtonText }}
      </HoverButton>

      <!-- 加载提示框 -->
      <div v-else class="loading-indicator">
        <component :is="IconComponents.LOADING" size="24px" class="loading-icon" />
        <span class="loading-text">{{ tFunc('aiPanel.generating') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { useAppI18n } from '@/core/composables/useI18n'
import { useCharacter } from '@/core/composables/useCharacter'
import { IconComponents } from '@/constants/iconComponents'
import HoverButton from '@/components/base/HoverButton.vue'
import NumberInput from '@/components/base/NumberInput.vue'
import FileInputField from '@/aipanel/aigenerate/fields/FileInputField.vue'
import type { MultiFileData } from '@/aipanel/aigenerate/types'
import {
  AIGenerationSourceFactory,
  TaskStatus,
  type MediaGenerationRequest,
  AITaskType,
  ContentType,
} from '@/core/datasource/providers/ai-generation/AIGenerationSource'
import { SourceOrigin } from '@/core/datasource/core/BaseDataSource'
import { generateMediaId } from '@/core/utils/idGenerator'
import { fetchClient } from '@/utils/fetchClient'
import type { TaskSubmitResponse } from '@/types/taskApi'
import { TaskSubmitErrorCode } from '@/types/taskApi'
import {
  buildTaskErrorMessage,
  shouldShowRechargePrompt,
  isRetryableError,
} from '@/utils/errorMessageBuilder'

const { t: tFunc, locale } = useAppI18n()
const unifiedStore = useUnifiedStore()

const isGenerating = ref(false)

// 获取当前角色目录ID
const currentCharacterDirId = computed(() => {
  if (unifiedStore.characterEditorState.mode === 'edit') {
    return unifiedStore.curCharacterDir?.id || null
  }
  return null
})

// 使用 useCharacter composable
const { characterMediaStatus } = useCharacter(currentCharacterDirId)

// 判断媒体是否正在加载
const isMediaLoading = computed(() => {
  // 创建模式下，不处于加载状态
  if (unifiedStore.characterEditorState.mode === 'create') {
    return false
  }

  // 编辑模式下，检查 characterMediaStatus
  // loading 状态包括：pending, asyncprocessing, decoding
  return characterMediaStatus.value === 'loading'
})

// 字段语言环境
const fieldLocale = computed<'zh' | 'en'>(() => {
  return locale.value === 'zh-CN' ? 'zh' : 'en'
})

// 参考视频配置
const refVideoConfig = computed(() => ({
  type: 'file-input' as const,
  label: {
    zh: '参考视频',
    en: 'Reference Video',
  },
  path: 'refVideo',
  accept: ['video'], // 只接受视频
  placeholder: {
    zh: '拖拽视频到此处',
    en: 'Drag video here or click to upload',
  },
  maxFiles: 1,
}))

// 参考视频（支持创建和编辑模式）
const refVideo = computed({
  get: () => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      return unifiedStore.characterEditorState.tempRefVideo
    } else {
      const character = unifiedStore.curCharacterDir
      return character?.character.refVideo || []
    }
  },
  set: (value: MultiFileData) => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempRefVideo = value
    } else {
      const character = unifiedStore.curCharacterDir
      if (character) {
        character.character.refVideo = value
      }
    }
  },
})

// 角色名称（支持创建和编辑模式）
const characterName = computed({
  get: () => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      return unifiedStore.characterEditorState.tempName
    } else {
      const character = unifiedStore.curCharacterDir
      return character?.name || ''
    }
  },
  set: (value: string) => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempName = value
    } else {
      const character = unifiedStore.curCharacterDir
      if (character) {
        character.name = value
      }
    }
  },
})

// 角色备注（支持创建和编辑模式）
const characterRemark = computed({
  get: () => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      return unifiedStore.characterEditorState.tempRemark
    } else {
      const character = unifiedStore.curCharacterDir
      return character?.character.remark || ''
    }
  },
  set: (value: string) => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempRemark = value
    } else {
      const character = unifiedStore.curCharacterDir
      if (character) {
        character.character.remark = value
      }
    }
  },
})

// 时间戳开始时间（支持创建和编辑模式）
const timestampsStart = computed({
  get: () => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      return unifiedStore.characterEditorState.tempTimestamps.st
    } else {
      const character = unifiedStore.curCharacterDir
      return character?.character.timestamps.st || 1
    }
  },
  set: (value: number) => {
    // 获取当前的结束时间
    let currentEnd = 0
    if (unifiedStore.characterEditorState.mode === 'create') {
      currentEnd = unifiedStore.characterEditorState.tempTimestamps.ed
    } else {
      const character = unifiedStore.curCharacterDir
      currentEnd = character?.character.timestamps.ed || 4
    }

    // 限制：结束时间 - 开始时间 <= 3，即开始时间 >= 结束时间 - 3
    const constrainedValue = Math.max(Math.min(value, currentEnd - 1), currentEnd - 3)

    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempTimestamps.st = constrainedValue
    } else {
      const character = unifiedStore.curCharacterDir
      if (character) {
        character.character.timestamps.st = constrainedValue
      }
    }
  },
})

// 时间戳结束时间（支持创建和编辑模式）
const timestampsEnd = computed({
  get: () => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      return unifiedStore.characterEditorState.tempTimestamps.ed
    } else {
      const character = unifiedStore.curCharacterDir
      return character?.character.timestamps.ed || 4
    }
  },
  set: (value: number) => {
    // 获取当前的开始时间
    let currentStart = 0
    if (unifiedStore.characterEditorState.mode === 'create') {
      currentStart = unifiedStore.characterEditorState.tempTimestamps.st
    } else {
      const character = unifiedStore.curCharacterDir
      currentStart = character?.character.timestamps.st || 1
    }

    // 限制：结束时间 - 开始时间 >= 1 且 <= 3
    const constrainedValue = Math.max(Math.min(value, currentStart + 3), currentStart + 1)

    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempTimestamps.ed = constrainedValue
    } else {
      const character = unifiedStore.curCharacterDir
      if (character) {
        character.character.timestamps.ed = constrainedValue
      }
    }
  },
})

// 验证逻辑：只需要验证角色名称和参考视频
const canGenerate = computed(() => {
  const name = characterName.value || ''
  const hasRefVideo = refVideo.value && refVideo.value.length > 0
  return name.trim().length >= 1 && hasRefVideo
})

// 按钮文本（根据模式不同显示不同文本）
const generateButtonText = computed(() => {
  if (unifiedStore.characterEditorState.mode === 'create') {
    return tFunc('media.character.generatePortrait')
  } else {
    return tFunc('media.character.regeneratePortrait')
  }
})

/**
 * 提交角色创建任务到后端
 */
async function submitCharacterCreationTask(
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
 * 处理角色头像生成
 */
async function handleGenerate() {
  if (!canGenerate.value) {
    return
  }

  try {
    isGenerating.value = true

    // 1. 验证参考视频
    const refVideoFile = refVideo.value[0]
    if (!refVideoFile) {
      throw new Error('请上传参考视频')
    }

    // 获取视频 URL
    let videoUrl = ''
    if (refVideoFile.source === 'media-item' && refVideoFile.mediaItemId) {
      const mediaItem = unifiedStore.getMediaItem(refVideoFile.mediaItemId)
      // 从 MediaItem 的 source 中获取 URL
      if (mediaItem && mediaItem.source.type === 'ai-generation') {
        // AI 生成的媒体，从 resultData 中获取 URL
        videoUrl = mediaItem.source.resultData?.url || ''
      } else if (mediaItem && mediaItem.source.type === 'user-selected') {
        // 用户上传的媒体，暂时无法获取 URL，需要其他方式
        throw new Error('用户上传的视频暂不支持直接提取 URL')
      }
    }

    if (!videoUrl) {
      throw new Error('无法获取视频 URL')
    }

    // 2. 确定时间戳（使用用户设置的值）
    const timestamps = `${timestampsStart.value},${timestampsEnd.value}`

    // 3. 准备任务配置
    const taskConfig = {
      timestamps,
      video_url: videoUrl,  // 使用上传的视频URL
      // 或者使用 from_task: refVideoFile.taskId（如果视频来自其他任务）
    }

    // 4. 准备请求参数
    const requestParams: MediaGenerationRequest = {
      ai_task_type: AITaskType.BLTCY_CHARACTER,  // 角色创建任务类型
      content_type: ContentType.IMAGE,            // 返回图片类型
      task_config: taskConfig,
    }

    console.log('🚀 [CharacterEditor] 提交角色创建任务到后端...', requestParams)

    // 5. 提交任务到后端
    const submitResult = await submitCharacterCreationTask(requestParams)

    // 6. 错误处理
    if (!submitResult.success) {
      const errorMessage = buildTaskErrorMessage(
        submitResult.error_code,
        submitResult.error_details,
        tFunc,
      )

      // 根据错误类型提供不同的用户体验
      if (shouldShowRechargePrompt(submitResult.error_code)) {
        // 余额不足：显示充值引导对话框
        unifiedStore.dialogWarning({
          title: tFunc('media.error.insufficientBalance'),
          content: errorMessage + '\n\n' + tFunc('media.error.rechargePrompt'),
          positiveText: tFunc('media.confirm'),
          negativeText: tFunc('media.cancel'),
          onPositiveClick: () => {
            // TODO: 跳转到充值页面
            console.log('跳转到充值页面')
          },
        })
      } else if (isRetryableError(submitResult.error_code)) {
        // 可重试错误：显示重试选项
        unifiedStore.dialogWarning({
          title: tFunc('media.character.generationFailed'),
          content: errorMessage,
          positiveText: tFunc('media.retry'),
          negativeText: tFunc('media.cancel'),
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
      `✅ [CharacterEditor] 任务提交成功: ${submitResult.task_id}, 成本: ${submitResult.cost}`,
    )

    // 7. 创建AI生成数据源
    const aiSource = AIGenerationSourceFactory.createAIGenerationSource(
      {
        type: 'ai-generation',
        aiTaskId: submitResult.task_id, // 使用真实的后端任务ID
        requestParams: requestParams,
        taskStatus: TaskStatus.PENDING, // 初始状态为 PENDING
      },
      SourceOrigin.USER_CREATE,
    )

    // 8. 创建媒体项目
    const mediaId = generateMediaId('png')  // 角色头像为PNG格式
    const mediaName = `${characterName.value}_portrait`

    const mediaItem = unifiedStore.createUnifiedMediaItemData(mediaId, mediaName, aiSource, {
      mediaType: 'image',
    })

    // 9. 添加到媒体库
    unifiedStore.addMediaItem(mediaItem)

    // 10. 处理角色文件夹
    let characterDirId: string
    if (unifiedStore.characterEditorState.mode === 'edit' && unifiedStore.curCharacterDir) {
      // 编辑模式：使用现有角色文件夹
      characterDirId = unifiedStore.curCharacterDir.id
    } else if (unifiedStore.characterEditorState.mode === 'create') {
      // 创建模式：先创建角色文件夹
      const characterDir = unifiedStore.createCharacterDirectory(
        characterName.value || '未命名角色',
        characterRemark.value || '',
        refVideo.value,
        unifiedStore.currentDir?.id || null, // 使用当前目录作为父目录
        { st: timestampsStart.value, ed: timestampsEnd.value }, // 传入时间戳
      )
      characterDirId = characterDir.id
      console.log('✅ [CharacterEditor] 角色文件夹创建成功:', characterDir.name)

      // 切换到编辑模式
      unifiedStore.openCharacterEditor('edit', characterDirId)
      console.log('✅ [CharacterEditor] 已切换到编辑模式:', characterDirId)
    } else {
      throw new Error('无效的角色编辑器模式')
    }

    // 11. 将 MediaItem 添加到角色文件夹
    unifiedStore.addMediaToDirectory(mediaId, characterDirId)

    // 12. 保存 MediaItem ID 到角色信息中
    const characterDir = unifiedStore.getCharacterDirectory(characterDirId)
    if (characterDir) {
      // 如果已有 profileMediaItemId，先删除旧的 MediaItem
      const oldProfileMediaItemId = characterDir.character.profileMediaItemId
      if (oldProfileMediaItemId) {
        console.log('🗑️ [CharacterEditor] 删除旧的头像 MediaItem:', oldProfileMediaItemId)
        await unifiedStore.deleteMediaItem(oldProfileMediaItemId, characterDirId)
      }

      // 保存新的 MediaItem ID
      characterDir.character.profileMediaItemId = mediaItem.id
      console.log('✅ [CharacterEditor] 已更新头像 MediaItem ID:', mediaItem.id)
    }

    // 13. 启动媒体处理流程（进度监控和文件获取）
    unifiedStore.startMediaProcessing(mediaItem)

    // 14. 显示成功消息
    unifiedStore.messageSuccess(tFunc('media.character.taskSubmitted'))

    console.log('✅ [CharacterEditor] 角色头像生成流程启动完成')

  } catch (error) {
    console.error('❌ [CharacterEditor] 任务提交失败:', error)
    unifiedStore.messageError(
      tFunc('media.character.submitFailed', {
        error: error instanceof Error ? error.message : '未知错误',
      }),
    )
  } finally {
    isGenerating.value = false
  }
}

// 关闭编辑器
function handleClose() {
  unifiedStore.closeCharacterEditor()
}
</script>

<style scoped>
/* 角色编辑器容器 */
.character-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: var(--spacing-md) var(--spacing-xl);
}

/* 标题栏 */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
}

/* 角色名称标题 */
.character-name-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  word-break: break-word;
  flex: 1;
}

/* 关闭按钮 */
.close-button {
  color: #ff4d4f;
  flex-shrink: 0;
  margin-left: var(--spacing-md);
}

.close-button:hover:not(:disabled) {
  background-color: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
}

/* 表单组 */
.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-lg);
}

.form-group:last-of-type {
  margin-bottom: 0;
}

.form-group label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
}

/* 表单输入框 */
.form-input,
.form-textarea {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-family: inherit;
  resize: vertical;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent-primary);
}

.form-textarea {
  min-height: 80px;
}

/* 时间戳输入框容器 */
.timestamps-inputs {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.timestamps-number-input {
  flex: 1;
  min-width: 100px;
}

.timestamps-separator {
  color: var(--color-text-secondary);
  font-weight: 500;
  flex-shrink: 0;
}

/* 表单操作区 */
.form-actions {
  margin-top: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.form-actions :deep(.hover-button) {
  width: 100%;
}

/* 生成按钮 */
.form-actions :deep(.generate-button) {
  background-color: #52c41a;
  color: #fff;
}

.form-actions :deep(.generate-button:hover:not(:disabled)) {
  background-color: #73d13d;
}

.form-actions :deep(.generate-button:disabled) {
  background-color: #e8e8e8;
  color: #999;
}

/* 加载提示框 */
.loading-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background-color: var(--color-bg-quaternary);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-small);
}

.loading-icon {
  animation: spin 1s linear infinite;
  color: var(--color-accent-primary);
}

.loading-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: 500;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
