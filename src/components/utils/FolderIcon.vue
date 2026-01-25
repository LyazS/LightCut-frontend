<template>
  <div class="folder-icon" :class="[iconClass, { 'character-mode': !!characterThumbnailUrl }]">
    <!-- 角色文件夹：如果有可用的缩略图，显示缩略图 -->
    <template v-if="characterThumbnailUrl">
      <img :src="characterThumbnailUrl" class="character-thumbnail" :alt="directory?.name || ''" />
    </template>
    <!-- 否则显示默认图标 -->
    <component v-else :is="currentIcon" :size="size" style="color: var(--color-accent-primary)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { IconComponents } from '@/constants/iconComponents'
import { DirectoryType, type CharacterDirectory } from '@/core/directory/types'
import { UnifiedMediaItemQueries } from '@/core/mediaitem/queries'

interface Props {
  folderId: string
  size?: string
  isListView?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: '48px',
  isListView: false,
})

const unifiedStore = useUnifiedStore()

// 获取目录对象
const directory = computed(() => unifiedStore.getDirectory(props.folderId))

// 获取角色缩略图 URL（单个计算属性处理所有逻辑）
const characterThumbnailUrl = computed(() => {
  const dir = directory.value
  if (!dir || dir.type !== DirectoryType.CHARACTER) return undefined

  const charDir = dir as CharacterDirectory
  const portraitMediaId = charDir.character?.portraitMediaId
  if (!portraitMediaId) return undefined

  const mediaItem = unifiedStore.getMediaItem(portraitMediaId)
  if (!mediaItem || !UnifiedMediaItemQueries.isReady(mediaItem)) {
    return undefined
  }

  return mediaItem.runtime.bunny?.thumbnailUrl
})

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
</style>
