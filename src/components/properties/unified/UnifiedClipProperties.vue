<template>
  <div class="unified-clip-properties">
    <!-- 基本信息 - 非文本类型显示 -->
    <BasicInfoSection
      v-if="selectedTimelineItem && !isTextTimelineItem(selectedTimelineItem)"
      :selected-timeline-item="selectedTimelineItem"
      :show-resolution="selectedTimelineItem ? hasVisualProperties(selectedTimelineItem) : false"
    />

    <!-- 播放设置 -->
    <PlaybackSettingsSection
      v-if="selectedTimelineItem"
      :selected-timeline-item="selectedTimelineItem"
      :show-speed-control="showSpeedControl"
    />

    <!-- 文本属性组 - 仅 text（包含文本内容编辑） -->
    <TextPropertiesGroup
      v-if="selectedTimelineItem && isTextTimelineItem(selectedTimelineItem)"
      :selected-timeline-item="selectedTimelineItem"
      :current-frame="currentFrame"
    />

    <!-- 关键帧控制 - video/image/text（独立组件）-->
    <UnifiedKeyframeControls
      v-if="selectedTimelineItem && hasVisualProperties(selectedTimelineItem)"
      :keyframe-button-state="buttonState"
      :can-operate-keyframes="canOperateKeyframes"
      :has-previous-keyframe="hasPreviousKeyframe"
      :has-next-keyframe="hasNextKeyframe"
      :keyframe-tooltip="getUnifiedKeyframeTooltip()"
      :show-debug-button="true"
      @toggle-keyframe="toggleKeyframe"
      @go-to-previous="goToPreviousKeyframe"
      @go-to-next="goToNextKeyframe"
      @debug-keyframes="debugUnifiedKeyframes"
    />

    <!-- 视觉属性组 - video/image/text -->
    <VisualPropertiesGroup
      v-if="selectedTimelineItem && hasVisualProperties(selectedTimelineItem)"
      :selected-timeline-item="selectedTimelineItem"
      :current-frame="currentFrame"
    />

    <!-- 音频属性组 - video/audio -->
    <AudioPropertiesGroup
      v-if="selectedTimelineItem && hasAudioProperties(selectedTimelineItem)"
      :selected-timeline-item="selectedTimelineItem"
      :current-frame="currentFrame"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  hasVisualProperties,
  hasAudioProperties,
  isTextTimelineItem,
  isVideoTimelineItem,
  isAudioTimelineItem,
} from '@/core/timelineitem/queries'
import { useUnifiedKeyframeTransformControls } from '@/core/composables'
import { useUnifiedStore } from '@/core/unifiedStore'
import { getPreviousKeyframeFrame, getNextKeyframeFrame } from '@/core/utils/unifiedKeyframeUtils'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'

import BasicInfoSection from './BasicInfoSection.vue'
import PlaybackSettingsSection from './PlaybackSettingsSection.vue'
import TextPropertiesGroup from '../groups/TextPropertiesGroup.vue'
import VisualPropertiesGroup from '../groups/VisualPropertiesGroup.vue'
import AudioPropertiesGroup from '../groups/AudioPropertiesGroup.vue'
import UnifiedKeyframeControls from '../UnifiedKeyframeControls.vue'

interface Props {
  selectedTimelineItem: UnifiedTimelineItemData | null
  currentFrame: number
}

const props = defineProps<Props>()
const unifiedStore = useUnifiedStore()

// 使用关键帧控制器
const {
  buttonState,
  canOperateKeyframes,
  hasPreviousKeyframe,
  hasNextKeyframe,
  getUnifiedKeyframeTooltip,
  debugUnifiedKeyframes,
} = useUnifiedKeyframeTransformControls({
  selectedTimelineItem: computed(() => props.selectedTimelineItem),
  currentFrame: computed(() => props.currentFrame),
})

// 关键帧操作方法（直接使用 unifiedStore）
const toggleKeyframe = async () => {
  if (!props.selectedTimelineItem || !canOperateKeyframes.value) {
    unifiedStore.messageWarning(
      '播放头不在当前视频片段的时间范围内。请将播放头移动到片段内再尝试操作关键帧。',
    )
    return
  }
  await unifiedStore.toggleKeyframeWithHistory(props.selectedTimelineItem.id, props.currentFrame)
}

const goToPreviousKeyframe = async () => {
  if (!props.selectedTimelineItem) return
  const frame = getPreviousKeyframeFrame(props.selectedTimelineItem, props.currentFrame)
  if (frame !== null) {
    unifiedStore.seekToFrame(frame)
  }
}

const goToNextKeyframe = async () => {
  if (!props.selectedTimelineItem) return
  const frame = getNextKeyframeFrame(props.selectedTimelineItem, props.currentFrame)
  if (frame !== null) {
    unifiedStore.seekToFrame(frame)
  }
}

// 是否显示倍速控制
const showSpeedControl = computed(() => {
  if (!props.selectedTimelineItem) return false
  return isVideoTimelineItem(props.selectedTimelineItem) ||
         isAudioTimelineItem(props.selectedTimelineItem)
})
</script>

<style scoped>
.unified-clip-properties {
  width: 100%;
}
</style>