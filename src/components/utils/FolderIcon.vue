<template>
  <div class="folder-icon" :class="iconClass">
    <component :is="IconComponents.FOLDER" :size="size" class="accent-color" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IconComponents } from '@/constants/iconComponents'

interface Props {
  size?: string
  isListView?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: '48px',
  isListView: false,
})

// 容器类名
const iconClass = computed(() => {
  return props.isListView ? 'list-view' : 'icon-view'
})
</script>

<style scoped>
.folder-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
}

/* 图标视图样式 */
.folder-icon.icon-view {
  width: 100%;
  height: 100%;
  background-color: transparent;
}

/* 列表视图样式 */
.folder-icon.list-view {
  width: 32px;
  height: 32px;
  background-color: transparent;
}

/* 颜色样式 */
.accent-color {
  color: var(--color-accent-primary);
}
</style>
