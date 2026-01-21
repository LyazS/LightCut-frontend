<template>
  <UniversalModal
    :show="show"
    :showHeader="false"
    width="75vw"
    height="75vh"
    :closable="true"
    :mask-closable="true"
    :esc-closable="true"
    :show-footer="false"
    @update:show="handleUpdateShow"
    @close="handleClose"
  >
    <div class="media-preview-content">
      <!-- 媒体状态检查 -->
      <div v-if="!mediaItem" class="preview-error">
        <component :is="IconComponents.WARNING" size="48px" />
        <p>{{ t('media.mediaNotFound') }}</p>
      </div>

      <!-- 非就绪状态提示 -->
      <div v-else-if="mediaItem.mediaStatus !== 'ready'" class="preview-status">
        <component :is="getStatusIcon()" size="48px" />
        <p>{{ getStatusText() }}</p>
      </div>

      <!-- 根据媒体类型显示对应的预览组件 -->
      <template v-else>
        <!-- 视频预览 -->
        <VideoPreviewPlayer
          v-if="mediaItem.mediaType === 'video' && mediaItem.mediaStatus === 'ready'"
          :media-item="mediaItem as VideoMediaItem & ReadyMediaItem"
        />

        <!-- 图片预览 -->
        <ImagePreviewViewer
          v-else-if="mediaItem.mediaType === 'image' && mediaItem.mediaStatus === 'ready'"
          :media-item="mediaItem as ImageMediaItem & ReadyMediaItem"
        />

        <!-- 音频预览 -->
        <AudioPreviewPlayer
          v-else-if="mediaItem.mediaType === 'audio' && mediaItem.mediaStatus === 'ready'"
          :media-item="mediaItem as AudioMediaItem & ReadyMediaItem"
        />

        <!-- 不支持的类型 -->
        <div v-else class="preview-error">
          <component :is="IconComponents.WARNING" size="48px" />
          <p>{{ t('media.unsupportedType') }}</p>
        </div>
      </template>
    </div>
  </UniversalModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'
import type {
  UnifiedMediaItemData,
  VideoMediaItem,
  ImageMediaItem,
  AudioMediaItem,
  ReadyMediaItem,
} from '@/core'
import { IconComponents } from '@/constants/iconComponents'
import UniversalModal from './UniversalModal.vue'
import VideoPreviewPlayer from '../preview/VideoPreviewPlayer.vue'
import ImagePreviewViewer from '../preview/ImagePreviewViewer.vue'
import AudioPreviewPlayer from '../preview/AudioPreviewPlayer.vue'

interface Props {
  show: boolean
  mediaItemId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  close: []
}>()

const { t } = useAppI18n()
const unifiedStore = useUnifiedStore()

// 获取媒体项数据
const mediaItem = computed<UnifiedMediaItemData | undefined>(() => {
  return unifiedStore.getMediaItem(props.mediaItemId)
})

// 处理显示状态更新
function handleUpdateShow(value: boolean): void {
  emit('update:show', value)
}

// 处理关闭
function handleClose(): void {
  emit('close')
  emit('update:show', false)
}

// 获取状态图标
function getStatusIcon() {
  if (!mediaItem.value) return IconComponents.WARNING

  switch (mediaItem.value.mediaStatus) {
    case 'pending':
      return IconComponents.LOADING
    case 'asyncprocessing':
      return IconComponents.LOADING
    case 'decoding':
      return IconComponents.LOADING
    case 'error':
      return IconComponents.ERROR
    case 'cancelled':
      return IconComponents.CLOSE
    case 'missing':
      return IconComponents.WARNING
    default:
      return IconComponents.WARNING
  }
}

// 获取状态文本
function getStatusText() {
  if (!mediaItem.value) return t('media.mediaNotFound')

  switch (mediaItem.value.mediaStatus) {
    case 'pending':
      return t('media.statusPending')
    case 'asyncprocessing':
      return t('media.statusProcessing')
    case 'decoding':
      return t('media.statusDecoding')
    case 'error':
      return t('media.statusError')
    case 'cancelled':
      return t('media.statusCancelled')
    case 'missing':
      return t('media.statusMissing')
    default:
      return t('media.statusUnknown')
  }
}
</script>

<style scoped>
.media-preview-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.preview-error,
.preview-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--spacing-md);
  color: var(--color-text-secondary);
}

.preview-error p,
.preview-status p {
  font-size: var(--font-size-md);
  margin: 0;
}
</style>
