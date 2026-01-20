<template>
  <div class="dynamic-config-form">
    <div
      v-for="(fieldConfig, index) in uiConfig"
      :key="index"
      class="form-field"
    >
      <component
        :is="getFieldComponent(fieldConfig.type)"
        v-if="getFieldComponent(fieldConfig.type)"
        :config="fieldConfig as any"
        :modelValue="getFieldValue(fieldConfig.path)"
        :locale="locale"
        @update:modelValue="handleFieldChange(fieldConfig.path, $event)"
      />
      <div v-else class="field-error">
        未知字段类型: {{ fieldConfig.type }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { cloneDeep } from 'lodash'
import { FIELD_COMPONENT_MAP, type FieldType } from './fields'
import type { UIConfig } from '@/aipanel/aigenerate/types'
import { getValueByPath, setValueByPath } from './utils/pathUtils'

interface Props {
  // UI配置数组（单向绑定，只读）
  uiConfig: UIConfig[]
  // AI配置对象（双向绑定，可修改）
  aiConfig: Record<string, any>
  locale: 'zh' | 'en'
}

interface Emits {
  // aiConfig 双向绑定的更新事件
  (e: 'update:aiConfig', value: Record<string, any>): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 获取字段组件
const getFieldComponent = (type: string) => {
  return FIELD_COMPONENT_MAP[type as FieldType] || null
}

// 规范化路径 - 移除 'aiConfig.' 前缀（如果存在）
const normalizePath = (path: string): string => {
  return path.startsWith('aiConfig.') ? path.substring(9) : path
}

// 获取字段值 - 直接从 props.aiConfig 读取
const getFieldValue = (path: string) => {
  const normalizedPath = normalizePath(path)
  return getValueByPath(props.aiConfig, normalizedPath)
}

// 处理字段变化 - 使用 lodash 深拷贝后更新
const handleFieldChange = (path: string, value: any) => {
  const normalizedPath = normalizePath(path)
  // 深拷贝 aiConfig 避免直接修改 props
  const newConfig = cloneDeep(props.aiConfig)
  setValueByPath(newConfig, normalizedPath, value)
  
  // 触发双向绑定更新事件
  emit('update:aiConfig', newConfig)
}
</script>

<style scoped>
.dynamic-config-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.form-field {
  width: 100%;
}

.field-error {
  padding: var(--spacing-sm);
  background: var(--color-error-bg);
  color: var(--color-error);
  border-radius: var(--border-radius-small);
  font-size: var(--font-size-sm);
}
</style>