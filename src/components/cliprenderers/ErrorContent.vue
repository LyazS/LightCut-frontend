<!-- ErrorContentTemplate.vue -->
<template>
  <div class="clip-error-content" :class="{ selected: isSelected }">
    <!-- 错误内容 - 确保与clip-content大小一致 -->
    <div class="clip-error-message-container">
      <!-- 错误文本 -->
      <div class="clip-error-text">
        <span class="clip-error-icon">❌</span>
        <span class="clip-error-message">{{ errorMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ContentTemplateProps } from '@/core/types/clipRenderer'
import { getTimelineItemDisplayName } from '@/core/utils/clipUtils'

const props = defineProps<ContentTemplateProps>()

// 简化错误信息计算
const errorMessage = computed(() => {
  const name = getTimelineItemDisplayName(props.data)

  if (name.includes('http') || name.includes('网络')) {
    return '网络连接失败'
  }

  if (name.includes('文件') || name.includes('找不到')) {
    return '文件加载失败'
  }

  if (name.includes('格式') || name.includes('不支持')) {
    return '文件格式不支持'
  }

  if (name.includes('权限') || name.includes('访问')) {
    return '访问权限不足'
  }

  if (name.includes('超时') || name.includes('timeout')) {
    return '加载超时'
  }

  return '加载失败'
})
</script>

<style scoped>
.clip-error-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 4px 8px;
  background: rgba(255, 0, 0, 0.1);
  border: 1px solid rgba(255, 0, 0, 0.3);
  border-radius: var(--border-radius-medium);
}

.clip-error-message-container {
  text-align: center;
  width: 100%;
}

.clip-error-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 10px;
  color: #ff6b6b;
}

.clip-error-icon {
  font-size: 12px;
}

.clip-error-message {
  font-weight: 500;
}

/* 选中状态样式 */
.clip-error-content.selected {
  background: linear-gradient(135deg, var(--color-clip-selected), var(--color-clip-selected-dark));
}
</style>
