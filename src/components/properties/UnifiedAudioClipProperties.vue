<template>
  <div class="audio-clip-properties">
    <!-- 基本信息 -->
    <div class="property-section">
      <h4>{{ t('properties.basic.basicInfo') }}</h4>
      <div class="property-item">
        <label>{{ t('properties.basic.name') }}</label>
        <input :value="clipName" readonly class="property-input" />
      </div>
    </div>

    <!-- 播放设置 -->
    <div class="property-section">
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

      <!-- 倍速控制 -->
      <div
        v-if="selectedTimelineItem && isAudioTimelineItem(selectedTimelineItem)"
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

      <!-- 音量控制 -->
      <div
        v-if="selectedTimelineItem && isAudioTimelineItem(selectedTimelineItem)"
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

      <!-- 增益控制 -->
      <div
        v-if="selectedTimelineItem && isAudioTimelineItem(selectedTimelineItem)"
        class="property-item"
      >
        <label>{{ t('properties.playback.gain') }}</label>
        <div class="gain-controls">
          <SliderInput
            :model-value="gain"
            @input="updateGain"
            :min="-20"
            :max="20"
            :step="0.1"
            slider-class="gain-slider"
          />
          <NumberInput
            :model-value="gain"
            @change="updateGain"
            :min="-20"
            :max="20"
            :step="0.1"
            :precision="1"
            :show-controls="false"
            :placeholder="t('properties.placeholders.gain')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'
import { isAudioTimelineItem, hasAudioProperties } from '@/core/timelineitem/TimelineItemQueries'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/TimelineItemData'
import { framesToTimecode, timecodeToFrames } from '@/core/utils/timeUtils'
import { updateWebAVAnimation } from '@/core/utils/webavAnimationManager'
import { getMuteIcon } from '@/constants/iconComponents'
import NumberInput from '@/components/base/NumberInput.vue'
import SliderInput from '@/components/base/SliderInput.vue'
import TimecodeInput from '@/components/base/TimecodeInput.vue'

interface Props {
  selectedTimelineItem: UnifiedTimelineItemData | null
  currentFrame: number
}

const props = defineProps<Props>()

const { t } = useAppI18n()
const unifiedStore = useUnifiedStore()

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

// 其他响应式属性
const clipName = computed(() => selectedMediaItem.value?.name || '')

const playbackRate = computed(() => {
  if (!props.selectedTimelineItem) return 1

  // 对于音频类型，从timeRange计算播放速度以确保响应性
  if (isAudioTimelineItem(props.selectedTimelineItem)) {
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
  if (!props.selectedTimelineItem || !isAudioTimelineItem(props.selectedTimelineItem)) return 1
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

// 增益控制
const gain = computed(() => {
  if (!props.selectedTimelineItem || !isAudioTimelineItem(props.selectedTimelineItem)) return 0
  return props.selectedTimelineItem.config.gain ?? 0
})

// 更新播放速度（仅对音频有效）- 使用带历史记录的方法
const updatePlaybackRate = async (newRate?: number) => {
  if (props.selectedTimelineItem && isAudioTimelineItem(props.selectedTimelineItem)) {
    const rate = newRate || playbackRate.value

    // 使用带历史记录的变换属性更新方法
    await unifiedStore.updateTimelineItemTransformWithHistory(props.selectedTimelineItem.id, {
      playbackRate: rate,
    })
    console.log('✅ 音频倍速更新成功')
  }
}

// 处理时间码错误
const handleTimecodeError = (errorMessage: string) => {
  unifiedStore.messageError(errorMessage)
}

// 更新目标时长（帧数版本）
const updateTargetDurationFrames = async (newDurationFrames: number) => {
  if (!props.selectedTimelineItem || !selectedMediaItem.value) {
    return
  }

  const alignedDurationFrames = Math.max(1, newDurationFrames) // 最少1帧
  const sprite = props.selectedTimelineItem.runtime.sprite!
  const timeRange = props.selectedTimelineItem.timeRange
  const oldDurationFrames = timeRange.timelineEndTime - timeRange.timelineStartTime // 计算旧时长
  const newTimelineEndTime = timeRange.timelineStartTime + alignedDurationFrames // 帧数相加，不需要转换

  // 🎯 关键帧位置调整：在更新timeRange之前调整关键帧位置
  if (
    props.selectedTimelineItem.animation &&
    props.selectedTimelineItem.animation.keyframes.length > 0
  ) {
    const { adjustKeyframesForDurationChange } = await import(
      '@/core/utils/unifiedKeyframeUtils'
    )
    adjustKeyframesForDurationChange(
      props.selectedTimelineItem,
      oldDurationFrames,
      alignedDurationFrames,
    )
    console.log('🎬 [Duration Update] Keyframes adjusted for duration change:', {
      oldDuration: oldDurationFrames,
      newDuration: alignedDurationFrames,
    })
  }

  if (isAudioTimelineItem(props.selectedTimelineItem)) {
    sprite.setTimeRange({
      clipStartTime: timeRange.clipStartTime,
      clipEndTime: timeRange.clipEndTime,
      timelineStartTime: timeRange.timelineStartTime,
      timelineEndTime: newTimelineEndTime,
    })
  }

  // 更新timelineItem的timeRange（使用专用工具函数）
  if (props.selectedTimelineItem) {
    const { syncTimeRange } = await import('@/core/utils/timeRangeUtils')
    syncTimeRange(props.selectedTimelineItem)
  }

  // 如果有动画，需要重新设置WebAV动画时长
  if (
    props.selectedTimelineItem.animation &&
    props.selectedTimelineItem.animation.keyframes.length > 0
  ) {
    await updateWebAVAnimation(props.selectedTimelineItem)
    console.log('🎬 [Duration Update] Animation duration updated after clip duration change')
  }

  console.log('✅ 音频帧数时长更新成功:', {
    inputFrames: newDurationFrames,
    alignedFrames: alignedDurationFrames,
    timecode: framesToTimecode(alignedDurationFrames),
  })
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
const updateVolume = (newVolume: number) => {
  if (!props.selectedTimelineItem || !isAudioTimelineItem(props.selectedTimelineItem)) return

  const clampedVolume = Math.max(0, Math.min(1, newVolume))

  // 确保属性存在，如果不存在则初始化（类型安全版本）
  if (!hasAudioProperties(props.selectedTimelineItem)) return

  // 📝 数据流向说明：
  // volume 和 isMuted 属性属于【非动画属性】，WebAV不支持这些属性的propsChange事件
  // 因此无法遵循标准的 UI → WebAV → TimelineItem → UI 数据流向
  // 这里直接修改config是技术限制导致的必要妥协，不是架构设计缺陷
  const config = props.selectedTimelineItem.config

  // 类型安全的属性初始化和访问
  if (config.volume === undefined) {
    config.volume = 1
  }
  if (config.isMuted === undefined) {
    config.isMuted = false
  }

  // 使用历史记录系统更新音量
  if (clampedVolume === 0) {
    // 设为静音，但保留原音量值
    unifiedStore.updateTimelineItemTransformWithHistory(props.selectedTimelineItem.id, {
      isMuted: true,
    })
  } else {
    // 更新音量值并取消静音
    unifiedStore.updateTimelineItemTransformWithHistory(props.selectedTimelineItem.id, {
      volume: clampedVolume,
      isMuted: false,
    })
  }

  console.log('✅ 音频音量更新成功:', clampedVolume)
}

// 切换静音状态（类型安全版本）
const toggleMute = () => {
  if (!props.selectedTimelineItem || !hasAudioProperties(props.selectedTimelineItem)) return

  // 📝 数据流向说明：
  // volume 和 isMuted 属性属于【非动画属性】，WebAV不支持这些属性的propsChange事件
  // 因此无法遵循标准的 UI → WebAV → TimelineItem → UI 数据流向
  // 这里直接修改config是技术限制导致的必要妥协，不是架构设计缺陷
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
  unifiedStore.updateTimelineItemTransformWithHistory(props.selectedTimelineItem.id, {
    isMuted: newMutedState,
  })

  console.log(
    '✅ 音频静音状态切换:',
    newMutedState ? t('properties.playback.silenced') : t('properties.playback.audible'),
    t('properties.playback.volumeMaintained') + ':',
    config.volume,
  )
}

// 更新增益
const updateGain = (newGain: number) => {
  if (!props.selectedTimelineItem || !isAudioTimelineItem(props.selectedTimelineItem)) return

  const clampedGain = Math.max(-20, Math.min(20, newGain))

  // 使用历史记录系统更新增益
  unifiedStore.updateTimelineItemTransformWithHistory(props.selectedTimelineItem.id, {
    gain: clampedGain,
  })

  console.log('✅ 音频增益更新成功:', clampedGain, 'dB')
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
.audio-clip-properties {
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
  transition: all 0.2s ease;
  min-width: 24px;
  height: 24px;
}

.mute-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-focus);
}

/* 增益控制样式 */
.gain-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
}
</style>
