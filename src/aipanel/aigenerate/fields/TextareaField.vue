<template>
  <div class="textarea-field">
    <label class="field-label">
      {{ config.label[locale] }}
      <span v-if="isRequired" class="required-mark">*</span>
    </label>
    <textarea
      :value="modelValue"
      @input="handleInput"
      :class="fieldClasses"
      rows="4"
      :placeholder="getPlaceholder()"
    />
    <!-- 错误提示 -->
    <div v-if="hasError" class="error-message">
      <component :is="IconComponents.WARNING" size="14px" />
      <span>{{ errorMessage }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TextareaInputConfig, FieldValidationError } from '@/aipanel/aigenerate/types'
import { IconComponents } from '@/constants/iconComponents'

interface Props {
  config: TextareaInputConfig
  modelValue: string
  locale: 'zh' | 'en'
  error?: FieldValidationError  // 新增：验证错误
}

interface Emits {
  (e: 'update:modelValue', value: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 是否显示必填标记
const isRequired = computed(() => props.config.required)

// 是否有错误
const hasError = computed(() => !!props.error)

// 错误消息
const errorMessage = computed(() => {
  if (!props.error) return ''
  return props.error.message[props.locale]
})

// 字段样式类
const fieldClasses = computed(() => ({
  'field-textarea': true,
  'field-error': hasError.value
}))

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

const getPlaceholder = () => {
  return props.config.placeholder?.[props.locale] || (props.locale === 'zh' ? '请输入内容...' : 'Enter content...')
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

/* 必填标记 */
.required-mark {
  color: var(--color-error);
  margin-left: 2px;
}

/* 错误状态的输入框 */
.field-textarea.field-error {
  border-color: var(--color-error);
  background: var(--color-error-bg);
}

.field-textarea.field-error:focus {
  border-color: var(--color-error);
  box-shadow: 0 0 0 2px var(--color-error-bg);
}

/* 错误消息 */
.error-message {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--color-error);
}
</style>