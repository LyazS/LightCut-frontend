<template>
  <!-- 导出设置对话框 -->
  <UniversalModal
    :show="show"
    :title="t('editor.exportSettings')"
    @close="handleClose"
    @confirm="handleExport"
    @cancel="handleClose"
    :confirm-disabled="!form.title.trim()"
    :confirm-text="t('editor.export')"
  >
    <div class="dialog-body">
      <!-- 视频标题 -->
      <div class="form-group">
        <label>{{ t('editor.videoTitle') }}</label>
        <input
          v-model="form.title"
          type="text"
          class="form-input"
          :placeholder="t('editor.videoTitlePlaceholder')"
          maxlength="100"
          @keydown.enter="handleExport"
        />
      </div>

      <!-- 视频质量 -->
      <div class="form-group">
        <label>{{ t('editor.videoQuality') }}</label>
        <select v-model="form.videoQuality" class="form-select">
          <option value="very_low">{{ t('editor.qualityVeryLow') }}</option>
          <option value="low">{{ t('editor.qualityLow') }}</option>
          <option value="medium">{{ t('editor.qualityMedium') }}</option>
          <option value="high">{{ t('editor.qualityHigh') }}</option>
          <option value="very_high">{{ t('editor.qualityVeryHigh') }}</option>
        </select>
        <div class="quality-hint">{{ getVideoQualityHint(form.videoQuality) }}</div>
      </div>

      <!-- 音频质量 -->
      <div class="form-group">
        <label>{{ t('editor.audioQuality') }}</label>
        <select v-model="form.audioQuality" class="form-select">
          <option value="very_low">{{ t('editor.qualityVeryLow') }}</option>
          <option value="low">{{ t('editor.qualityLow') }}</option>
          <option value="medium">{{ t('editor.qualityMedium') }}</option>
          <option value="high">{{ t('editor.qualityHigh') }}</option>
          <option value="very_high">{{ t('editor.qualityVeryHigh') }}</option>
        </select>
        <div class="quality-hint">{{ getAudioQualityHint(form.audioQuality) }}</div>
      </div>
    </div>
  </UniversalModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import UniversalModal from './UniversalModal.vue'
import { useAppI18n } from '@/core/composables/useI18n'
import {
  QUALITY_VERY_LOW,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_HIGH,
  QUALITY_VERY_HIGH,
  type Quality,
} from 'mediabunny'

const { t } = useAppI18n()

type QualityLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high'

interface Props {
  show: boolean
  defaultTitle?: string
}

interface ExportSettings {
  title: string
  videoQuality: Quality
  audioQuality: Quality
}

interface Emits {
  (e: 'close'): void
  (e: 'export', settings: ExportSettings): void
}

const props = withDefaults(defineProps<Props>(), {
  defaultTitle: '',
})

const emit = defineEmits<Emits>()

// 表单数据（内部使用字符串）
const form = ref<{
  title: string
  videoQuality: QualityLevel
  audioQuality: QualityLevel
}>({
  title: props.defaultTitle || '',
  videoQuality: 'medium',
  audioQuality: 'medium',
})

// 将字符串质量级别转换为 Quality 对象
function qualityLevelToQuality(level: QualityLevel): Quality {
  switch (level) {
    case 'very_low':
      return QUALITY_VERY_LOW
    case 'low':
      return QUALITY_LOW
    case 'medium':
      return QUALITY_MEDIUM
    case 'high':
      return QUALITY_HIGH
    case 'very_high':
      return QUALITY_VERY_HIGH
  }
}

// 处理关闭
function handleClose() {
  emit('close')
}

// 处理导出
function handleExport() {
  if (!form.value.title.trim()) {
    return
  }

  emit('export', {
    title: form.value.title.trim(),
    videoQuality: qualityLevelToQuality(form.value.videoQuality),
    audioQuality: qualityLevelToQuality(form.value.audioQuality),
  })
}

// 获取视频质量提示
function getVideoQualityHint(level: QualityLevel): string {
  const hints: Record<QualityLevel, string> = {
    very_low: t('editor.videoQualityVeryLowHint'),
    low: t('editor.videoQualityLowHint'),
    medium: t('editor.videoQualityMediumHint'),
    high: t('editor.videoQualityHighHint'),
    very_high: t('editor.videoQualityVeryHighHint'),
  }
  return hints[level]
}

// 获取音频质量提示
function getAudioQualityHint(level: QualityLevel): string {
  const hints: Record<QualityLevel, string> = {
    very_low: t('editor.audioQualityVeryLowHint'),
    low: t('editor.audioQualityLowHint'),
    medium: t('editor.audioQualityMediumHint'),
    high: t('editor.audioQualityHighHint'),
    very_high: t('editor.audioQualityVeryHighHint'),
  }
  return hints[level]
}
</script>

<style scoped>
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
.form-select {
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
.form-select:focus {
  outline: none;
  border: 1px solid white;
}

.form-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.5rem;
}

.quality-hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
}
</style>
