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

const { t: tFunc } = useAppI18n()
const unifiedStore = useUnifiedStore()

const isGenerating = ref(false)

// 角色名称（支持创建和编辑模式）
const characterName = computed({
  get: () => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      return unifiedStore.characterEditorState.tempName
    } else {
      const characterId = unifiedStore.characterEditorState.characterId
      if (!characterId) return ''
      const character = unifiedStore.getCharacterDirectory(characterId)
      return character?.name || ''
    }
  },
  set: (value: string) => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempName = value
    } else {
      const characterId = unifiedStore.characterEditorState.characterId
      if (characterId) {
        const character = unifiedStore.getCharacterDirectory(characterId)
        if (character) {
          character.name = value
        }
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
      const characterId = unifiedStore.characterEditorState.characterId
      if (!characterId) return ''
      const character = unifiedStore.getCharacterDirectory(characterId)
      return character?.character.description || ''
    }
  },
  set: (value: string) => {
    if (unifiedStore.characterEditorState.mode === 'create') {
      unifiedStore.characterEditorState.tempDescription = value
    } else {
      const characterId = unifiedStore.characterEditorState.characterId
      if (characterId) {
        const character = unifiedStore.getCharacterDirectory(characterId)
        if (character) {
          character.character.description = value
        }
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
    const characterId = unifiedStore.characterEditorState.characterId
    const currentDirId = unifiedStore.currentDir?.id || null
    await unifiedStore.generateCharacterPortrait(characterId, currentDirId, tFunc)
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
