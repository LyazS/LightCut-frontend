<template>
  <div class="playback-controls">
    <!-- 播放控制按钮 -->
    <div class="control-buttons">
      <HoverButton
        variant="primary"
        @click="togglePlayPause"
        :title="isPlaying ? t('common.pause') : t('common.play')"
      >
        <template #icon>
          <component :is="getPlaybackIcon(isPlaying)" size="16px" />
        </template>
      </HoverButton>

      <HoverButton @click="stop" :title="t('common.stop')">
        <template #icon>
          <component :is="IconComponents.STOP" size="16px" />
        </template>
      </HoverButton>
    </div>

    <!-- 播放速度控制 -->
    <div class="speed-control">
      <n-dropdown trigger="click" :options="speedDropdownOptions" @select="handleSpeedSelect">
        <HoverButton :title="t('common.playbackSpeed')" iconPosition="after">
          {{ playbackRate }}x
          <template #icon>
            <component :is="IconComponents.DROPDOWN" size="14px" class="dropdown-arrow" />
          </template>
        </HoverButton>
      </n-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NDropdown } from 'naive-ui'
import { useUnifiedStore } from '@/core/unifiedStore'
import { usePlaybackControls } from '@/core/composables'
import { useAppI18n } from '@/core/composables/useI18n'
import HoverButton from '@/components/base/HoverButton.vue'
import { IconComponents, getPlaybackIcon } from '@/constants/iconComponents'

const unifiedStore = useUnifiedStore()
const { safePlaybackOperation, restartPlayback } = usePlaybackControls()
const { t } = useAppI18n()

const isPlaying = computed(() => unifiedStore.isPlaying)
const playbackRate = computed(() => unifiedStore.playbackRate)

// WebAV作为播放状态的主控
function togglePlayPause() {
  safePlaybackOperation(
    () => {
      if (isPlaying.value) {
        // 通过WebAV暂停，WebAV会触发事件更新store状态
        unifiedStore.webAVPause()
      } else {
        // 通过WebAV播放，WebAV会触发事件更新store状态
        unifiedStore.webAVPlay()
      }
    },
    t('common.play') + '/' + t('common.pause') + t('common.toggle'),
  )
}

function stop() {
  safePlaybackOperation(
    () => {
      // 暂停播放并跳转到开始位置
      unifiedStore.webAVPause()
      // 只通过WebAV设置时间，WebAV会触发timeupdate事件更新Store
      unifiedStore.webAVSeekTo(0)
    },
    t('common.stop') + t('common.playback'),
  )
}

const speedOptions = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: '1x' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
  { value: 4, label: '4x' },
  { value: 5, label: '5x' },
]

// 转换为 n-dropdown 的选项格式
const speedDropdownOptions = computed(() =>
  speedOptions.map((option) => ({
    label: option.label,
    key: option.value,
  })),
)

function handleSpeedSelect(key: number) {
  // 更新store中的播放速度
  unifiedStore.setPlaybackRate(key)

  // 如果正在播放，重新开始播放以应用新的播放速度
  restartPlayback()
}
</script>

<style scoped>
.playback-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: 0 var(--spacing-md);
  background-color: var(--color-bg-secondary);
  border-radius: var(--border-radius-large);
  height: 100%;
  min-height: 50px;
  min-width: 200px;
  overflow: hidden;
  justify-content: center;
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.speed-control {
  margin-left: var(--spacing-md);
  position: relative;
}

.dropdown-arrow {
  opacity: 0.7;
  transition: transform 0.2s ease;
}

.speed-toggle-button.active .dropdown-arrow {
  transform: rotate(180deg);
}

/* n-dropdown 使用 Naive UI 的默认样式 */

/* 响应式设计 */
@media (max-width: 768px) {
  .playback-controls {
    min-width: 150px;
    gap: var(--spacing-sm);
    padding: 0 var(--spacing-sm);
  }

  .speed-control {
    margin-left: var(--spacing-sm);
  }

  .speed-control select {
    font-size: var(--font-size-xs);
    padding: var(--spacing-xs);
  }
}
</style>
