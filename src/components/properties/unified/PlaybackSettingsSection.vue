<template>
  <div class="property-section">
    <h4>{{ t('properties.playback.playbackSettings') }}</h4>

    <!-- 时长控制 -->
    <div class="property-item">
      <label>{{ t('properties.basic.targetDuration') }}</label>
      <TimecodeInput
        :model-value="timelineDurationFrames"
        @update:model-value="updateTargetDurationFrames"
        @error="handleTimecodeError"
        :placeholder="t('properties.timecodes.timecodeFormat')"
      />
    </div>

    <!-- 倍速控制（仅 video/audio） -->
    <div v-if="showSpeedControl" class="property-item">
      <label>{{ t('properties.playback.speed') }}</label>
      <div class="speed-controls">
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'
import { isVideoTimelineItem, isImageTimelineItem } from '@/core/timelineitem/queries'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import NumberInput from '@/components/base/NumberInput.vue'
import SliderInput from '@/components/base/SliderInput.vue'
import TimecodeInput from '@/components/base/TimecodeInput.vue'

interface Props {
  selectedTimelineItem: UnifiedTimelineItemData | null
  showSpeedControl?: boolean
}

const props = defineProps<Props>()
const { t } = useAppI18n()
const unifiedStore = useUnifiedStore()

// 时间轴时长（帧数）
const timelineDurationFrames = computed(() => {
  if (!props.selectedTimelineItem) return 0
  const timeRange = props.selectedTimelineItem.timeRange
  return Math.round(timeRange.timelineEndTime - timeRange.timelineStartTime)
})

// 倍速分段配置
const speedSegments = [
  { min: 0.1, max: 1, normalizedStart: 0, normalizedEnd: 20 },
  { min: 1, max: 2, normalizedStart: 20, normalizedEnd: 40 },
  { min: 2, max: 5, normalizedStart: 40, normalizedEnd: 60 },
  { min: 5, max: 10, normalizedStart: 60, normalizedEnd: 80 },
  { min: 10, max: 100, normalizedStart: 80, normalizedEnd: 100 },
]

// 倍速滑块分段标记
const speedSliderSegments = [
  { position: 20, label: '1x' },
  { position: 40, label: '2x' },
  { position: 60, label: '5x' },
  { position: 80, label: '10x' },
]

// 播放速率
const playbackRate = computed(() => {
  if (!props.selectedTimelineItem) return 1

  // 图片类型没有播放速度概念
  if (isImageTimelineItem(props.selectedTimelineItem)) {
    return 1
  }

  // 对于视频类型，从timeRange计算播放速度
  if (isVideoTimelineItem(props.selectedTimelineItem)) {
    const timeRange = props.selectedTimelineItem.timeRange
    const clipDurationFrames = timeRange.clipEndTime - timeRange.clipStartTime
    const timelineDurationFrames = timeRange.timelineEndTime - timeRange.timelineStartTime

    if (clipDurationFrames > 0 && timelineDurationFrames > 0) {
      let playbackRate = clipDurationFrames / timelineDurationFrames

      // 修正浮点数精度问题
      const rounded = Math.round(playbackRate * 10) / 10
      if (Math.abs(playbackRate - rounded) < 0.001) {
        playbackRate = rounded
      }

      return playbackRate
    }
  }

  return 1
})

const normalizedSpeed = computed(() => speedToNormalized(playbackRate.value))
const speedInputValue = computed(() => playbackRate.value)

// 将归一化值(0-100)转换为实际播放速度
const normalizedToSpeed = (normalized: number) => {
  for (const segment of speedSegments) {
    if (normalized >= segment.normalizedStart && normalized <= segment.normalizedEnd) {
      const segmentProgress =
        (normalized - segment.normalizedStart) / (segment.normalizedEnd - segment.normalizedStart)
      return segment.min + segmentProgress * (segment.max - segment.min)
    }
  }
  return 1
}

// 将实际播放速度转换为归一化值(0-100)
const speedToNormalized = (speed: number) => {
  for (const segment of speedSegments) {
    if (speed >= segment.min && speed <= segment.max) {
      const segmentProgress = (speed - segment.min) / (segment.max - segment.min)
      return (
        segment.normalizedStart +
        segmentProgress * (segment.normalizedEnd - segment.normalizedStart)
      )
    }
  }
  return 20
}

// 更新播放速度
const updatePlaybackRate = async (newRate?: number) => {
  if (props.selectedTimelineItem && isVideoTimelineItem(props.selectedTimelineItem)) {
    const rate = newRate || playbackRate.value
    await unifiedStore.updateTimelineItemTransformWithHistory(props.selectedTimelineItem.id, {
      playbackRate: rate,
    })
  }
}

// 更新归一化速度
const updateNormalizedSpeed = (newNormalizedSpeed: number) => {
  const actualSpeed = normalizedToSpeed(newNormalizedSpeed)
  updatePlaybackRate(actualSpeed)
}

// 从输入框更新倍速
const updateSpeedFromInput = (newSpeed: number) => {
  if (newSpeed && newSpeed > 0) {
    const clampedSpeed = Math.max(0.1, Math.min(100, newSpeed))
    updatePlaybackRate(clampedSpeed)
  }
}

// 处理时间码错误
const handleTimecodeError = (errorMessage: string) => {
  unifiedStore.messageError(errorMessage)
}

// 更新目标时长
const updateTargetDurationFrames = async (newDurationFrames: number) => {
  throw new Error('TODO: 实现时长更新逻辑')
}
</script>

<style scoped>
.speed-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
}
</style>