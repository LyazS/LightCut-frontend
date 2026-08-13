<template>
  <section v-if="shouldShow" class="properties-section music-analysis-section">
    <div class="music-analysis-heading">
      <div class="music-analysis-heading__title">
        <component :is="IconComponents.MUSIC" size="16px" />
        <h3 class="section-title">{{ t('properties.mediaItem.musicAnalysis.title') }}</h3>
      </div>
      <n-button
        v-if="hasAnalysis && canStartAnalysis"
        class="music-analysis-icon-button"
        quaternary
        circle
        :title="t('properties.mediaItem.musicAnalysis.reanalyze')"
        :aria-label="t('properties.mediaItem.musicAnalysis.reanalyze')"
        @click="handleStartAnalysis(true)"
      >
        <template #icon>
          <component :is="IconComponents.REFRESH" size="16px" />
        </template>
      </n-button>
    </div>

    <template v-if="isAnalysisActive">
      <div class="music-analysis-progress">
        <div class="music-analysis-progress__status">
          <component
            :is="IconComponents.LOADING"
            size="16px"
            class="music-analysis-progress__icon"
          />
          <span>{{ analysisStatusText }}</span>
          <span v-if="progressPercent !== null" class="music-analysis-progress__percent">
            {{ progressPercent }}%
          </span>
        </div>
        <div class="music-analysis-progress__track" aria-hidden="true">
          <div
            class="music-analysis-progress__fill"
            :style="{ width: `${progressPercent ?? 0}%` }"
          />
        </div>
        <p v-if="musicAnalysisTask?.message" class="music-analysis-progress__detail">
          {{ musicAnalysisTask.message }}
        </p>
        <n-button size="small" secondary type="error" @click="handleCancelAnalysis">
          <template #icon>
            <component :is="IconComponents.CLOSE" size="16px" />
          </template>
          {{ t('properties.mediaItem.musicAnalysis.cancel') }}
        </n-button>
      </div>
    </template>

    <template v-else-if="analysis">
      <div
        class="music-analysis-metrics"
        :aria-label="t('properties.mediaItem.musicAnalysis.summary')"
      >
        <div class="music-analysis-metric">
          <span class="music-analysis-metric__label">{{
            t('properties.mediaItem.musicAnalysis.bpm')
          }}</span>
          <strong class="music-analysis-metric__value">
            {{ analysis.bpm ?? t('properties.mediaItem.musicAnalysis.unknownValue') }}
          </strong>
        </div>
        <div class="music-analysis-metric">
          <span class="music-analysis-metric__label">{{
            t('properties.mediaItem.musicAnalysis.meter')
          }}</span>
          <strong class="music-analysis-metric__value">{{ analysis.meter }}/4</strong>
        </div>
        <div class="music-analysis-metric">
          <span class="music-analysis-metric__label">
            {{ t('properties.mediaItem.musicAnalysis.segmentCount') }}
          </span>
          <strong class="music-analysis-metric__value">{{ displaySegments.length }}</strong>
        </div>
      </div>

      <div v-if="displaySegments.length > 0" class="music-analysis-structure">
        <div class="music-analysis-structure__bar" role="list">
          <div
            v-for="segment in displaySegments"
            :key="`${segment.start}-${segment.end}-${segment.label}`"
            class="music-analysis-structure__segment"
            :class="segmentColorClass(segment.label)"
            :style="{ flexGrow: segment.end - segment.start }"
            :title="segmentTooltip(segment)"
            role="listitem"
          >
            <span v-if="segment.end - segment.start >= 9">
              {{ formatSegmentLabel(segment.label) }}
            </span>
          </div>
        </div>

        <div class="music-analysis-segment-list">
          <div
            v-for="segment in displaySegments"
            :key="`row-${segment.start}-${segment.end}-${segment.label}`"
            class="music-analysis-segment-row"
          >
            <span
              class="music-analysis-segment-row__swatch"
              :class="segmentColorClass(segment.label)"
              aria-hidden="true"
            />
            <span class="music-analysis-segment-row__time">
              {{ formatMusicTime(segment.start) }} - {{ formatMusicTime(segment.end) }}
            </span>
            <span class="music-analysis-segment-row__label">
              {{ formatSegmentLabel(segment.label) }}
            </span>
          </div>
        </div>
      </div>

      <div v-else class="music-analysis-empty-segments">
        {{ t('properties.mediaItem.musicAnalysis.emptySegments') }}
      </div>

      <div class="music-analysis-footnote">
        <span>{{ t('properties.mediaItem.musicAnalysis.analyzedAt') }}</span>
        <span>{{ formatAnalyzedAt(analysis.analyzedAt) }}</span>
      </div>
    </template>

    <div v-else class="music-analysis-not-started">
      <div>
        <span class="music-analysis-not-started__status">
          {{ t('properties.mediaItem.musicAnalysis.notAnalyzed') }}
        </span>
        <span class="music-analysis-not-started__range">
          {{ t('properties.mediaItem.musicAnalysis.durationRange') }}
        </span>
      </div>
      <n-button size="small" type="primary" @click="handleStartAnalysis(false)">
        <template #icon>
          <component :is="IconComponents.MUSIC" size="16px" />
        </template>
        {{ t('properties.mediaItem.musicAnalysis.analyze') }}
      </n-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NButton } from 'naive-ui'
import { IconComponents } from '@/constants/iconComponents'
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'
import { MUSIC_STRUCTURE_ANALYSIS_RESOURCE_TYPE, type TaskView } from '@/core/jobs'
import type {
  MusicAnalysisMetadata,
  MusicAnalysisSegment,
  UnifiedMediaItemData,
} from '@/core/mediaitem/types'
import {
  MUSIC_ANALYSIS_MAX_DURATION_SECONDS,
  MUSIC_ANALYSIS_MIN_DURATION_SECONDS,
} from '@/core/utils/music-analysis'

interface Props {
  mediaItem: UnifiedMediaItemData
}

const props = defineProps<Props>()
const unifiedStore = useUnifiedStore()
const { t } = useAppI18n()

const analysis = computed<MusicAnalysisMetadata | undefined>(
  () => props.mediaItem.metadata?.musicAnalysis,
)
const hasAnalysis = computed(() => Boolean(analysis.value))
const musicAnalysisTask = computed<TaskView | undefined>(() =>
  unifiedStore.jobTaskViews.find(
    (task) =>
      task.rootResourceId === `${MUSIC_STRUCTURE_ANALYSIS_RESOURCE_TYPE}:${props.mediaItem.id}`,
  ),
)
const isAnalysisActive = computed(() => {
  const status = musicAnalysisTask.value?.status
  return status === 'idle' || status === 'queued' || status === 'running'
})
const isEligible = computed(() => {
  const bunnyMedia = props.mediaItem.runtime.bunny?.bunnyMedia
  const duration = bunnyMedia?.duration

  return (
    props.mediaItem.mediaStatus === 'ready' &&
    (props.mediaItem.mediaType === 'audio' || props.mediaItem.mediaType === 'video') &&
    typeof duration === 'number' &&
    Number.isFinite(duration) &&
    duration >= MUSIC_ANALYSIS_MIN_DURATION_SECONDS &&
    duration <= MUSIC_ANALYSIS_MAX_DURATION_SECONDS &&
    Boolean(bunnyMedia?.getAudioTrackInfo())
  )
})
const canStartAnalysis = computed(() => isEligible.value && !isAnalysisActive.value)
const shouldShow = computed(() => hasAnalysis.value || isAnalysisActive.value || isEligible.value)
const displaySegments = computed(() =>
  (analysis.value?.segments ?? []).filter(
    (segment) =>
      Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start,
  ),
)
const progressPercent = computed<number | null>(() => {
  const progress = musicAnalysisTask.value?.progress
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return null
  return Math.round(Math.min(1, Math.max(0, progress)) * 100)
})
const analysisStatusText = computed(() => {
  switch (musicAnalysisTask.value?.status) {
    case 'idle':
      return t('properties.mediaItem.musicAnalysis.preparing')
    case 'queued':
      return t('properties.mediaItem.musicAnalysis.queued')
    default:
      return t('properties.mediaItem.musicAnalysis.analyzing')
  }
})

function formatMusicTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  const minuteSecond = `${minutes.toString().padStart(2, '0')}:${remainingSeconds
    .toString()
    .padStart(2, '0')}`

  return hours > 0 ? `${hours.toString().padStart(2, '0')}:${minuteSecond}` : minuteSecond
}

function formatAnalyzedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatSegmentLabel(label: string): string {
  const key = MUSIC_ANALYSIS_SEGMENT_LABEL_KEYS[label]
  return key ? t(`properties.mediaItem.musicAnalysis.segmentLabels.${key}`) : label
}

function segmentColorClass(label: string): string {
  return `music-analysis-segment--${MUSIC_ANALYSIS_SEGMENT_COLOR_KEYS[label] ?? 'other'}`
}

function segmentTooltip(segment: MusicAnalysisSegment): string {
  return `${formatSegmentLabel(segment.label)}: ${formatMusicTime(segment.start)} - ${formatMusicTime(segment.end)}`
}

async function handleStartAnalysis(force: boolean): Promise<void> {
  if (!canStartAnalysis.value) return

  const mediaItem = props.mediaItem
  unifiedStore.messageSuccess(t('media.musicAnalysisStarted', { name: mediaItem.name }))
  try {
    await unifiedStore.ensureMusicStructureAnalysis(mediaItem.id, force)
    unifiedStore.messageSuccess(t('media.musicAnalysisSuccess', { name: mediaItem.name }))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return

    console.error('音乐结构分析失败:', error)
    unifiedStore.messageError(
      t('media.musicAnalysisFailed', {
        name: mediaItem.name,
        error: error instanceof Error ? error.message : t('media.unknown'),
      }),
    )
  }
}

async function handleCancelAnalysis(): Promise<void> {
  const mediaItem = props.mediaItem
  const cancelled = await unifiedStore.cancelMusicStructureAnalysis(mediaItem.id)
  if (cancelled) {
    unifiedStore.messageSuccess(t('media.musicAnalysisCancelSuccess', { name: mediaItem.name }))
  } else {
    unifiedStore.messageWarning(t('media.musicAnalysisCancelFailed', { name: mediaItem.name }))
  }
}

const MUSIC_ANALYSIS_SEGMENT_LABEL_KEYS: Record<string, string> = {
  start: 'start',
  end: 'end',
  intro: 'intro',
  outro: 'outro',
  break: 'break',
  bridge: 'bridge',
  inst: 'instrumental',
  solo: 'solo',
  verse: 'verse',
  chorus: 'chorus',
}

const MUSIC_ANALYSIS_SEGMENT_COLOR_KEYS: Record<string, string> = {
  start: 'intro',
  intro: 'intro',
  verse: 'verse',
  chorus: 'chorus',
  bridge: 'bridge',
  break: 'break',
  inst: 'instrumental',
  solo: 'solo',
  outro: 'outro',
  end: 'outro',
}
</script>

<style scoped>
.music-analysis-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.music-analysis-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
}

.music-analysis-heading__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  color: var(--color-text-secondary);
}

.music-analysis-heading .section-title {
  margin-bottom: 0;
}

.music-analysis-icon-button {
  width: 40px;
  height: 40px;
}

.music-analysis-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: var(--spacing-sm) 0;
  border-top: 1px solid color-mix(in srgb, var(--color-border-default) 68%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-border-default) 68%, transparent);
}

.music-analysis-metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 0 var(--spacing-sm);
}

.music-analysis-metric + .music-analysis-metric {
  border-left: 1px solid color-mix(in srgb, var(--color-border-default) 68%, transparent);
}

.music-analysis-metric:first-child {
  padding-left: 0;
}

.music-analysis-metric__label,
.music-analysis-footnote,
.music-analysis-progress__detail,
.music-analysis-not-started__range {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.music-analysis-metric__value {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-analysis-structure {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.music-analysis-structure__bar {
  display: flex;
  min-height: 34px;
  overflow: hidden;
  border-radius: var(--border-radius-small);
  background: color-mix(in srgb, var(--color-bg-quaternary) 86%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-border-default) 70%, transparent);
}

.music-analysis-structure__segment {
  display: flex;
  flex-basis: 0;
  align-items: center;
  justify-content: center;
  min-width: 1px;
  padding: 0 4px;
  color: color-mix(in srgb, var(--color-text-primary) 92%, white 8%);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  text-shadow: 0 1px 1px rgb(0 0 0 / 24%);
  white-space: nowrap;
  transition-property: filter, opacity;
  transition-duration: 160ms;
  transition-timing-function: ease;
}

.music-analysis-structure__segment:hover {
  filter: brightness(1.12);
}

.music-analysis-segment--intro {
  background: #4b93c6;
}

.music-analysis-segment--verse {
  background: #4e9d82;
}

.music-analysis-segment--chorus {
  background: #c78c4c;
}

.music-analysis-segment--bridge {
  background: #9a70ba;
}

.music-analysis-segment--break {
  background: #b96d77;
}

.music-analysis-segment--instrumental {
  background: #5b9ca6;
}

.music-analysis-segment--solo {
  background: #b17b62;
}

.music-analysis-segment--outro {
  background: #687ca7;
}

.music-analysis-segment--other {
  background: #7d8793;
}

.music-analysis-segment-list {
  display: flex;
  flex-direction: column;
}

.music-analysis-segment-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) minmax(72px, auto);
  align-items: center;
  gap: var(--spacing-sm);
  min-height: 28px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border-default) 58%, transparent);
  font-size: var(--font-size-sm);
}

.music-analysis-segment-row:last-child {
  border-bottom: none;
}

.music-analysis-segment-row__swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.music-analysis-segment-row__time {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.music-analysis-segment-row__label {
  overflow: hidden;
  color: var(--color-text-primary);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-analysis-progress {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: var(--border-radius-small);
  background: color-mix(in srgb, var(--color-bg-quaternary) 84%, transparent);
}

.music-analysis-progress__status {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.music-analysis-progress__icon {
  color: var(--color-status-processing);
  animation: music-analysis-spin 1s linear infinite;
}

.music-analysis-progress__percent {
  margin-left: auto;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.music-analysis-progress__track {
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--color-progress-background);
}

.music-analysis-progress__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--color-status-processing);
  transition: width 180ms ease;
}

.music-analysis-progress__detail {
  margin: 0;
  line-height: 1.45;
  text-wrap: pretty;
}

.music-analysis-empty-segments {
  padding: var(--spacing-sm);
  border-radius: var(--border-radius-small);
  background: var(--color-bg-quaternary);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.music-analysis-footnote {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-sm);
  font-variant-numeric: tabular-nums;
}

.music-analysis-not-started {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: var(--border-radius-small);
  background: color-mix(in srgb, var(--color-bg-quaternary) 84%, transparent);
}

.music-analysis-not-started > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.music-analysis-not-started__status {
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 500;
}

@keyframes music-analysis-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
