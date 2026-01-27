<template>
  <div class="folder-icon" :class="iconClass">
    <!-- 角色文件夹：显示头像缩略图或用户图标 -->
    <template v-if="isCharacterFolder">
      <!-- 加载中：显示加载动画 -->
      <component
        v-if="characterMediaStatus === 'loading'"
        :is="IconComponents.LOADING"
        :size="size"
        class="loading-icon"
      />
      <!-- 有头像缩略图：显示头像 -->
      <img
        v-else-if="characterThumbnailUrl"
        :src="characterThumbnailUrl"
        :alt="directory?.name"
        class="character-thumbnail"
        :class="thumbnailClass"
      />
      <!-- 无头像缩略图：显示用户图标 -->
      <component
        v-else
        :is="IconComponents.USER"
        :size="size"
        class="accent-color"
      />
    </template>
    <!-- 非角色文件夹：显示文件夹图标 -->
    <component
      v-else
      :is="IconComponents.FOLDER"
      :size="size"
      class="accent-color"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IconComponents } from '@/constants/iconComponents'
import { DirectoryType } from '@/core/directory/types'
import { useCharacter } from '@/core/composables/useCharacter'

interface Props {
  folderId: string
  size?: string
  isListView?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: '48px',
  isListView: false,
})

// 使用 useCharacter composable
const { directory, isCharacterFolder, characterThumbnailUrl, characterMediaStatus } = useCharacter(computed(() => props.folderId))

// 容器类名
const iconClass = computed(() => {
  return props.isListView ? 'list-view' : 'icon-view'
})

// 缩略图类名
const thumbnailClass = computed(() => {
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

/* 角色头像缩略图样式 */
.character-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

/* 加载图标样式 */
.loading-icon {
  animation: spin 1s linear infinite;
  color: var(--color-accent-primary);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
