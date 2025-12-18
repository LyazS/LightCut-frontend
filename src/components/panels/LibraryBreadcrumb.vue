<template>
  <div class="breadcrumb-container" v-if="breadcrumb.length > 0">
    <button class="back-button" @click="goBack" :disabled="!canGoBack" :title="t('media.goBack')">
      <component :is="IconComponents.ARROW_UP" size="16px" />
    </button>
    <n-scrollbar x-scrollable class="breadcrumb-scrollbar">
      <div class="breadcrumb">
        <span
          v-for="(dir, index) in breadcrumb"
          :key="dir.id"
          class="breadcrumb-item"
          @click="navigateToDir(dir.id)"
        >
          <component :is="IconComponents.HOME" v-if="index === 0" size="16px" />
          <span v-if="index > 0">{{ dir.name }}</span>
          <span v-if="index < breadcrumb.length - 1" class="breadcrumb-separator"> / </span>
        </span>
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NScrollbar } from 'naive-ui'
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'
import { IconComponents } from '@/constants/iconComponents'

const unifiedStore = useUnifiedStore()
const { t } = useAppI18n()

// 当前目录
const currentDir = computed(() => unifiedStore.currentDir)

// 面包屑路径
const breadcrumb = computed(() => {
  if (!currentDir.value) return []
  return unifiedStore.getBreadcrumb(currentDir.value.id)
})

// 导航到指定目录
function navigateToDir(dirId: string): void {
  unifiedStore.navigateToDir(dirId)
}

// 是否可以返回上一层
const canGoBack = computed(() => {
  return breadcrumb.value.length > 1
})

// 返回上一层
function goBack(): void {
  if (canGoBack.value && breadcrumb.value.length > 1) {
    const parentDir = breadcrumb.value[breadcrumb.value.length - 2]
    unifiedStore.navigateToDir(parentDir.id)
  }
}
</script>

<style scoped>
/* 面包屑导航容器样式 */
.breadcrumb-container {
  padding: var(--spacing-xs) var(--spacing-md);
  background-color: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border-primary);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

/* 面包屑滚动容器 */
.breadcrumb-scrollbar {
  flex: 1;
}

/* 面包屑导航样式 */
.breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  white-space: nowrap;
  padding: 2px 0;
}

.back-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--border-radius-small);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.back-button:hover:not(:disabled) {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.back-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: 0px;
  cursor: pointer;
  padding: 2px 2px;
  border-radius: var(--border-radius-small);
  transition: background-color var(--transition-fast);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.breadcrumb-item:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.breadcrumb-separator {
  color: var(--color-text-muted);
  margin: 0 2px;
}
</style>
