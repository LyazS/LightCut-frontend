<!-- LoadingContentTemplate.vue -->
<template>
  <div class="clip-loading-content" :class="{ selected: isSelected }">
    <!-- 普通加载内容 -->
    <div class="clip-normal-loading-content">
      <!-- 加载文本 -->
      <div class="clip-loading-text">
        <div class="clip-loading-title">加载中</div>
        <div class="clip-loading-subtitle">{{ loadingSubtitle }}</div>
      </div>
    </div>

    <!-- 进度条（如果有进度信息） -->
    <div v-if="progressInfo.hasProgress" class="clip-loading-progress-bar">
      <div
        class="clip-progress-fill"
        :style="{
          width: `${progressInfo.percent}%`,
          transition: 'width 0.3s ease',
        }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ContentTemplateProps } from '@/core/types/clipRenderer'
import { getTimelineItemDisplayName } from '@/core/utils/clipUtils'
import { useUnifiedStore } from '@/core/unifiedStore'

const props = defineProps<ContentTemplateProps>()

const unifiedStore = useUnifiedStore()

// 计算属性
const loadingSubtitle = computed(() => {
  const name = getTimelineItemDisplayName(props.data)
  return name.length > 15 ? name.substring(0, 15) + '...' : name
})

// 进度信息计算
const progressInfo = computed(() => {
  // 从媒体项目获取实际进度数据
  const mediaItem = unifiedStore.getMediaItem(props.data.mediaItemId)
  if (!mediaItem || !mediaItem.source) {
    return {
      hasProgress: false,
      percent: 0,
    }
  }

  const source = mediaItem.source

  // 使用基础进度值
  return {
    hasProgress: source.progress > 0,
    percent: source.progress,
  }
})
</script>

<style scoped>
.clip-loading-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 4px 8px;
  animation: clip-loading-pulse 2s infinite;
  border-radius: var(--border-radius-medium);
}

.clip-normal-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.clip-loading-text {
  text-align: center;
}

.clip-loading-title {
  font-size: 11px;
  font-weight: bold;
  color: white;
  margin-bottom: 2px;
}

.clip-loading-subtitle {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.8);
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clip-loading-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.2);
}

.clip-progress-fill {
  height: 100%;
  background: var(--clip-color-loading-progress);
  transition: width 0.3s ease;
}

@keyframes clip-loading-pulse {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.8;
  }
  100% {
    opacity: 0.6;
  }
}

/* 选中状态样式 */
.clip-loading-content.selected {
  background: linear-gradient(135deg, var(--color-clip-selected), var(--color-clip-selected-dark));
}
</style>
