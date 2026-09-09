<template>
  <section v-if="shouldShow" class="properties-section music-analysis-section">
    <div class="music-analysis-heading">
      <div class="music-analysis-heading__title">
        <component :is="IconComponents.MUSIC" size="16px" />
        <h3 class="section-title">{{ t('properties.mediaItem.musicAnalysis.title') }}</h3>
      </div>
      <n-button
        size="tiny"
        secondary
        :type="semanticStatus === 'completed' ? 'success' : 'primary'"
        :loading="isSemanticActive"
        @click="handleSemanticAnalysis"
      >
        {{ semanticButtonLabel }}
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

      <details
        v-if="displayAnchors.length > 0"
        class="music-analysis-anchors"
        :open="anchorsExpanded"
        @toggle="handleAnchorToggle"
      >
        <summary class="music-analysis-anchors__summary">
          <span class="music-analysis-anchors__title">
            {{ t('properties.mediaItem.musicAnalysis.anchors.title') }}
          </span>
          <span class="music-analysis-anchors__count">
            {{
              t('properties.mediaItem.musicAnalysis.anchors.count', {
                count: displayAnchors.length,
              })
            }}
          </span>
          <component
            :is="IconComponents.DROPDOWN"
            size="14px"
            class="music-analysis-anchors__chevron"
            aria-hidden="true"
          />
        </summary>
        <div class="music-analysis-anchor-list" role="list">
          <div
            v-for="anchor in displayAnchors"
            :key="anchor.id"
            class="music-analysis-anchor-row"
            role="listitem"
          >
            <time class="music-analysis-anchor-row__time" :datetime="`${anchor.time}s`">
              {{ formatAnchorTime(anchor.time) }}
            </time>
            <div class="music-analysis-anchor-row__content">
              <span class="music-analysis-anchor-row__event">
                {{ formatAnchorEventLabel(anchor.eventLabel) }}
              </span>
              <span v-if="anchor.roles.length" class="music-analysis-anchor-row__roles">
                {{ formatAnchorRoles(anchor.roles) }}
              </span>
            </div>
            <span
              class="music-analysis-anchor-row__strength"
              :aria-label="anchorStrengthLabel(anchor.strength)"
              :title="anchorStrengthLabel(anchor.strength)"
            >
              <span
                v-for="bar in 3"
                :key="bar"
                class="music-analysis-anchor-row__strength-bar"
                :class="{
                  'music-analysis-anchor-row__strength-bar--active':
                    bar <= anchorStrengthBars(anchor.strength),
                }"
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </details>

      <details
        v-if="semanticSummary"
        class="music-semantic-details"
        :open="semanticExpanded"
        @toggle="handleSemanticToggle"
      >
        <summary class="music-semantic-details__summary">
          <span class="music-semantic-details__title">
            {{ t('properties.mediaItem.musicAnalysis.semantic.title') }}
          </span>
          <span class="music-semantic-details__count">
            {{
              t('properties.mediaItem.musicAnalysis.semantic.count', {
                sections: semanticSummary.sectionCount,
                anchors: semanticSummary.anchorCount,
              })
            }}
          </span>
          <component
            :is="IconComponents.DROPDOWN"
            size="14px"
            class="music-semantic-details__chevron"
            aria-hidden="true"
          />
        </summary>

        <div class="music-semantic-details__body">
          <div class="music-semantic-overview">
            <div v-if="semanticSummary.genres.length" class="music-semantic-overview__item">
              <span class="music-semantic-overview__label">
                {{ t('properties.mediaItem.musicAnalysis.semantic.genres') }}
              </span>
              <span class="music-semantic-overview__value">
                {{ semanticSummary.genres.join(' / ') }}
              </span>
            </div>
            <div v-if="semanticSummary.rhythm" class="music-semantic-overview__item">
              <span class="music-semantic-overview__label">
                {{ t('properties.mediaItem.musicAnalysis.semantic.rhythm') }}
              </span>
              <span class="music-semantic-overview__value">{{ semanticSummary.rhythm }}</span>
            </div>
            <div v-if="semanticSummary.energyArc" class="music-semantic-overview__item">
              <span class="music-semantic-overview__label">
                {{ t('properties.mediaItem.musicAnalysis.semantic.energyArc') }}
              </span>
              <span class="music-semantic-overview__value">{{ semanticSummary.energyArc }}</span>
            </div>
            <span
              v-if="semanticSummary.failedSectionCount"
              class="music-semantic-overview__fallback"
            >
              {{
                t('properties.mediaItem.musicAnalysis.semantic.partialFailed', {
                  count: semanticSummary.failedSectionCount,
                })
              }}
            </span>
          </div>

          <div v-if="semanticSummary.sections.length" class="music-semantic-section-list">
            <article
              v-for="section in semanticSummary.sections"
              :key="`semantic-${section.sectionId}`"
              class="music-semantic-section"
            >
              <div class="music-semantic-section__heading">
                <span class="music-semantic-section__id">{{ section.sectionId }}</span>
                <time class="music-semantic-section__time" :datetime="`${section.start}s`">
                  {{ formatMusicTime(section.start) }} - {{ formatMusicTime(section.end) }}
                </time>
                <span class="music-semantic-section__anchors">
                  {{
                    t('properties.mediaItem.musicAnalysis.semantic.anchorCount', {
                      count: section.refinement.anchors.length,
                    })
                  }}
                </span>
              </div>

              <dl class="music-semantic-facts">
                <div class="music-semantic-fact">
                  <dt>{{ t('properties.mediaItem.musicAnalysis.semantic.lyrics') }}</dt>
                  <dd>{{ semanticText(section.semantic.lyrics) }}</dd>
                </div>
                <div class="music-semantic-fact">
                  <dt>{{ t('properties.mediaItem.musicAnalysis.semantic.rhythm') }}</dt>
                  <dd>{{ semanticText(section.semantic.rhythm) }}</dd>
                </div>
                <div class="music-semantic-fact">
                  <dt>{{ t('properties.mediaItem.musicAnalysis.semantic.energy') }}</dt>
                  <dd>{{ semanticText(section.semantic.energy) }}</dd>
                </div>
                <div class="music-semantic-fact">
                  <dt>{{ t('properties.mediaItem.musicAnalysis.semantic.arrangement') }}</dt>
                  <dd>{{ semanticText(section.semantic.arrangement) }}</dd>
                </div>
                <div class="music-semantic-fact">
                  <dt>{{ t('properties.mediaItem.musicAnalysis.semantic.vocal') }}</dt>
                  <dd>{{ semanticText(section.semantic.vocal) }}</dd>
                </div>
              </dl>

              <div class="music-semantic-refinement">
                <div class="music-semantic-refinement__row">
                  <span class="music-semantic-refinement__label">
                    {{ t('properties.mediaItem.musicAnalysis.semantic.editingNotes') }}
                  </span>
                  <span class="music-semantic-refinement__value">
                    {{ semanticText(section.refinement.editingNotes) }}
                  </span>
                </div>
                <div class="music-semantic-refinement__row">
                  <span class="music-semantic-refinement__label">
                    {{ t('properties.mediaItem.musicAnalysis.semantic.shotPace') }}
                  </span>
                  <span class="music-semantic-refinement__value">
                    {{ formatShotPace(section.refinement.shotPace) }}
                  </span>
                </div>
              </div>

              <div
                v-if="section.refinement.anchors.length"
                class="music-semantic-anchor-list"
                role="list"
              >
                <div
                  v-for="anchor in section.refinement.anchors"
                  :key="anchor.anchorId"
                  class="music-semantic-anchor"
                  role="listitem"
                >
                  <time class="music-semantic-anchor__time" :datetime="`${anchor.time}s`">
                    {{ formatAnchorTime(anchor.time) }}
                  </time>
                  <div class="music-semantic-anchor__content">
                    <div class="music-semantic-anchor__heading">
                      <span class="music-semantic-anchor__event">
                        {{ formatAnchorEventLabel(anchor.eventLabel) }}
                      </span>
                      <span class="music-semantic-anchor__decision">
                        {{ formatSemanticDecision(anchor.decision) }}
                      </span>
                    </div>
                    <span v-if="anchor.roles.length" class="music-semantic-anchor__roles">
                      {{ formatAnchorRoles(anchor.roles) }}
                    </span>
                    <span v-if="anchor.recommendedUses.length" class="music-semantic-anchor__uses">
                      {{ anchor.recommendedUses.join(' · ') }}
                    </span>
                    <span v-if="anchor.reason" class="music-semantic-anchor__reason">
                      {{ anchor.reason }}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </details>
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
import { computed, ref, watch } from 'vue'
import { NButton } from 'naive-ui'
import { IconComponents } from '@/constants/iconComponents'
import { useAppI18n } from '@/core/composables/useI18n'
import { useMusicStructureAnalysis } from '@/core/composables/useMusicStructureAnalysis'
import { useUnifiedStore } from '@/core/unifiedStore'
import { MUSIC_STRUCTURE_ANALYSIS_RESOURCE_TYPE, type TaskView } from '@/core/jobs'
import type {
  MusicAnalysisMetadata,
  MusicSemanticSection,
  UnifiedMediaItemData,
} from '@/core/mediaitem/types'
import {
  getMusicAnalysisSegmentColorKey,
  MUSIC_ANALYSIS_MAX_DURATION_SECONDS,
  MUSIC_ANALYSIS_MIN_DURATION_SECONDS,
  type MusicAnalysisAnchor,
} from '@/core/utils/music-analysis'

interface Props {
  mediaItem: UnifiedMediaItemData
}

const props = defineProps<Props>()
const unifiedStore = useUnifiedStore()
const { t } = useAppI18n()
const { analyzeMusicStructure } = useMusicStructureAnalysis()

const analysis = computed<MusicAnalysisMetadata | undefined>(
  () => props.mediaItem.metadata?.musicAnalysis,
)
const anchorsExpanded = ref(false)
const semanticExpanded = ref(false)
const hasAnalysis = computed(() => Boolean(analysis.value))
const musicAnalysisTask = computed<TaskView | undefined>(() =>
  unifiedStore.jobTaskViews.find(
    (task) =>
      task.rootResourceId === `${MUSIC_STRUCTURE_ANALYSIS_RESOURCE_TYPE}:${props.mediaItem.id}`,
  ),
)
const semanticTask = computed<TaskView | undefined>(() =>
  unifiedStore.jobTaskViews.find(
    (task) => task.rootResourceId === `music-semantic-metadata-writeback:${props.mediaItem.id}`,
  ),
)
const semanticStatus = computed(() => props.mediaItem.metadata?.musicSemantic?.status)
const isSemanticActive = computed(
  () =>
    ['idle', 'queued', 'running'].includes(semanticTask.value?.status ?? '') ||
    semanticStatus.value === 'pending' ||
    semanticStatus.value === 'processing',
)
const semanticButtonLabel = computed(() => {
  if (isSemanticActive.value) return t('properties.mediaItem.musicAnalysis.semantic.processing')
  if (semanticStatus.value === 'completed')
    return t('properties.mediaItem.musicAnalysis.semantic.reanalyze')
  if (semanticStatus.value === 'failed' || semanticStatus.value === 'partial_failed')
    return t('properties.mediaItem.musicAnalysis.semantic.retry')
  return t('properties.mediaItem.musicAnalysis.semantic.analyze')
})
const semanticSummary = computed(() => {
  const semantic = props.mediaItem.metadata?.musicSemantic
  if (!semantic || !['completed', 'partial_failed'].includes(semantic.status)) return null
  const sections = semantic.sections ?? []
  return {
    genres: semantic.global?.genres ?? [],
    rhythm: semantic.global?.rhythm ?? '',
    energyArc: semantic.global?.energyArc ?? '',
    sections,
    sectionCount: sections.length,
    failedSectionCount: semantic.failedSectionIds?.length ?? 0,
    anchorCount: sections.reduce((count, section) => count + section.refinement.anchors.length, 0),
  }
})
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
const displayAnchors = computed<MusicAnalysisAnchor[]>(() =>
  (analysis.value?.editingAnchors ?? [])
    .filter(
      (anchor) =>
        typeof anchor.id === 'string' &&
        Number.isFinite(anchor.time) &&
        anchor.time >= 0 &&
        typeof anchor.eventLabel === 'string' &&
        Array.isArray(anchor.roles) &&
        Number.isFinite(anchor.strength),
    )
    .slice()
    .sort((left, right) => left.time - right.time || left.id.localeCompare(right.id)),
)

watch(
  () => props.mediaItem.id,
  () => {
    anchorsExpanded.value = false
    semanticExpanded.value = false
  },
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

function formatAnchorTime(seconds: number): string {
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100))
  const hours = Math.floor(totalCentiseconds / 360_000)
  const minutes = Math.floor((totalCentiseconds % 360_000) / 6_000)
  const remainingCentiseconds = totalCentiseconds % 6_000
  const wholeSeconds = Math.floor(remainingCentiseconds / 100)
  const centiseconds = remainingCentiseconds % 100
  const minuteSecond = `${minutes.toString().padStart(2, '0')}:${wholeSeconds
    .toString()
    .padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`

  return hours > 0 ? `${hours.toString().padStart(2, '0')}:${minuteSecond}` : minuteSecond
}

function formatSegmentLabel(label: string): string {
  const key = MUSIC_ANALYSIS_SEGMENT_LABEL_KEYS[label]
  return key ? t(`properties.mediaItem.musicAnalysis.segmentLabels.${key}`) : label
}

function segmentColorClass(label: string): string {
  return `music-analysis-segment--${getMusicAnalysisSegmentColorKey(label)}`
}

function formatAnchorEventLabel(label: string): string {
  const key = MUSIC_ANALYSIS_ANCHOR_EVENT_LABEL_KEYS[label]
  return key ? t(`properties.mediaItem.musicAnalysis.anchors.eventLabels.${key}`) : label
}

function formatAnchorRoles(roles: string[]): string {
  return roles
    .map((role) => {
      const key = MUSIC_ANALYSIS_ANCHOR_ROLE_LABEL_KEYS[role]
      return key ? t(`properties.mediaItem.musicAnalysis.anchors.roleLabels.${key}`) : role
    })
    .join(' · ')
}

function anchorStrengthBars(strength: number): number {
  if (strength >= 0.72) return 3
  if (strength >= 0.4) return 2
  return 1
}

function anchorStrengthLabel(strength: number): string {
  const level = anchorStrengthBars(strength)
  const key = level === 3 ? 'high' : level === 2 ? 'medium' : 'low'
  return t(`properties.mediaItem.musicAnalysis.anchors.strength.${key}`)
}

function handleAnchorToggle(event: Event): void {
  anchorsExpanded.value = (event.currentTarget as HTMLDetailsElement).open
}

function handleSemanticToggle(event: Event): void {
  semanticExpanded.value = (event.currentTarget as HTMLDetailsElement).open
}

function semanticText(value: string): string {
  return value.trim() || t('properties.mediaItem.musicAnalysis.semantic.noValue')
}

function formatShotPace(value: MusicSemanticSection['refinement']['shotPace']): string {
  const key: Record<string, string> = {
    慢: 'slow',
    中: 'medium',
    快: 'fast',
    变化: 'variable',
    无法判断: 'unknown',
  }
  return key[value]
    ? t(`properties.mediaItem.musicAnalysis.semantic.shotPaceValues.${key[value]}`)
    : value
}

function formatSemanticDecision(value: string): string {
  const key: Record<string, string> = {
    重点: 'primary',
    次要: 'secondary',
  }
  return key[value]
    ? t(`properties.mediaItem.musicAnalysis.semantic.decisions.${key[value]}`)
    : value
}

async function handleStartAnalysis(force: boolean): Promise<void> {
  if (!canStartAnalysis.value) return
  await analyzeMusicStructure(props.mediaItem.id, force)
}

async function handleSemanticAnalysis(): Promise<void> {
  if (isSemanticActive.value) return
  try {
    await unifiedStore.ensureMusicSemanticAnalysis(props.mediaItem.id)
  } catch (error) {
    unifiedStore.messageError(
      error instanceof Error
        ? error.message
        : t('properties.mediaItem.musicAnalysis.semantic.failed'),
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

const MUSIC_ANALYSIS_ANCHOR_EVENT_LABEL_KEYS: Record<string, string> = {
  anchor: 'anchor',
  section_entry: 'sectionEntry',
  section_exit: 'sectionExit',
  downbeat: 'downbeat',
  beat: 'beat',
  energy_rise: 'energyRise',
  energy_fall: 'energyFall',
  energy_peak: 'energyPeak',
  onset_event: 'onsetEvent',
  onset_entry: 'onsetEntry',
  onset_exit: 'onsetExit',
  silence_enter: 'silenceEnter',
  silence_exit: 'silenceExit',
  pitch_rise: 'pitchRise',
  pitch_fall: 'pitchFall',
  pitch_entry: 'pitchEntry',
  pitch_exit: 'pitchExit',
}

const MUSIC_ANALYSIS_ANCHOR_ROLE_LABEL_KEYS: Record<string, string> = {
  section_entry: 'sectionEntry',
  section_exit: 'sectionExit',
  build_up: 'buildUp',
  impact: 'impact',
  instrument_change: 'instrumentChange',
  pause: 'pause',
  release: 'release',
  melodic_turn: 'melodicTurn',
  rhythm_scaffold: 'rhythmScaffold',
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

.music-analysis-segment--start {
  background: #e2b93b;
}

.music-analysis-segment--intro {
  background: #2d7ff9;
}

.music-analysis-segment--verse {
  background: #20a464;
}

.music-analysis-segment--chorus {
  background: #e65b3d;
}

.music-analysis-segment--bridge {
  background: #8b5cf6;
}

.music-analysis-segment--break {
  background: #19a7a3;
}

.music-analysis-segment--instrumental {
  background: #d99822;
}

.music-analysis-segment--solo {
  background: #c844b7;
}

.music-analysis-segment--outro {
  background: #a94e6d;
}

.music-analysis-segment--end {
  background: #4b5563;
}

.music-analysis-segment--other {
  background: #78838f;
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

.music-analysis-anchors {
  border-top: 1px solid color-mix(in srgb, var(--color-border-default) 58%, transparent);
}

.music-analysis-anchors__summary {
  display: flex;
  align-items: center;
  min-height: 40px;
  cursor: pointer;
  list-style: none;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 500;
  user-select: none;
}

.music-analysis-anchors__summary::-webkit-details-marker {
  display: none;
}

.music-analysis-anchors__title {
  min-width: 0;
  text-wrap: balance;
}

.music-analysis-anchors__count {
  margin-left: auto;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  font-weight: 400;
}

.music-analysis-anchors__chevron {
  margin-left: var(--spacing-xs);
  color: var(--color-text-secondary);
  transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
}

.music-analysis-anchors[open] .music-analysis-anchors__chevron {
  transform: rotate(180deg);
}

.music-semantic-details {
  border-top: 1px solid color-mix(in srgb, var(--color-border-default) 58%, transparent);
}

.music-semantic-details__summary {
  display: flex;
  align-items: center;
  min-height: 40px;
  cursor: pointer;
  list-style: none;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 500;
  user-select: none;
}

.music-semantic-details__summary::-webkit-details-marker {
  display: none;
}

.music-semantic-details__title {
  min-width: 0;
  text-wrap: balance;
}

.music-semantic-details__count {
  margin-left: auto;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  font-weight: 400;
}

.music-semantic-details__chevron {
  margin-left: var(--spacing-xs);
  color: var(--color-text-secondary);
  transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
}

.music-semantic-details[open] .music-semantic-details__chevron {
  transform: rotate(180deg);
}

.music-semantic-details__body {
  display: flex;
  max-height: 440px;
  overflow-y: auto;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0 0;
  border-top: 1px solid color-mix(in srgb, var(--color-border-default) 46%, transparent);
}

.music-semantic-overview {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.music-semantic-overview__item {
  display: grid;
  grid-template-columns: minmax(56px, auto) minmax(0, 1fr);
  gap: var(--spacing-sm);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}

.music-semantic-overview__label,
.music-semantic-refinement__label {
  color: var(--color-text-secondary);
}

.music-semantic-overview__value,
.music-semantic-refinement__value {
  min-width: 0;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

.music-semantic-overview__fallback {
  color: var(--color-status-warning);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.music-semantic-section-list {
  display: flex;
  flex-direction: column;
}

.music-semantic-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border-default) 46%, transparent);
}

.music-semantic-section:first-child {
  padding-top: 0;
}

.music-semantic-section:last-child {
  border-bottom: none;
}

.music-semantic-section__heading {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) minmax(60px, auto);
  align-items: baseline;
  gap: var(--spacing-sm);
}

.music-semantic-section__id {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-semantic-section__time,
.music-semantic-section__anchors {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.music-semantic-section__anchors {
  text-align: right;
}

.music-semantic-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-xs) var(--spacing-sm);
  margin: 0;
}

.music-semantic-fact {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.music-semantic-fact dt {
  color: var(--color-text-secondary);
}

.music-semantic-fact dd {
  margin: 0;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

.music-semantic-refinement {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding-left: var(--spacing-sm);
  border-left: 2px solid color-mix(in srgb, var(--color-status-processing) 58%, transparent);
}

.music-semantic-refinement__row {
  display: grid;
  grid-template-columns: minmax(56px, auto) minmax(0, 1fr);
  gap: var(--spacing-sm);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}

.music-semantic-anchor-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid color-mix(in srgb, var(--color-border-default) 38%, transparent);
}

.music-semantic-anchor {
  display: grid;
  grid-template-columns: minmax(52px, auto) minmax(0, 1fr);
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border-default) 38%, transparent);
}

.music-semantic-anchor:last-child {
  border-bottom: none;
}

.music-semantic-anchor__time {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.music-semantic-anchor__content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.music-semantic-anchor__heading {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: var(--spacing-xs);
}

.music-semantic-anchor__event {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-semantic-anchor__decision {
  flex: none;
  color: var(--color-status-processing);
}

.music-semantic-anchor__roles,
.music-semantic-anchor__uses,
.music-semantic-anchor__reason {
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.music-analysis-anchor-list {
  display: flex;
  max-height: 248px;
  overflow-y: auto;
  flex-direction: column;
  border-top: 1px solid color-mix(in srgb, var(--color-border-default) 46%, transparent);
}

.music-analysis-anchor-row {
  display: grid;
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr) 22px;
  align-items: center;
  min-height: 36px;
  gap: var(--spacing-sm);
  border-bottom: 1px solid color-mix(in srgb, var(--color-border-default) 46%, transparent);
}

.music-analysis-anchor-row:last-child {
  border-bottom: none;
}

.music-analysis-anchor-row__time {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.music-analysis-anchor-row__content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.music-analysis-anchor-row__event,
.music-analysis-anchor-row__roles {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-analysis-anchor-row__event {
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
}

.music-analysis-anchor-row__roles {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.music-analysis-anchor-row__strength {
  display: flex;
  height: 14px;
  align-items: end;
  justify-content: end;
  gap: 2px;
}

.music-analysis-anchor-row__strength-bar {
  width: 3px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--color-text-secondary) 28%, transparent);
}

.music-analysis-anchor-row__strength-bar:nth-child(1) {
  height: 4px;
}

.music-analysis-anchor-row__strength-bar:nth-child(2) {
  height: 7px;
}

.music-analysis-anchor-row__strength-bar:nth-child(3) {
  height: 10px;
}

.music-analysis-anchor-row__strength-bar--active {
  background: var(--color-status-processing);
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
