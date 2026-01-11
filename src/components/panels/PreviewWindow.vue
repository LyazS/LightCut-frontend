<template>
  <div class="preview-window">
    <!-- Bunny渲染器 -->
    <div class="renderer-container" @contextmenu="handleContextMenu">
      <BunnyRender />
    </div>

    <!-- 播放控制面板紧贴在预览窗口下方 -->
    <div class="controls-section">
      <!-- 时间显示 -->
      <div class="time-display">
        {{ framesToTimecodeCompact(unifiedStore.currentFrame) }}/{{
          framesToTimecodeCompact(
            unifiedStore.contentEndTimeFrames || unifiedStore.totalDurationFrames,
          )
        }}
      </div>
      <!-- 中间播放控制 -->
      <div class="center-controls">
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
      <!-- 右侧比例按钮 -->
      <button
        class="aspect-ratio-btn"
        @click="showResolutionModal = true"
        :title="t('editor.setVideoResolution')"
      >
        <span class="aspect-ratio-text">{{ currentResolutionText }}</span>
      </button>
    </div>

    <!-- 分辨率选择弹窗 -->
    <ResolutionModal
      :show="showResolutionModal"
      :current-resolution="currentResolution"
      @close="showResolutionModal = false"
      @confirm="handleResolutionConfirm"
    />

    <!-- 右键菜单 -->
    <ContextMenu v-model:show="showContextMenu" :options="contextMenuOptions">
      <template v-for="(item, index) in contextMenuItems" :key="index">
        <ContextMenuSeparator v-if="'type' in item && item.type === 'separator'" />
        <ContextMenuItem
          v-else-if="'label' in item && 'onClick' in item"
          :label="item.label"
          :disabled="item.disabled"
          @click="item.onClick"
        >
          <template #icon>
            <component :is="item.icon" size="16px" />
          </template>
        </ContextMenuItem>
      </template>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import BunnyRender from '@/components/panels/BunnyRender.vue'
import ResolutionModal from '@/components/modals/ResolutionModal.vue'
import HoverButton from '@/components/base/HoverButton.vue'
import { IconComponents, getPlaybackIcon } from '@/constants/iconComponents'
import { useUnifiedStore } from '@/core/unifiedStore'
import { framesToTimecodeCompact } from '@/core/utils/timeUtils'
import { useAppI18n } from '@/core/composables/useI18n'
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '@imengyu/vue3-context-menu'

const unifiedStore = useUnifiedStore()
const { t } = useAppI18n()

// 分辨率弹窗显示状态
const showResolutionModal = ref(false)

// 右键菜单状态
const showContextMenu = ref(false)
const contextMenuOptions = ref({
  x: 0,
  y: 0,
  theme: 'mac dark',
  zIndex: 1000,
})

// 菜单项类型定义
type MenuItem =
  | {
      label: string
      icon: any
      onClick?: () => void
      disabled?: boolean
    }
  | {
      type: 'separator'
    }

// 播放状态
const isPlaying = computed(() => unifiedStore.isPlaying)

// 统一播放控制接口
function togglePlayPause() {
  if (isPlaying.value) {
    unifiedStore.pause()
  } else {
    unifiedStore.play()
  }
}

function stop() {
  unifiedStore.stop()
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

// ==================== 右键菜单 ====================

// 右键菜单项配置
const contextMenuItems = computed((): MenuItem[] => {
  return [
    {
      label: t('editor.preview.downloadCurrentFrame'),
      icon: IconComponents.IMAGE_SMALL,
      onClick: captureCanvasFrame,
    },
  ]
})

// 右键菜单处理
function handleContextMenu(event: MouseEvent): void {
  event.preventDefault()

  contextMenuOptions.value.x = event.clientX
  contextMenuOptions.value.y = event.clientY
  showContextMenu.value = true
}

// ==================== 画布截帧功能 ====================

/**
 * 截取当前画布画面并下载
 */
async function captureCanvasFrame() {
  try {
    // 生成文件名（包含当前时间）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const currentTime = unifiedStore.formattedCurrentTime
    const filename = `screenshot-${timestamp}-at-${currentTime}.png`

    console.log('📸 开始截取画布画面...')
    await unifiedStore.captureCanvasFrame(filename)
    console.log('✅ 画布截帧成功')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ 画布截帧失败:', errorMessage)
  }
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

.controls-section {
  height: 50px;
  width: 100%;
  background-color: var(--color-bg-secondary);
  border-radius: var(--border-radius-large);
  display: flex;
  align-items: center;
  justify-content: space-between;
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
}

.center-controls {
  flex: 1;
  display: flex;
  justify-content: center;
  background-color: var(--color-bg-secondary);
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
