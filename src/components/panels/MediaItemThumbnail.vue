<template>
  <n-tooltip
    v-if="showTooltip"
    :show-arrow="true"
    placement="right"
    :delay="300"
    trigger="hover"
  >
    <template #trigger>
      <div class="media-thumbnail">
        <!-- 等待状态 -->
        <template v-if="item?.mediaStatus === 'pending'">
          <div class="async-processing-display">
            <div class="processing-status pending">
              <div class="status-icon">
                <component :is="IconComponents.TIME" size="20px" spin />
              </div>
            </div>
          </div>
          <!-- 时长标签 -->
          <div v-if="item?.mediaType === 'video' || item?.mediaType === 'audio'" class="duration-badge">
            {{ t('media.badge.waiting') }}
          </div>
        </template>

        <!-- 异步处理中状态 -->
        <template v-else-if="item?.mediaStatus === 'asyncprocessing'">
          <div class="async-processing-display">
            <div class="processing-status processing">
              <div
                class="progress-circle"
                :style="{ '--progress': item.source.progress }"
              >
                <div class="progress-text">{{ item.source.progress.toFixed(2) }}%</div>
              </div>
            </div>
          </div>
          <!-- 时长标签 -->
          <div v-if="item?.mediaType === 'video' || item?.mediaType === 'audio'" class="duration-badge">
            {{ t('media.badge.processing') }}
          </div>
        </template>

        <!-- WebAV解析中状态 -->
        <template v-else-if="item?.mediaStatus === 'decoding'">
          <div class="thumbnail-placeholder">
            <div class="loading-spinner"></div>
          </div>
          <!-- 时长标签 -->
          <div v-if="item?.mediaType === 'video' || item?.mediaType === 'audio'" class="duration-badge">
            {{ t('media.badge.parsing') }}
          </div>
        </template>

        <!-- 错误状态 -->
        <template v-else-if="item?.mediaStatus === 'error'">
          <div class="local-error-display">
            <div class="status-icon">
              <component :is="IconComponents.WARNING" size="20px" />
            </div>
          </div>
          <!-- 时长标签 -->
          <div v-if="item?.mediaType === 'video' || item?.mediaType === 'audio'" class="duration-badge">
            {{ t('media.badge.failed') }}
          </div>
        </template>

        <!-- 已取消状态 -->
        <template v-else-if="item?.mediaStatus === 'cancelled'">
          <div class="local-error-display">
            <div class="status-icon">
              <component :is="IconComponents.CLOSE" size="20px" />
            </div>
          </div>
          <!-- 时长标签 -->
          <div v-if="item?.mediaType === 'video' || item?.mediaType === 'audio'" class="duration-badge">
            {{ t('media.badge.cancelled') }}
          </div>
        </template>

        <!-- 就绪状态：显示缩略图 -->
        <template v-else-if="item">
          <!-- WebAV生成的缩略图 -->
          <img
            v-if="item.runtime.bunny?.thumbnailUrl"
            :src="item.runtime.bunny.thumbnailUrl"
            class="thumbnail-image"
          />
          <!-- 音频类型显示音乐图标 -->
          <div v-else-if="item.mediaType === 'audio'" class="audio-icon-container">
            <component :is="IconComponents.MUSIC" size="48px" />
          </div>
          <!-- 缩略图生成中的占位符 -->
          <div v-else class="thumbnail-placeholder">
            <component :is="IconComponents.IMAGE_SMALL" size="20px" />
          </div>

          <!-- 右上角时长标签（视频和音频显示） -->
          <div v-if="item.mediaType === 'video' || item.mediaType === 'audio'" class="duration-badge">
            {{
              item.mediaStatus === 'ready' && item.duration ? formatDuration(item.duration) : t('media.badge.processing')
            }}
          </div>
        </template>

        <!-- 未知状态 -->
        <template v-else>
          <div class="thumbnail-placeholder">
            <component :is="IconComponents.QUESTION" size="20px" />
          </div>
        </template>
      </div>
    </template>
    
    <!-- 提示内容 -->
    <div class="tooltip-content">
      <!-- 素材名称 -->
      <div class="tooltip-title">
        📦 {{ item?.name || t('media.unknownMedia') }}
      </div>
      
      <!-- 状态信息 -->
      <div class="tooltip-status">
        <span>{{ t('media.tooltip.status') }}：</span>
        <component :is="statusIcon" size="14px" />
        <span>{{ statusText }}</span>
      </div>
      
      <!-- 详细信息 -->
      <div v-if="detailInfo.length > 0" class="tooltip-detail">
        <div v-for="(line, index) in detailInfo" :key="index" class="tooltip-detail-line">
          {{ line }}
        </div>
      </div>
      
      <!-- 提示文本 -->
      <div v-if="hintText" class="tooltip-hint">
        💡 {{ hintText }}
      </div>
    </div>
  </n-tooltip>
  
  <!-- 无提示的降级方案 -->
  <div v-else class="media-thumbnail">
    <div class="thumbnail-placeholder">
      <component :is="IconComponents.QUESTION" size="20px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NTooltip } from 'naive-ui'
import { useUnifiedStore } from '@/core/unifiedStore'
import { useAppI18n } from '@/core/composables/useI18n'
import { framesToTimecode } from '@/core/utils/timeUtils'
import { IconComponents } from '@/constants/iconComponents'

interface Props {
  mediaId: string
}

const props = defineProps<Props>()
const unifiedStore = useUnifiedStore()
const { t } = useAppI18n()

// 获取媒体项
const item = computed(() => unifiedStore.getMediaItem(props.mediaId))

// 格式化时长显示（使用时间码格式）
function formatDuration(frames: number): string {
  return framesToTimecode(frames)
}

// 状态图标
const statusIcon = computed(() => {
  if (!item.value) return IconComponents.QUESTION
  
  switch (item.value.mediaStatus) {
    case 'pending':
      return IconComponents.TIME
    case 'asyncprocessing':
      return IconComponents.LOADING
    case 'decoding':
      return IconComponents.SEARCH
    case 'error':
      return IconComponents.WARNING
    case 'cancelled':
      return IconComponents.CLOSE
    case 'ready':
      return IconComponents.CHECK
    default:
      return IconComponents.QUESTION
  }
})

// 状态文本
const statusText = computed(() => {
  if (!item.value) return t('media.unknown')
  
  switch (item.value.mediaStatus) {
    case 'pending':
      return t('media.tooltip.pending')
    case 'asyncprocessing':
      return `${t('media.tooltip.processing')}: ${item.value.source.progress.toFixed(2)}%`
    case 'decoding':
      return t('media.tooltip.webavDecoding')
    case 'error':
      return t('media.tooltip.error')
    case 'cancelled':
      return t('media.tooltip.cancelled')
    case 'ready':
      return t('media.tooltip.ready')
    default:
      return t('media.unknown')
  }
})

// 详细信息 - 返回字符串数组
const detailInfo = computed<string[]>(() => {
  if (!item.value) return []
  
  const status = item.value.mediaStatus
  const source = item.value.source
  const info: string[] = []
  
  // pending 状态：显示任务类型
  if (status === 'pending') {
    if (source.type === 'ai-generation') {
      info.push(`${t('media.tooltip.taskType')}: ${t('media.tooltip.aiGeneration')}`)
    } else if (source.type === 'user-selected') {
      info.push(`${t('media.tooltip.taskType')}: ${t('media.tooltip.localFile')}`)
    }
  }
  
  // asyncprocessing 状态：显示当前阶段（仅AI生成任务有此字段）
  if (status === 'asyncprocessing') {
    // 类型守卫：检查是否为AI生成数据源
    if ('currentStage' in source && source.currentStage) {
      info.push(`${t('media.tooltip.currentStage')}: ${source.currentStage}`)
    }
  }
  
  // decoding 状态：显示鼓励信息
  if (status === 'decoding') {
    info.push(t('media.tooltip.almostDone'))
  }
  
  // error 状态：显示错误详情
  if (status === 'error' && source.errorMessage) {
    info.push(`${t('media.tooltip.errorDetails')}: ${source.errorMessage}`)
  }
  
  // ready 状态：显示媒体信息
  if (status === 'ready') {
    // 媒体类型
    const typeLabel = item.value.mediaType === 'video'
      ? t('media.video')
      : item.value.mediaType === 'audio'
      ? t('media.audio')
      : item.value.mediaType === 'image'
      ? t('media.image')
      : t('media.unknown')
    info.push(`${t('media.tooltip.mediaType')}: ${typeLabel}`)
    
    // 时长（视频和音频）
    if ((item.value.mediaType === 'video' || item.value.mediaType === 'audio') && item.value.duration) {
      info.push(`${t('media.tooltip.duration')}: ${formatDuration(item.value.duration)}`)
    }
    
    // 分辨率（视频和图片）
    if ((item.value.mediaType === 'video' || item.value.mediaType === 'image') && item.value.runtime.bunny?.originalWidth) {
      const width = item.value.runtime.bunny.originalWidth
      const height = item.value.runtime.bunny.originalHeight
      info.push(`${t('media.tooltip.resolution')}: ${width}x${height}`)
    }
  }
  
  return info
})

// 提示文本（错误和取消状态显示）
const hintText = computed(() => {
  if (!item.value) return null
  
  const status = item.value.mediaStatus
  if (status === 'error' || status === 'cancelled') {
    return t('media.tooltip.retryHint')
  }
  
  return null
})

// 是否显示提示（所有状态都显示）
const showTooltip = computed(() => {
  return !!item.value
})
</script>

<style scoped>
.media-thumbnail {
  width: 100%;
  height: 100%;
  background-color: transparent;
  border-radius: var(--border-radius-small);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.thumbnail-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.1);
  color: var(--color-text-secondary);
}

.audio-icon-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.1);
  color: var(--color-primary);
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-top: 1px solid var(--color-text-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.duration-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  font-size: 9px;
  padding: 2px 4px;
  border-radius: 3px;
  z-index: 2;
  font-family: monospace;
  line-height: 1;
}

/* 异步处理素材样式 */
.async-processing-display {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-variant);
  border-radius: 8px;
}

.processing-status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.processing-status .status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.processing-status.pending .status-icon {
  color: var(--color-status-pending);
}

.processing-status.processing .status-icon {
  color: var(--color-status-processing);
}

.processing-status.error .status-icon {
  color: var(--color-status-error);
}

.progress-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    var(--color-status-processing) 0deg,
    var(--color-status-processing) calc(var(--progress, 0) * 3.6deg),
    var(--color-progress-background) calc(var(--progress, 0) * 3.6deg),
    var(--color-progress-background) 360deg
  );
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-circle::before {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  right: 3px;
  bottom: 3px;
  border-radius: 50%;
  background: var(--color-surface);
  z-index: 1;
}

.progress-text {
  position: relative;
  z-index: 2;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* 本地媒体项错误状态样式 */
.local-error-display {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-variant);
  border-radius: 8px;
}

.local-error-display .status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-status-error);
}
</style>


/* 提示内容样式 */
.tooltip-content {
  padding: 8px 12px;
  max-width: 300px;
  font-size: 13px;
  line-height: 1.6;
}

.tooltip-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--n-text-color);
  font-size: 14px;
}

.tooltip-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: var(--n-text-color);
}

.tooltip-detail {
  color: var(--n-text-color-2);
  font-size: 12px;
  margin-top: 4px;
}

.tooltip-detail-line {
  line-height: 1.5;
}

.tooltip-hint {
  color: var(--n-warning-color);
  font-size: 12px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--n-divider-color);
}