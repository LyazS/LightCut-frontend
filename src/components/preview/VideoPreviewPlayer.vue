<template>
  <div class="video-preview-player">
    <!-- 视频播放器 -->
    <div class="video-container">
      <video
        ref="videoRef"
        class="video-player"
        :src="videoUrl"
        controls
        autoplay
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @ended="onEnded"
      ></video>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import type { VideoMediaItem, ReadyMediaItem } from '@/core'

interface Props {
  mediaItem: VideoMediaItem & ReadyMediaItem
}

const props = defineProps<Props>()

const videoRef = ref<HTMLVideoElement>()
const videoUrl = ref<string>('')

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
    videoUrl.value = URL.createObjectURL(mediaFile.value)
    console.log('🎬 视频预览: 创建 blob URL', videoUrl.value)
  } else {
    console.error('❌ 视频预览: 无法获取媒体文件')
  }
})

// 清理 blob URL
onBeforeUnmount(() => {
  if (videoUrl.value && videoUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(videoUrl.value)
    console.log('🧹 视频预览: 释放 blob URL')
  }
})

// 视频加载完成
function onLoadedMetadata(): void {
  console.log('✅ 视频元数据加载完成')
}

// 时间更新
function onTimeUpdate(): void {
  // 可以在这里添加时间更新相关的逻辑
}

// 播放结束
function onEnded(): void {
  console.log('🎬 视频播放结束')
}
</script>

<style scoped>
.video-preview-player {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--spacing-md);
}

.video-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-primary);
  border-radius: var(--border-radius-medium);
  overflow: hidden;
  min-height: 300px;
}

.video-player {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
}
</style>
