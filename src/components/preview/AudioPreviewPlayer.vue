<template>
  <div class="audio-preview-player">
    <!-- 音频播放器 -->
    <div class="audio-container">
      <div class="audio-icon">
        <component :is="IconComponents.MUSIC" size="64px" />
      </div>
      <audio
        ref="audioRef"
        class="audio-player"
        :src="audioUrl"
        controls
        autoplay
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @ended="onEnded"
      ></audio>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useAppI18n } from '@/core/composables/useI18n'
import type { AudioMediaItem, ReadyMediaItem } from '@/core'
import { IconComponents } from '@/constants/iconComponents'

interface Props {
  mediaItem: AudioMediaItem & ReadyMediaItem
}

const props = defineProps<Props>()

const { t } = useAppI18n()

const audioRef = ref<HTMLAudioElement>()
const audioUrl = ref<string>('')

// 从 BunnyMedia 获取原始文件
const mediaFile = computed<File | null>(() => {
  if (props.mediaItem.runtime.bunny?.bunnyMedia) {
    return props.mediaItem.runtime.bunny.bunnyMedia.getOriFile()
  }
  return null
})

// 创建 blob URL
onMounted(() => {
  if (mediaFile.value) {
    audioUrl.value = URL.createObjectURL(mediaFile.value)
    console.log('🎵 音频预览: 创建 blob URL', audioUrl.value)
  } else {
    console.error('❌ 音频预览: 无法获取媒体文件')
  }
})

// 清理 blob URL
onBeforeUnmount(() => {
  if (audioUrl.value && audioUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(audioUrl.value)
    console.log('🧹 音频预览: 释放 blob URL')
  }
})

// 音频加载完成
function onLoadedMetadata(): void {
  console.log('✅ 音频元数据加载完成')
}

// 时间更新
function onTimeUpdate(): void {
  // 可以在这里添加时间更新相关的逻辑
}

// 播放结束
function onEnded(): void {
  console.log('🎵 音频播放结束')
}
</script>

<style scoped>
.audio-preview-player {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--spacing-md);
}

.audio-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-primary);
  border-radius: var(--border-radius-medium);
  overflow: hidden;
  min-height: 300px;
  padding: var(--spacing-xl);
  gap: var(--spacing-lg);
}

.audio-icon {
  color: var(--color-accent-primary);
  opacity: 0.8;
}

.audio-player {
  width: 100%;
  max-width: 600px;
}
</style>
