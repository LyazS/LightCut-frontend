<template>
  <div class="textarea-field">
    <label class="field-label">
      {{ config.label[locale] }}
    </label>
    <textarea
      :value="modelValue"
      @input="handleInput"
      class="field-textarea"
      rows="4"
      :placeholder="getPlaceholder()"
    />
  </div>
</template>

<script setup lang="ts">
import type { TextareaInputConfig } from '@/core/datasource/providers/ai-generation'

interface Props {
  config: TextareaInputConfig
  modelValue: string
  locale: 'zh' | 'en'
}

interface Emits {
  (e: 'update:modelValue', value: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

const getPlaceholder = () => {
  return props.locale === 'zh' ? '请输入内容...' : 'Enter content...'
}
</script>

<style scoped>
.textarea-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.field-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.field-textarea {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
}

.field-textarea:focus {
  outline: none;
  border-color: var(--color-accent-primary);
}
</style>