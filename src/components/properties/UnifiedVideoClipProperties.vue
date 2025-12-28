<template>
  <div class="video-clip-properties">
    <!-- 基本信息 -->
    <div class="property-section">
      <h4>{{ t('properties.basic.basicInfo') }}</h4>
      <div class="property-item">
        <label>{{ t('properties.basic.name') }}</label>
        <input :value="clipName" readonly class="property-input" />
      </div>
      <!-- 分辨率显示 -->
      <div class="property-item">
        <label>{{ t('properties.basic.resolution') }}</label>
        <div class="resolution-display">
          {{ currentResolution.width }} × {{ currentResolution.height }}
        </div>
      </div>
    </div>

    <!-- 播放设置 - 视频和图片都显示 -->
    <div
      v-if="selectedTimelineItem && hasVisualProperties(selectedTimelineItem)"
      class="property-section"
    >
      <h4>{{ t('properties.playback.playbackSettings') }}</h4>

      <!-- 精确时长控制 -->
      <div class="property-item">
        <label>{{ t('properties.basic.targetDuration') }}</label>
        <TimecodeInput
          :model-value="timelineDurationFrames"
          @update:model-value="updateTargetDurationFrames"
          @error="handleTimecodeError"
          :placeholder="t('properties.timecodes.timecodeFormat')"
        />
      </div>

      <!-- 倍速控制 - 仅对视频显示 -->
      <div
        v-if="selectedTimelineItem && isVideoTimelineItem(selectedTimelineItem)"
        class="property-item"
      >
        <label>{{ t('properties.playback.speed') }}</label>
        <div class="speed-controls">
          <!-- 分段倍速滑块 -->
          <SliderInput
            :model-value="normalizedSpeed"
            @input="updateNormalizedSpeed"
            :min="0"
            :max="100"
            :step="1"
            slider-class="segmented-speed-slider"
            :segments="speedSliderSegments"
          />
          <NumberInput
            :model-value="speedInputValue"
            @change="updateSpeedFromInput"
            :min="0.1"
            :max="100"
            :step="0.1"
            :precision="1"
            :show-controls="false"
            :placeholder="t('properties.placeholders.speed')"
          />
        </div>
      </div>

      <!-- 音量控制 - 仅对视频显示 -->
      <div
        v-if="selectedTimelineItem && isVideoTimelineItem(selectedTimelineItem)"
        class="property-item"
      >
        <label>{{ t('properties.playback.volume') }}</label>
        <div class="volume-controls">
          <SliderInput
            :model-value="volume"
            @input="updateVolume"
            :min="0"
            :max="1"
            :step="0.01"
            slider-class="volume-slider"
          />
          <NumberInput
            :model-value="volume"
            @change="updateVolume"
            :min="0"
            :max="1"
            :step="0.01"
            :precision="2"
            :show-controls="false"
            :placeholder="t('properties.placeholders.volume')"
          />
          <button
            @click="toggleMute"
            class="mute-btn"
            :title="
              isMuted ? t('properties.playback.unmuteTitle') : t('properties.playback.muteTitle')
            "
          >
            <component :is="getMuteIcon(isMuted)" size="14px" />
          </button>
        </div>
      </div>
    </div>

    <!-- 关键帧控制 -->
    <UnifiedKeyframeControls
      :keyframe-button-state="unifiedKeyframeButtonState"
      :can-operate-keyframes="canOperateUnifiedKeyframes"
      :has-previous-keyframe="hasUnifiedPreviousKeyframe"
      :has-next-keyframe="hasUnifiedNextKeyframe"
      :keyframe-tooltip="getUnifiedKeyframeTooltip()"
      :show-debug-button="true"
      @toggle-keyframe="toggleUnifiedKeyframe"
      @go-to-previous="goToPreviousUnifiedKeyframe"
      @go-to-next="goToNextUnifiedKeyframe"
      @debug-keyframes="debugUnifiedKeyframes"
    />

    <!-- 变换控制 -->
    <UnifiedTransformControls
      :transform-x="transformX"
      :transform-y="transformY"
      :scale-x="scaleX"
      :scale-y="scaleY"
      :rotation="rotation"
      :opacity="opacity"
      :proportional-scale="proportionalScale"
      :uniform-scale="uniformScale"
      :element-width="elementWidth"
      :element-height="elementHeight"
      :can-operate-transforms="canOperateTransforms"
      :position-limits="{
        minX: -unifiedStore.videoResolution.width,
        maxX: unifiedStore.videoResolution.width,
        minY: -unifiedStore.videoResolution.height,
        maxY: unifiedStore.videoResolution.height,
      }"
      @update-transform="updateTransform"
      @toggle-proportional-scale="toggleProportionalScale"
      @update-uniform-scale="updateUniformScale"
      @set-scale-x="setScaleX"
      @set-scale-y="setScaleY"
      @set-rotation="setRotation"
      @set-opacity="setOpacity"
      @align-horizontal="alignHorizontal"
      @align-vertical="alignVertical"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'
import {
  isVideoTimelineItem,
  isImageTimelineItem,
  hasVisualProperties,
  hasAudioProperties,
} from '@/core/timelineitem/queries'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import { useUnifiedKeyframeTransformControls } from '@/core/composables'
import { getMuteIcon } from '@/constants/iconComponents'
import NumberInput from '@/components/base/NumberInput.vue'
import SliderInput from '@/components/base/SliderInput.vue'
import TimecodeInput from '@/components/base/TimecodeInput.vue'
import UnifiedKeyframeControls from './UnifiedKeyframeControls.vue'
import UnifiedTransformControls from './UnifiedTransformControls.vue'

interface Props {
  selectedTimelineItem: UnifiedTimelineItemData | null
  currentFrame: number
}

const props = defineProps<Props>()

const { t } = useAppI18n()
const unifiedStore = useUnifiedStore()

// 关键帧动画和变换控制器
const {
  // 关键帧状态
  unifiedKeyframeButtonState,
  canOperateUnifiedKeyframes,
  hasUnifiedPreviousKeyframe,
  hasUnifiedNextKeyframe,

  // 变换操作状态
  canOperateTransforms,

  // 变换属性
  transformX,
  transformY,
  scaleX,
  scaleY,
  rotation,
  opacity,
  proportionalScale,
  uniformScale,
  elementWidth,
  elementHeight,

  // 关键帧控制方法
  toggleUnifiedKeyframe,
  goToPreviousUnifiedKeyframe,
  goToNextUnifiedKeyframe,
  getUnifiedKeyframeTooltip,
  debugUnifiedKeyframes,

  // 变换更新方法
  updateTransform,

  // 缩放控制方法
  toggleProportionalScale,
  updateUniformScale,
  setScaleX,
  setScaleY,

  // 旋转和透明度控制方法
  setRotation,
  setOpacity,

  // 对齐控制方法
  alignHorizontal,
  alignVertical,
} = useUnifiedKeyframeTransformControls({
  selectedTimelineItem: computed(() => props.selectedTimelineItem),
  currentFrame: computed(() => props.currentFrame),
})

// 选中项目对应的素材
const selectedMediaItem = computed(() => {
  if (!props.selectedTimelineItem) return null
  return unifiedStore.getMediaItem(props.selectedTimelineItem.mediaItemId) || null
})

// 时间轴时长（帧数）
const timelineDurationFrames = computed(() => {
  if (!props.selectedTimelineItem) return 0
  const timeRange = props.selectedTimelineItem.timeRange
  // 确保返回整数帧数，避免浮点数精度问题
  return Math.round(timeRange.timelineEndTime - timeRange.timelineStartTime)
})

// 倍速分段配置
const speedSegments = [
  { min: 0.1, max: 1, normalizedStart: 0, normalizedEnd: 20 }, // 0-20%: 0.1-1x
  { min: 1, max: 2, normalizedStart: 20, normalizedEnd: 40 }, // 20-40%: 1-2x
  { min: 2, max: 5, normalizedStart: 40, normalizedEnd: 60 }, // 40-60%: 2-5x
  { min: 5, max: 10, normalizedStart: 60, normalizedEnd: 80 }, // 60-80%: 5-10x
  { min: 10, max: 100, normalizedStart: 80, normalizedEnd: 100 }, // 80-100%: 10-100x
]

// 分辨率相关 - 显示当前选中视频缩放后的分辨率
const currentResolution = computed(() => {
  if (!props.selectedTimelineItem) {
    return { width: 0, height: 0 }
  }
  // 直接使用TimelineItem中的width/height属性，这是缩放后的实际尺寸（类型安全版本）
  if (!hasVisualProperties(props.selectedTimelineItem)) {
    return { width: 0, height: 0 }
  }

  // 类型安全的配置访问 - 使用类型守卫确保属性存在
  const config = props.selectedTimelineItem.config
  return {
    width: Math.round(config.width),
    height: Math.round(config.height),
  }
})

// 其他响应式属性
const clipName = computed(() => selectedMediaItem.value?.name || '')

const playbackRate = computed(() => {
  if (!props.selectedTimelineItem) return 1

  // 图片类型没有播放速度概念，返回1
  if (isImageTimelineItem(props.selectedTimelineItem)) {
    return 1
  }

  // 对于视频类型，从timeRange计算播放速度以确保响应性
  if (isVideoTimelineItem(props.selectedTimelineItem)) {
    const timeRange = props.selectedTimelineItem.timeRange
    const clipDurationFrames = timeRange.clipEndTime - timeRange.clipStartTime // 素材内部要播放的帧数
    const timelineDurationFrames = timeRange.timelineEndTime - timeRange.timelineStartTime // 在时间轴上占用的帧数

    if (clipDurationFrames > 0 && timelineDurationFrames > 0) {
      // playbackRate = 素材内部时长 / 时间轴时长
      let playbackRate = clipDurationFrames / timelineDurationFrames

      // 修正浮点数精度问题，避免出现1.00000001这样的值
      // 如果非常接近整数，则四舍五入到最近的0.1
      const rounded = Math.round(playbackRate * 10) / 10
      if (Math.abs(playbackRate - rounded) < 0.001) {
        playbackRate = rounded
      }

      return playbackRate
    }
  }

  return 1
})

const normalizedSpeed = computed(() => {
  return speedToNormalized(playbackRate.value)
})

const speedInputValue = computed(() => playbackRate.value)

// 倍速滑块分段标记（用于SliderInput组件）
const speedSliderSegments = [
  { position: 20, label: '1x' },
  { position: 40, label: '2x' },
  { position: 60, label: '5x' },
  { position: 80, label: '10x' },
]

// 音量相关 - 直接从TimelineItem读取，这是响应式的
const volume = computed(() => {
  if (!props.selectedTimelineItem || !isVideoTimelineItem(props.selectedTimelineItem)) return 1
  // 确保 volume 和 isMuted 都有默认值（类型安全版本）
  if (!hasAudioProperties(props.selectedTimelineItem)) return 1

  // 类型安全的配置访问
  const config = props.selectedTimelineItem.config
  const itemVolume = config.volume ?? 1
  const itemMuted = config.isMuted ?? false
  // 静音时显示0，否则显示实际音量
  return itemMuted ? 0 : itemVolume
})

const isMuted = computed(() => {
  if (!props.selectedTimelineItem || !hasAudioProperties(props.selectedTimelineItem)) return false

  // 类型安全的配置访问
  const config = props.selectedTimelineItem.config
  return config.isMuted ?? false
})

// 更新播放速度（仅对视频有效）- 使用带历史记录的方法
const updatePlaybackRate = async (newRate?: number) => {
  if (props.selectedTimelineItem && isVideoTimelineItem(props.selectedTimelineItem)) {
    const rate = newRate || playbackRate.value

    // 使用带历史记录的变换属性更新方法
    await unifiedStore.updateTimelineItemTransformWithHistory(props.selectedTimelineItem.id, {
      playbackRate: rate,
    })
    console.log('✅ 倍速更新成功')
  }
}

// 处理时间码错误
const handleTimecodeError = (errorMessage: string) => {
  unifiedStore.messageError(errorMessage)
}

// 更新目标时长（帧数版本）
const updateTargetDurationFrames = async (newDurationFrames: number) => {
  throw new Error('TODO')
}

// 更新归一化速度
const updateNormalizedSpeed = (newNormalizedSpeed: number) => {
  const actualSpeed = normalizedToSpeed(newNormalizedSpeed)
  updatePlaybackRate(actualSpeed)
}

// 从输入框更新倍速
const updateSpeedFromInput = (newSpeed: number) => {
  if (newSpeed && newSpeed > 0) {
    // 确保倍速在合理范围内
    const clampedSpeed = Math.max(0.1, Math.min(100, newSpeed))
    updatePlaybackRate(clampedSpeed)
  }
}

// 更新音量
const updateVolume = async (newVolume: number) => {
  if (!props.selectedTimelineItem || !isVideoTimelineItem(props.selectedTimelineItem)) return

  const clampedVolume = Math.max(0, Math.min(1, newVolume))

  // 确保属性存在，如果不存在则初始化（类型安全版本）
  if (!hasAudioProperties(props.selectedTimelineItem)) return

  const config = props.selectedTimelineItem.config

  // 类型安全的属性初始化和访问
  if (config.volume === undefined) {
    config.volume = 1
  }
  if (config.isMuted === undefined) {
    config.isMuted = false
  }

  await unifiedStore.updateTimelineItemTransformWithHistory(props.selectedTimelineItem.id, {
    volume: clampedVolume,
    isMuted: false,
  })

  console.log('✅ 音量更新成功:', clampedVolume)
}

// 切换静音状态（类型安全版本）
const toggleMute = async () => {
  if (!props.selectedTimelineItem || !hasAudioProperties(props.selectedTimelineItem)) return

  const config = props.selectedTimelineItem.config

  // 类型安全的属性访问和初始化
  if (config.volume === undefined) {
    config.volume = 1
  }
  if (config.isMuted === undefined) {
    config.isMuted = false
  }

  const newMutedState = !config.isMuted

  // 使用历史记录系统切换静音状态
  await unifiedStore.updateTimelineItemTransformWithHistory(props.selectedTimelineItem.id, {
    isMuted: newMutedState,
  })

  console.log(
    '✅ 静音状态切换:',
    newMutedState ? t('properties.playback.silenced') : t('properties.playback.audible'),
    t('properties.playback.volumeMaintained') + ':',
    config.volume,
  )
}

// 将归一化值(0-100)转换为实际播放速度
const normalizedToSpeed = (normalized: number) => {
  // 找到对应的段
  for (const segment of speedSegments) {
    if (normalized >= segment.normalizedStart && normalized <= segment.normalizedEnd) {
      // 在段内进行线性插值
      const segmentProgress =
        (normalized - segment.normalizedStart) / (segment.normalizedEnd - segment.normalizedStart)
      return segment.min + segmentProgress * (segment.max - segment.min)
    }
  }
  return 1 // 默认值
}

// 将实际播放速度转换为归一化值(0-100)
const speedToNormalized = (speed: number) => {
  // 找到对应的段
  for (const segment of speedSegments) {
    if (speed >= segment.min && speed <= segment.max) {
      // 在段内进行线性插值
      const segmentProgress = (speed - segment.min) / (segment.max - segment.min)
      return (
        segment.normalizedStart +
        segmentProgress * (segment.normalizedEnd - segment.normalizedStart)
      )
    }
  }
  return 20 // 默认值对应1x
}
</script>

<style scoped>
.video-clip-properties {
  width: 100%;
}

/* 使用全局样式 styles/components/panels.css 和 styles/components/inputs.css 中定义的样式 */

/* 倍速控制样式 */
.speed-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
}

/* 分段倍速滑块容器 */
.segmented-speed-container {
  position: relative;
  flex: 1;
  height: 40px;
  display: flex;
  align-items: center;
}

/* 音量控制样式 */
.volume-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
}

.mute-btn {
  background: var(--color-bg-quaternary);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xs);
  transition: all 0.2s ease;
  width: 24px;
  height: 24px;
}

.mute-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-focus);
}

/* 分辨率显示样式 */
.resolution-display {
  background: var(--color-bg-quaternary);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-medium);
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: center;
  font-family: monospace;
}
</style>
