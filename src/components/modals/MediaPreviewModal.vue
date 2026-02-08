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

      <!-- 根据媒体类型显示对应的预览组件 -->
      <template v-else>
        <!-- 视频预览 -->
        <VideoPreviewPlayer
          v-if="readyVideoMediaItem"
          :media-item="readyVideoMediaItem"
        />

        <!-- 图片预览 -->
        <ImagePreviewViewer
          v-else-if="readyImageMediaItem"
          :media-item="readyImageMediaItem"
        />

        <!-- 音频预览 -->
        <AudioPreviewPlayer
          v-else-if="readyAudioMediaItem"
          :media-item="readyAudioMediaItem"
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
import { MediaItemQueries } from '@/core/mediaitem/queries'
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

// 使用类型守卫获取就绪的视频媒体项
const readyVideoMediaItem = computed(() => {
  return mediaItem.value && MediaItemQueries.isVideo(mediaItem.value) && MediaItemQueries.isReady(mediaItem.value)
    ? (mediaItem.value as VideoMediaItem & ReadyMediaItem)
    : null
})

// 使用类型守卫获取就绪的图片媒体项
const readyImageMediaItem = computed(() => {
  return mediaItem.value && MediaItemQueries.isImage(mediaItem.value) && MediaItemQueries.isReady(mediaItem.value)
    ? (mediaItem.value as ImageMediaItem & ReadyMediaItem)
    : null
})

// 使用类型守卫获取就绪的音频媒体项
const readyAudioMediaItem = computed(() => {
  return mediaItem.value && MediaItemQueries.isAudio(mediaItem.value) && MediaItemQueries.isReady(mediaItem.value)
    ? (mediaItem.value as AudioMediaItem & ReadyMediaItem)
    : null
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
</script>

<style scoped>
.media-preview-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--spacing-md);
  color: var(--color-text-secondary);
}

.preview-error p {
  font-size: var(--font-size-md);
  margin: 0;
}
</style>
