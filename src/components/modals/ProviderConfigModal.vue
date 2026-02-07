<template>
  <UniversalModal
    :show="show"
    :title="t('app.apiConfigCenter')"
    @close="handleClose"
    @cancel="handleClose"
    :show-confirm="false"
    :show-cancel="false"
    :show-footer="false"
  >
    <div class="provider-config-content">
      <!-- BizyAir 配置区域 -->
      <div class="provider-section">
        <div class="section-title">
          <img src="/logo-3rd/bizyair.webp" alt="BizyAir" class="provider-logo" />
        </div>
        <input
          v-model="unifiedStore.bizyairApiKey"
          type="password"
          :placeholder="t('user.bizyairApiKeyPlaceholder')"
          class="apikey-input-full"
          @blur="handleSaveBizyAirApiKey"
        />
        <div v-if="!hasApiKey" class="apikey-hint">
          {{ t('user.bizyairApiKeyHint') }}
        </div>
        <div v-else class="apikey-status">
          <component :is="IconComponents.CHECK" size="14px" />
          {{ t('user.bizyairApiKeyConfigured') }}
        </div>
      </div>
    </div>
  </UniversalModal>
</template>

<script setup lang="ts">
import UniversalModal from './UniversalModal.vue'
import { IconComponents } from '@/constants/iconComponents'
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'
import { computed } from 'vue'

const { t } = useAppI18n()
const unifiedStore = useUnifiedStore()

// 检查是否已配置 API Key
const hasApiKey = computed(() => {
  return unifiedStore.hasBizyAirApiKey()
})

// 定义props
const props = defineProps<{
  show: boolean
}>()

// 定义emits
const emit = defineEmits<{
  close: []
}>()

// 方法
function handleClose() {
  emit('close')
}

// 保存 BizyAir API Key
function handleSaveBizyAirApiKey() {
  const apiKey = unifiedStore.bizyairApiKey.trim()

  if (apiKey) {
    // 有内容则保存
    unifiedStore.saveBizyAirApiKey(apiKey)
  } else {
    // 为空则清除已保存的 key
    unifiedStore.clearBizyAirApiKey()
  }
}
</script>

<style scoped>
/* 通用Modal的样式已经包含在UniversalModal组件中 */
/* 这里只需要定义内容区域特有的样式 */
.provider-config-content {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.provider-section {
  width: 100%;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

.provider-logo {
  height: 20px;
  width: auto;
  object-fit: contain;
}

.apikey-input-full {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-small);
  font-size: var(--font-size-sm);
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  transition: border-color 0.2s ease;
  box-sizing: border-box;
}

.apikey-input-full:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.apikey-input-full::placeholder {
  color: var(--color-text-tertiary);
}

.apikey-hint {
  margin-top: var(--spacing-sm);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.apikey-status {
  margin-top: var(--spacing-sm);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  color: var(--color-success);
  font-size: var(--font-size-xs);
}
</style>
