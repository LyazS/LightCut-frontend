<template>
  <div class="character-editor">
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

    <!-- 生成按钮 -->
    <div class="form-actions">
      <HoverButton
        variant="large"
        class="close-button"
        @click="handleClose"
        :title="tFunc('media.character.exitEdit')"
      >
        <template #icon>
          <component :is="IconComponents.CLOSE" size="16px" />
        </template>
        {{ tFunc('media.character.exitEdit') }}
      </HoverButton>
      <HoverButton
        variant="large"
        :disabled="!canGenerate || isGenerating"
        @click="handleGenerate"
      >
        <template #icon v-if="isGenerating">
          <component :is="IconComponents.LOADING" size="16px" />
        </template>
        <template #icon v-else>
          <component :is="IconComponents.SPARKLING" size="16px" />
        </template>
        {{ isGenerating ? tFunc('aiPanel.generating') : tFunc('media.character.generatePortrait') }}
      </HoverButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { useAppI18n } from '@/core/composables/useI18n'
import { IconComponents } from '@/constants/iconComponents'
import HoverButton from '@/components/base/HoverButton.vue'
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

const { t: tFunc } = useAppI18n()
const unifiedStore = useUnifiedStore()

const isGenerating = ref(false)

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
  return (
    name.trim().length >= 1 &&
    description.trim().length >= 10
  )
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
    const errorMessage = error instanceof Error ? error.message : tFunc('media.character.generateFailed')
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
 * 更新角色编辑器临时数据
 */
function updateCharacterEditorTempData(name: string, description: string): void {
  unifiedStore.characterEditorState.tempName = name
  unifiedStore.characterEditorState.tempDescription = description
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
    // 1. 准备 banana-image 请求参数
    const taskConfig = {
      id: 'rh-nano-banana-2',
      prompt: characterDescription,
      resolution: '1K',
      aspectRatio: '1:1',
    }

    // 2. 创建 AI 生成数据源
    const aiSource = AIGenerationSourceFactory.createAIGenerationSource(
      {
        type: 'ai-generation',
        aiTaskId: '',
        requestParams: {
          ai_task_type: AITaskType.RUNNINGHUB_GENERATE_MEDIA,
          content_type: ContentType.IMAGE,
          task_config: taskConfig,
          sub_ai_task_type: 'standard_api',
        },
        taskStatus: TaskStatus.PENDING,
      },
      SourceOrigin.USER_CREATE,
    )

    // 3. 生成媒体ID
    const mediaId = generateMediaId('png')

    // 4. 创建媒体项
    const mediaItem = unifiedStore.createUnifiedMediaItemData(
      mediaId,
      `${characterName}_portrait`,
      aiSource,
    )

    // 5. 提交任务到后端
    const submitResult = await submitAIGenerationTask(aiSource.requestParams)

    if (!submitResult.success) {
      // 任务提交失败，更新媒体状态
      mediaItem.mediaStatus = 'error'
      aiSource.errorMessage = buildTaskErrorMessage(
        submitResult.error_code,
        submitResult.error_details,
        tFunc,
      )
      throw new Error(aiSource.errorMessage)
    }

    // 6. 更新任务ID并开始处理
    aiSource.aiTaskId = submitResult.task_id || ''
    aiSource.taskStatus = TaskStatus.PENDING

    // 7. 启动媒体处理流程
    unifiedStore.startMediaProcessing(mediaItem)

    // 8. 添加到媒体库
    unifiedStore.addMediaItem(mediaItem)

    // 9. 创建或更新角色文件夹
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
      // 切换到编辑模式
      unifiedStore.characterEditorState.mode = 'edit'
      unifiedStore.characterEditorState.characterId = characterDir.id
      unifiedStore.characterEditorState.tempName = ''
      unifiedStore.characterEditorState.tempDescription = ''
    } else {
      // 编辑模式：添加到现有角色文件夹
      unifiedStore.addMediaToDirectory(mediaId, characterDir.id)
      // 更新角色文件夹的图片引用
      characterDir.character.portraitMediaId = mediaId
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

/* 表单操作区 */
.form-actions {
  margin-top: var(--spacing-lg);
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

/* 关闭按钮 */
.close-button {
  color: #ff4d4f;
}

.close-button:hover:not(:disabled) {
  background-color: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
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
