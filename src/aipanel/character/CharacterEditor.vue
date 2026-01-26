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

    <!-- 角色描述 -->
    <div class="form-group">
      <label>{{ tFunc('media.character.description') }}</label>
      <textarea
        v-model="characterDescription"
        class="form-textarea"
        :placeholder="tFunc('media.character.descriptionPlaceholder')"
        rows="8"
      />
    </div>

    <!-- 参考图 -->
    <div class="form-group">
      <FileInputField :config="refImagesConfig" v-model="refImages" :locale="fieldLocale" />
    </div>

    <!-- 图像比例 -->
    <div class="form-group">
      <label>{{ tFunc('media.character.aspectRatio') }}</label>
      <select v-model="aspectRatio" class="form-select">
        <option value="1:1">1:1</option>
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
        <option value="3:2">3:2</option>
        <option value="3:4">3:4</option>
        <option value="4:3">4:3</option>
        <option value="4:5">4:5</option>
        <option value="5:4">5:4</option>
        <option value="21:9">21:9</option>
      </select>
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
import FileInputField from '@/aipanel/aigenerate/fields/FileInputField.vue'
import type { MultiFileData } from '@/aipanel/aigenerate/types'
import {
  AIGenerationSourceFactory,
  TaskStatus,
  ContentType,
  AITaskType,
} from '@/core/datasource/providers/ai-generation/AIGenerationSource'
import { SourceOrigin } from '@/core/datasource/core/BaseDataSource'
import { generateMediaId } from '@/core/utils/idGenerator'
import { fetchClient } from '@/utils/fetchClient'
import { buildTaskErrorMessage } from '@/utils/errorMessageBuilder'
import type { TaskSubmitResponse } from '@/types/taskApi'
import { RunningHubFileUploaderStd } from '@/core/utils/runninghubFileUploaderStd'

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
const characterComposable = useCharacter(currentCharacterDirId.value)

// 判断媒体是否正在加载
const isMediaLoading = computed(() => {
  // 创建模式下，没有 portraitMediaId，不处于加载状态
  if (unifiedStore.characterEditorState.mode === 'create') {
    return false
  }

  // 编辑模式下，检查 characterMediaStatus
  return characterComposable.characterMediaStatus.value === 'loading'
})

// 字段语言环境
const fieldLocale = computed<'zh' | 'en'>(() => {
  return locale.value === 'zh-CN' ? 'zh' : 'en'
})

// 参考图配置
const refImagesConfig = computed(() => ({
  type: 'file-input' as const,
  label: {
    zh: tFunc('media.character.refImages'),
    en: tFunc('media.character.refImages'),
  },
  path: 'refImages',
  accept: ['image'], // 只接受图片
  placeholder: {
    zh: tFunc('media.character.refImagesPlaceholder'),
    en: tFunc('media.character.refImagesPlaceholder'),
  },
  maxFiles: 10,
}))

// 参考图（支持创建和编辑模式）
const refImages = computed({
  get: () => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      return unifiedStore.characterEditorState.tempRefImages
    } else {
      const character = unifiedStore.curCharacterDir
      return character?.character.refImages ?? []
    }
  },
  set: (value: MultiFileData) => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempRefImages = value
    } else {
      const character = unifiedStore.curCharacterDir
      if (character) {
        character.character.refImages = value
      }
    }
  },
})

// 图像比例（支持创建和编辑模式）
const aspectRatio = computed({
  get: () => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      return unifiedStore.characterEditorState.tempAspectRatio
    } else {
      const character = unifiedStore.curCharacterDir
      return character?.character.aspectRatio || '1:1'
    }
  },
  set: (value: string) => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempAspectRatio = value
    } else {
      const character = unifiedStore.curCharacterDir
      if (character) {
        character.character.aspectRatio = value
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

// 角色描述（支持创建和编辑模式）
const characterDescription = computed({
  get: () => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      return unifiedStore.characterEditorState.tempDescription
    } else {
      const character = unifiedStore.curCharacterDir
      return character?.character.description || ''
    }
  },
  set: (value: string) => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempDescription = value
    } else {
      const character = unifiedStore.curCharacterDir
      if (character) {
        character.character.description = value
      }
    }
  },
})

// 验证逻辑
const canGenerate = computed(() => {
  const name = characterName.value || ''
  const description = characterDescription.value || ''
  return name.trim().length >= 1 && description.trim().length >= 10
})

// 按钮文本（根据模式不同显示不同文本）
const generateButtonText = computed(() => {
  if (unifiedStore.characterEditorState.mode === 'create') {
    return tFunc('media.character.generatePortrait')
  } else {
    return tFunc('media.character.regeneratePortrait')
  }
})

// 生成角色肖像
async function handleGenerate() {
  if (!canGenerate.value) return

  isGenerating.value = true
  try {
    const character = unifiedStore.curCharacterDir
    const characterId = character?.id || null
    const currentDirId = unifiedStore.currentDir?.id || null
    await generateCharacterPortrait(characterId, currentDirId)
    unifiedStore.messageSuccess(tFunc('media.character.generateSuccess'))
  } catch (error) {
    console.error('生成角色肖像失败:', error)
    const errorMessage =
      error instanceof Error ? error.message : tFunc('media.character.generateFailed')
    unifiedStore.messageError(errorMessage)
  } finally {
    isGenerating.value = false
  }
}

// 关闭编辑器
function handleClose() {
  unifiedStore.closeCharacterEditor()
}

/**
 * 提交 AI 生成任务到后端
 */
async function submitAIGenerationTask(requestParams: any): Promise<TaskSubmitResponse> {
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
      error_code: 'UNKNOWN_ERROR' as any,
      error_details: {
        error: error instanceof Error ? error.message : '网络请求失败',
      },
    }
  }
}

/**
 * 生成角色肖像
 * 复用 CreateCharacterModal 的逻辑
 * @param characterId 角色ID（编辑模式）或 null（创建模式）
 * @param currentDirId 当前目录ID（创建模式需要）
 */
async function generateCharacterPortrait(
  characterId: string | null,
  currentDirId: string | null,
): Promise<void> {
  let characterDir: any
  let characterName: string
  let characterDescription: string

  if (unifiedStore.characterEditorState.mode === 'create') {
    // 创建模式：使用临时数据
    characterName = unifiedStore.characterEditorState.tempName.trim()
    characterDescription = unifiedStore.characterEditorState.tempDescription.trim()

    // 验证
    if (!characterName || characterName.length < 1) {
      throw new Error(tFunc('media.character.nameRequired'))
    }
    if (!characterDescription || characterDescription.length < 10) {
      throw new Error(tFunc('media.character.descriptionTooShort'))
    }

    if (!currentDirId) {
      throw new Error(tFunc('media.selectDirectoryFirst'))
    }
  } else {
    // 编辑模式：从角色文件夹获取数据
    characterDir = unifiedStore.curCharacterDir
    if (!characterDir) {
      throw new Error('角色文件夹不存在')
    }

    characterName = characterDir.name.trim()
    characterDescription = characterDir.character.description.trim()

    // 验证
    if (!characterName || characterName.length < 1) {
      throw new Error(tFunc('media.character.nameRequired'))
    }
    if (!characterDescription || characterDescription.length < 10) {
      throw new Error(tFunc('media.character.descriptionTooShort'))
    }
  }

  try {
    // 1. 准备 banana-image 请求参数（包含参考图）
    const taskConfig = {
      id: 'rh-nano-banana-2',
      prompt: characterDescription,
      resolution: '1K',
      aspectRatio: aspectRatio.value,
      imageUrls: refImages.value, // 添加参考图（使用 imageUrls 字段）
    }

    // 2. 使用 RunningHubFileUploaderStd 处理文件上传
    const processedConfig = await RunningHubFileUploaderStd.processConfigUploads(
      taskConfig,
      unifiedStore.getMediaItem,
      unifiedStore.getTimelineItem,
      (fileIndex, stage, progress) => {
        console.log(`参考图 ${fileIndex + 1}: ${stage} ${progress}%`)
      },
      () => {
        console.log('参考图上传完成')
      },
    )

    // 3. 准备请求参数（使用处理后的配置）
    const requestParams = {
      ai_task_type: AITaskType.RUNNINGHUB_GENERATE_MEDIA,
      content_type: ContentType.IMAGE,
      task_config: processedConfig, // 使用处理后的配置
      sub_ai_task_type: 'standard_api',
    }

    console.log('🚀 [CharacterEditor] 提交AI生成任务到后端...', requestParams)

    // 4. 提交任务到后端
    const submitResult = await submitAIGenerationTask(requestParams)

    // 5. 错误处理
    if (!submitResult.success) {
      const errorMessage = buildTaskErrorMessage(
        submitResult.error_code,
        submitResult.error_details,
        tFunc,
      )
      throw new Error(errorMessage)
    }

    console.log(
      `✅ [CharacterEditor] 任务提交成功: ${submitResult.task_id}, 成本: ${submitResult.cost}`,
    )

    // 6. 创建 AI 生成数据源（使用真实的后端任务ID）
    const aiSource = AIGenerationSourceFactory.createAIGenerationSource(
      {
        type: 'ai-generation',
        aiTaskId: submitResult.task_id, // 使用真实的后端任务ID
        requestParams: requestParams,
        taskStatus: TaskStatus.PENDING, // 初始状态为 PENDING
      },
      SourceOrigin.USER_CREATE,
    )

    // 7. 生成媒体ID
    const mediaId = generateMediaId('png')

    // 8. 创建媒体项
    const mediaItem = unifiedStore.createUnifiedMediaItemData(
      mediaId,
      `${characterName}_portrait`,
      aiSource,
    )

    // 9. 启动媒体处理流程
    unifiedStore.startMediaProcessing(mediaItem)

    // 10. 添加到媒体库
    unifiedStore.addMediaItem(mediaItem)

    // 11. 创建或更新角色文件夹
    if (unifiedStore.characterEditorState.mode === 'create') {
      // 创建模式：创建新的角色文件夹
      characterDir = unifiedStore.createCharacterDirectory(
        characterName,
        characterDescription,
        currentDirId!,
      )
      // 添加媒体到角色文件夹
      unifiedStore.addMediaToDirectory(mediaId, characterDir.id)
      // 更新角色文件夹的图片引用
      characterDir.character.portraitMediaId = mediaId
      // 保存参考图和图像比例
      characterDir.character.refImages = refImages.value
      characterDir.character.aspectRatio = aspectRatio.value
      // 切换到编辑模式
      unifiedStore.characterEditorState.mode = 'edit'
      unifiedStore.characterEditorState.characterId = characterDir.id
      unifiedStore.characterEditorState.tempName = ''
      unifiedStore.characterEditorState.tempDescription = ''
      unifiedStore.characterEditorState.tempRefImages = []
      unifiedStore.characterEditorState.tempAspectRatio = '1:1' // 重置为默认值
    } else {
      // 编辑模式：添加到现有角色文件夹
      unifiedStore.addMediaToDirectory(mediaId, characterDir.id)

      // 删除旧的 portraitMediaId（如果存在）
      if (characterDir.character.portraitMediaId) {
        try {
          await unifiedStore.deleteMediaItem(
            characterDir.character.portraitMediaId,
            characterDir.id,
          )
          console.log('✅ 已删除旧的角色肖像:', characterDir.character.portraitMediaId)
        } catch (error) {
          console.error('删除旧肖像失败:', error)
        }
      }

      // 更新角色文件夹的图片引用
      characterDir.character.portraitMediaId = mediaId
      // 保存参考图和图像比例
      characterDir.character.refImages = refImages.value
      characterDir.character.aspectRatio = aspectRatio.value
    }

    console.log('✅ 角色肖像生成任务已提交:', mediaId)
  } catch (error) {
    console.error('生成角色肖像失败:', error)
    throw error
  }
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
.form-textarea,
.form-select {
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

.form-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L2 4h8z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-accent-primary);
}

.form-textarea {
  min-height: 80px;
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
  background-color: #d9f7be;
  color: #b7eb8f;
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

/* 空状态 */
.character-editor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
}
</style>
