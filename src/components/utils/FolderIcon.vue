<template>
  <div class="folder-icon" :class="[iconClass, { 'character-mode': isCharacterFolder }]">
    <!-- 角色文件夹：根据状态显示不同内容 -->
    <template v-if="isCharacterFolder">
      <!-- 加载中状态：显示旋转加载动画 -->
      <component
        v-if="characterMediaStatus === 'loading'"
        :is="IconComponents.LOADING"
        :size="size"
        class="loading-spinner loading-color"
      />
      <!-- 就绪状态：显示缩略图 -->
      <img
        v-else-if="characterMediaStatus === 'ready' && characterThumbnailUrl"
        :src="characterThumbnailUrl"
        class="character-thumbnail"
        :alt="directory?.name || ''"
      />
      <!-- 错误状态：显示用户图标 -->
      <component
        v-else-if="characterMediaStatus === 'error'"
        :is="IconComponents.USER"
        :size="size"
        class="error-color"
      />
      <!-- 未知状态：显示默认图标 -->
      <component
        v-else
        :is="IconComponents.USER"
        :size="size"
        class="accent-color"
      />
    </template>
    <!-- 非角色文件夹：显示默认图标 -->
    <component
      v-else
      :is="currentIcon"
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
const {
  directory,
  isCharacterFolder,
  characterMediaStatus,
  characterThumbnailUrl,
} = useCharacter(props.folderId)

// 根据文件夹类型获取对应的图标
const currentIcon = computed(() => {
  const dir = directory.value
  if (!dir) return IconComponents.FOLDER
  return dir.type === DirectoryType.CHARACTER ? IconComponents.USER : IconComponents.FOLDER
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

/* 角色模式：圆形图标 */
.folder-icon.character-mode {
  border-radius: 50%;
}

/* 角色缩略图样式 */
.character-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

/* 旋转加载动画 */
.loading-spinner {
  animation: spin 1s linear infinite;
}

/* 颜色样式 */
.loading-color,
.accent-color {
  color: var(--color-accent-primary);
}

.error-color {
  color: var(--color-error);
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
