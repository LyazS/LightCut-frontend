<template>
  <!-- 编辑项目对话框 -->
  <UniversalModal
    :show="show"
    :title="t('project.edit')"
    @close="handleClose"
    @confirm="saveProject"
    @cancel="handleClose"
    :confirm-disabled="!form.name.trim() || isSaving"
    :loading="isSaving"
    :confirm-text="isSaving ? t('common.saving') + '...' : t('common.save')"
    :cancel-text="t('common.cancel')"
  >
    <div class="dialog-body">
      <div class="form-group">
        <label>{{ t('common.name') }}</label>
        <input
          id="project-name"
          v-model="form.name"
          type="text"
          class="form-input"
          :placeholder="t('project.namePlaceholder', '请输入项目名称')"
          maxlength="100"
          @keydown.enter="saveProject"
        />
      </div>
      <div class="form-group">
        <label>{{ t('common.description') }}</label>
        <textarea
          id="project-description"
          v-model="form.description"
          class="form-textarea"
          :placeholder="t('project.descriptionPlaceholder', '请输入项目描述（可选）')"
          rows="4"
          maxlength="500"
        ></textarea>
      </div>
    </div>
  </UniversalModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import UniversalModal from './UniversalModal.vue'
import { useAppI18n } from '@/core/composables/useI18n'
import type { UnifiedProjectConfig } from '@/core/project/types'

const { t } = useAppI18n()

interface Props {
  show: boolean
  project: UnifiedProjectConfig | null
  isSaving?: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'save', data: { name: string; description: string }): void
}

const props = withDefaults(defineProps<Props>(), {
  isSaving: false,
})

const emit = defineEmits<Emits>()

// 表单数据
const form = ref({
  name: '',
  description: '',
})

// 监听项目变化，更新表单数据
watch(
  () => props.project,
  (newProject) => {
    if (newProject) {
      form.value.name = newProject.name
      form.value.description = newProject.description || ''
    }
  },
  { immediate: true },
)

// 监听显示状态，重置表单
watch(
  () => props.show,
  (newShow) => {
    if (newShow && props.project) {
      form.value.name = props.project.name
      form.value.description = props.project.description || ''
    }
  },
)

// 处理关闭
function handleClose() {
  emit('close')
}

// 保存项目
function saveProject() {
  if (!form.value.name.trim() || props.isSaving) {
    return
  }

  emit('save', {
    name: form.value.name.trim(),
    description: form.value.description.trim(),
  })
}
</script>

<style scoped>
/* 通用Modal的样式已经包含在UniversalModal组件中 */
/* 这里只需要定义内容区域特有的样式 */
.dialog-body {
  padding: 0;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 0.75rem;
  background: var(--color-bg-primary);
  border: 1px solid transparent;
  border-radius: var(--border-radius-medium);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border: 1px solid white;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  line-height: 1.5;
}
</style>
