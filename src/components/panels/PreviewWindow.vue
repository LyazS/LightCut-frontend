<template>
  <div class="preview-window">
    <!-- 渲染器切换 -->
    <div class="renderer-container">
      <!-- WebAV渲染器 -->
      <WebAVRenderer v-show="useWebAVRenderer" />
      
      <!-- Bunny渲染器 -->
      <BunnyRender v-show="!useWebAVRenderer" />
    </div>

    <!-- 渲染器切换按钮 -->
    <div class="renderer-toggle">
      <button
        @click="toggleRenderer"
        class="toggle-btn"
        :title="`切换到 ${useWebAVRenderer ? 'Bunny' : 'WebAV'} 渲染器`"
      >
        {{ useWebAVRenderer ? 'WebAV' : 'Bunny' }}
      </button>
    </div>

    <!-- 播放控制面板紧贴在预览窗口下方 -->
    <div class="controls-section">
      <!-- 时间显示 -->
      <div class="time-display">
        {{ framesToTimecode(unifiedStore.currentFrame) }} /
        {{
          framesToTimecode(unifiedStore.contentEndTimeFrames || unifiedStore.totalDurationFrames)
        }}
      </div>
      <!-- 中间播放控制 -->
      <div class="center-controls">
        <UnifiedPlaybackControls />
      </div>
      <!-- 右侧比例按钮 -->
      <div class="right-controls">
        <button
          class="aspect-ratio-btn"
          @click="showResolutionModal = true"
          :title="t('editor.setVideoResolution')"
        >
          <span class="aspect-ratio-text">{{ currentResolutionText }}</span>
        </button>
      </div>
    </div>

    <!-- 分辨率选择弹窗 -->
    <ResolutionModal
      :show="showResolutionModal"
      :current-resolution="currentResolution"
      @close="showResolutionModal = false"
      @confirm="handleResolutionConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import WebAVRenderer from '@/components/panels/WebAVRenderer.vue'
import BunnyRender from '@/components/panels/BunnyRender.vue'
import ResolutionModal from '@/components/modals/ResolutionModal.vue'
import UnifiedPlaybackControls from '@/components/timeline/UnifiedPlaybackControls.vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { framesToTimecode } from '@/core/utils/timeUtils'
import { useAppI18n } from '@/core/composables/useI18n'

const unifiedStore = useUnifiedStore()
const { t } = useAppI18n()

// 分辨率弹窗显示状态
const showResolutionModal = ref(false)

// 渲染器切换状态
const useWebAVRenderer = ref(false)

// 切换渲染器
const toggleRenderer = () => {
  useWebAVRenderer.value = !useWebAVRenderer.value
  console.log(`切换到 ${useWebAVRenderer.value ? 'WebAV' : 'Bunny'} 渲染器`)
}

// 从videoStore获取当前分辨率，而不是使用硬编码的默认值
const currentResolution = computed(() => {
  const resolution = unifiedStore.videoResolution
  // 根据分辨率判断类别
  const aspectRatio = resolution.width / resolution.height
  let category = t('editor.landscape')
  if (aspectRatio < 1) {
    category = t('editor.portrait')
  } else if (Math.abs(aspectRatio - 1) < 0.1) {
    category = t('editor.square')
  }

  return {
    name: resolution.name,
    width: resolution.width,
    height: resolution.height,
    aspectRatio: resolution.aspectRatio,
    category: category,
  }
})

const currentResolutionText = computed(() => {
  return `${currentResolution.value.aspectRatio}`
})

function handleResolutionConfirm(resolution: {
  name: string
  width: number
  height: number
  aspectRatio: string
}) {
  // 更新videoStore中的分辨率
  unifiedStore.setVideoResolution(resolution)
  console.log('确认选择分辨率:', resolution)
}
</script>

<style scoped>
.preview-window {
  width: 100%;
  flex: 1;
  background-color: var(--color-bg-secondary);
  border-radius: var(--border-radius-xlarge);
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  border: 2px solid var(--color-bg-secondary);
  box-sizing: border-box;
  min-width: 150px;
  min-height: 100px;
}

.renderer-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.renderer-toggle {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
}

.toggle-btn {
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: var(--border-radius-medium);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  backdrop-filter: blur(4px);
}

.toggle-btn:hover {
  background-color: rgba(0, 0, 0, 0.9);
  transform: translateY(-1px);
}

.controls-section {
  height: 50px;
  width: 100%;
  background-color: var(--color-bg-secondary);
  border-radius: var(--border-radius-large);
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-md);
  flex-shrink: 0;
  min-width: 200px;
  overflow: hidden;
}

.time-display {
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  font-family: monospace;
  flex-shrink: 0;
  min-width: 80px;
}

.center-controls {
  flex: 1;
  display: flex;
  justify-content: center;
  background-color: var(--color-bg-secondary);
}

.right-controls {
  min-width: 80px;
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--spacing-xs);
}

.aspect-ratio-btn {
  background: none;
  border: 1px solid var(--color-border-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--border-radius-medium);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  transition: all var(--transition-fast);
}

.aspect-ratio-btn:hover {
  background-color: var(--color-bg-quaternary);
  border-color: var(--color-border-secondary);
  color: var(--color-text-primary);
}

.aspect-ratio-text {
  font-family: monospace;
}
</style>
