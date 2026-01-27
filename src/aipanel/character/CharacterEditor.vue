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
    zh: '拖拽视频到此处或点击上传',
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

// 验证逻辑
const canGenerate = computed(() => {
  const name = characterName.value || ''
  const remark = characterRemark.value || ''
  return name.trim().length >= 1 && remark.trim().length >= 10
})

// 按钮文本（根据模式不同显示不同文本）
const generateButtonText = computed(() => {
  if (unifiedStore.characterEditorState.mode === 'create') {
    return tFunc('media.character.generatePortrait')
  } else {
    return tFunc('media.character.regeneratePortrait')
  }
})

// 生成角色肖像（占位函数）
function handleGenerate() {
  console.log('生成按钮被点击')
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
</style>
