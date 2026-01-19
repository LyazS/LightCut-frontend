<template>
  <div class="number-field">
    <label class="field-label">
      {{ config.label[locale] }}
    </label>
    <SliderInput
      :modelValue="modelValue"
      :min="config.min"
      :max="config.max"
      :step="config.step"
      :realtime="true"
      @update:modelValue="handleValueChange"
    />
    <NumberInput
      :modelValue="modelValue"
      :min="config.min"
      :max="config.max"
      :step="config.step"
      :precision="config.precision"
      :showControls="true"
      @update:modelValue="handleValueChange"
    />
  </div>
</template>

<script setup lang="ts">
import NumberInput from '@/components/base/NumberInput.vue'
import SliderInput from '@/components/base/SliderInput.vue'
import type { NumberInputConfig } from '@/core/datasource/providers/ai-generation'

interface Props {
  config: NumberInputConfig
  modelValue: number
  locale: 'zh' | 'en'
}

interface Emits {
  (e: 'update:modelValue', value: number): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const handleValueChange = (value: number) => {
  emit('update:modelValue', value)
}
</script>

<style scoped>
.number-field {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.field-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
  min-width: 80px;
  flex-shrink: 0;
}
</style>