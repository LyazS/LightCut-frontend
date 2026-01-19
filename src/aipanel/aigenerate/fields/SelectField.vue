<template>
  <div class="select-field">
    <label class="field-label">
      {{ config.label[locale] }}
    </label>
    <select
      :value="modelValue"
      @change="handleChange"
      class="field-select"
    >
      <option
        v-for="option in config.options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label[locale] }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
import type { SelectInputConfig } from '@/core/datasource/providers/ai-generation'

interface Props {
  config: SelectInputConfig
  modelValue: string | number
  locale: 'zh' | 'en'
}

interface Emits {
  (e: 'update:modelValue', value: string | number): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const handleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const selectedOption = props.config.options.find(opt => opt.value === target.value)
  
  // 如果找到的选项值是数字类型，则转换为数字，否则保持字符串
  if (selectedOption !== undefined && typeof selectedOption.value === 'number') {
    emit('update:modelValue', Number(target.value))
  } else {
    emit('update:modelValue', target.value)
  }
}
</script>

<style scoped>
.select-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.field-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.field-select {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.field-select:focus {
  outline: none;
  border-color: var(--color-accent-primary);
}
</style>