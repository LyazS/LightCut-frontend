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
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
import type { SelectInputConfig } from '@/core/datasource/providers/ai-generation'

interface Props {
  config: SelectInputConfig
  modelValue: string
  locale: 'zh' | 'en'
}

interface Emits {
  (e: 'update:modelValue', value: string): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const handleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  emit('update:modelValue', target.value)
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