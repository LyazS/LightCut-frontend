import type {
  AIMark,
  AIMarks,
  AIMarksGeneratedFor,
  TimelineAnchorSource,
  TimelineMarker,
  UnifiedTimelineItemData,
} from '@/core/timelineitem/model/timelineItem'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import { RENDERER_FPS } from '@/core/mediabunny/constant'
import type { UnifiedTimeRange } from '@/core/types/timeRange'
import type { MusicAnalysisAnchor } from '@/core/utils/music-analysis/types'

export type AIMarksStatus = 'available' | 'partial' | 'stale' | 'notGenerated' | 'unsupported'

export interface ResolvedTimelineMarker extends TimelineMarker {
  /** 当前片段中的时间轴本地偏移量，由 sourceFrame 派生。 */
  offsetFrames: number
}

export interface ResolvedAIMark extends AIMark {
  /** 当前片段中的时间轴本地偏移量，由 sourceFrame 派生。 */
  offsetFrames: number
}

export interface ResolvedAIMarks {
  status: AIMarksStatus
  marks: ResolvedAIMark[]
}

export interface ResolvedMusicAnalysisAnchor extends MusicAnalysisAnchor {
  /** 当前片段中的时间轴本地偏移量，由分析时间换算而来。 */
  offsetFrames: number
  sourceFrame: number
}

function getTimelineDuration(timeRange: UnifiedTimeRange): number {
  return Math.max(0, timeRange.timelineEndTime - timeRange.timelineStartTime)
}

function getSourceDuration(timeRange: UnifiedTimeRange): number {
  return Math.max(0, timeRange.clipEndTime - timeRange.clipStartTime)
}

function isSourceBackedMediaType(item: UnifiedTimelineItemData): boolean {
  return item.mediaType === 'video' || item.mediaType === 'audio'
}

function normalizeTimelineMarkerOffsets(offsets: number[]): number[] {
  return Array.from(
    new Set(
      offsets
        .filter((offset) => Number.isInteger(offset) && offset >= 0)
        .map((offset) => Math.floor(offset)),
    ),
  ).sort((a, b) => a - b)
}

function sourceFrameToTimelineOffset(
  timeRange: UnifiedTimeRange,
  sourceFrame: number,
): number | undefined {
  const sourceDurationFrames = getSourceDuration(timeRange)
  const timelineDurationFrames = getTimelineDuration(timeRange)
  if (
    sourceDurationFrames <= 0 ||
    timelineDurationFrames <= 0 ||
    sourceFrame < timeRange.clipStartTime ||
    sourceFrame >= timeRange.clipEndTime
  ) {
    return undefined
  }

  return Math.round(
    ((sourceFrame - timeRange.clipStartTime) / sourceDurationFrames) * timelineDurationFrames,
  )
}

function timelineOffsetToSourceFrame(
  timeRange: UnifiedTimeRange,
  timelineOffset: number,
  allowEndBoundary: boolean,
): number | undefined {
  const sourceDurationFrames = getSourceDuration(timeRange)
  const timelineDurationFrames = getTimelineDuration(timeRange)
  if (
    !Number.isInteger(timelineOffset) ||
    timelineOffset < 0 ||
    timelineOffset > timelineDurationFrames ||
    (!allowEndBoundary && timelineOffset === timelineDurationFrames) ||
    sourceDurationFrames <= 0 ||
    timelineDurationFrames <= 0
  ) {
    return undefined
  }

  const sourceFrame = Math.round(
    timeRange.clipStartTime + (timelineOffset / timelineDurationFrames) * sourceDurationFrames,
  )
  return Math.min(timeRange.clipEndTime - 1, Math.max(timeRange.clipStartTime, sourceFrame))
}

/**
 * Normalizes source-frame manual markers. Legacy numeric values are interpreted as
 * timeline-local offsets only when the time range from which they came is provided.
 */
export function normalizeTimelineMarkers(
  markers: unknown,
  legacyTimeRange?: UnifiedTimeRange,
): TimelineMarker[] {
  if (!Array.isArray(markers)) {
    return []
  }

  const markerBySourceFrame = new Map<number, TimelineMarker>()
  for (const marker of markers) {
    const sourceFrame =
      typeof marker === 'number'
        ? legacyTimeRange
          ? timelineOffsetToSourceFrame(legacyTimeRange, marker, true)
          : undefined
        : marker && typeof marker === 'object' && Number.isInteger(marker.sourceFrame)
          ? marker.sourceFrame
          : undefined
    if (sourceFrame === undefined || sourceFrame < 0) {
      continue
    }

    markerBySourceFrame.set(Math.floor(sourceFrame), { sourceFrame: Math.floor(sourceFrame) })
  }

  return Array.from(markerBySourceFrame.values()).sort(
    (left, right) => left.sourceFrame - right.sourceFrame,
  )
}

export function cloneTimelineMarkers(markers: unknown): TimelineMarker[] {
  return normalizeTimelineMarkers(markers).map((marker) => ({ ...marker }))
}

/** Returns the source frame corresponding to an editable timeline frame in the item. */
export function timelineFrameToSourceFrame(
  item: UnifiedTimelineItemData,
  absoluteTimelineFrame: number,
): number | undefined {
  const { timelineStartTime, timelineEndTime } = item.timeRange
  if (absoluteTimelineFrame < timelineStartTime || absoluteTimelineFrame >= timelineEndTime) {
    return undefined
  }

  return timelineOffsetToSourceFrame(
    item.timeRange,
    absoluteTimelineFrame - timelineStartTime,
    false,
  )
}

/** Resolves manual source-frame markers to the current clip-local timeline offsets. */
export function resolveTimelineMarkersForTimelineItem(
  item: UnifiedTimelineItemData,
): ResolvedTimelineMarker[] {
  const markerByOffset = new Map<number, ResolvedTimelineMarker>()
  for (const marker of normalizeTimelineMarkers(item.markers, item.timeRange)) {
    const offsetFrames = sourceFrameToTimelineOffset(item.timeRange, marker.sourceFrame)
    if (offsetFrames === undefined || markerByOffset.has(offsetFrames)) {
      continue
    }

    markerByOffset.set(offsetFrames, { ...marker, offsetFrames })
  }

  return Array.from(markerByOffset.values()).sort((left, right) => left.offsetFrames - right.offsetFrames)
}

/** Returns every source-frame marker currently rendered at an absolute timeline frame. */
export function getTimelineMarkerSourceFramesAtTimelineFrame(
  item: UnifiedTimelineItemData,
  absoluteTimelineFrame: number,
): number[] {
  const timelineOffset = absoluteTimelineFrame - item.timeRange.timelineStartTime
  if (timelineOffset < 0 || timelineOffset >= getTimelineDuration(item.timeRange)) {
    return []
  }

  return normalizeTimelineMarkers(item.markers, item.timeRange)
    .filter(
      (marker) => sourceFrameToTimelineOffset(item.timeRange, marker.sourceFrame) === timelineOffset,
    )
    .map((marker) => marker.sourceFrame)
}

function isAIMarkBeat(value: unknown): value is AIMark['beat'] {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function normalizeGeneratedFor(value: unknown): AIMarksGeneratedFor | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const { mediaItemId, sourceStartFrame, sourceEndFrame } = value as Partial<AIMarksGeneratedFor>
  if (
    typeof mediaItemId !== 'string' ||
    typeof sourceStartFrame !== 'number' ||
    typeof sourceEndFrame !== 'number' ||
    !Number.isInteger(sourceStartFrame) ||
    !Number.isInteger(sourceEndFrame) ||
    sourceStartFrame < 0 ||
    sourceEndFrame <= sourceStartFrame
  ) {
    return undefined
  }

  return {
    mediaItemId,
    sourceStartFrame: Math.floor(sourceStartFrame),
    sourceEndFrame: Math.floor(sourceEndFrame),
  }
}

export function normalizeAIMarks(aiMarks: AIMarks | undefined): AIMarks | undefined {
  if (!aiMarks) {
    return undefined
  }

  const generatedFor = normalizeGeneratedFor(aiMarks.generatedFor)
  if (!generatedFor) {
    return undefined
  }

  const markBySourceFrame = new Map<number, AIMark>()
  for (const mark of aiMarks.marks ?? []) {
    if (
      !Number.isInteger(mark.sourceFrame) ||
      mark.sourceFrame < generatedFor.sourceStartFrame ||
      mark.sourceFrame >= generatedFor.sourceEndFrame ||
      !isAIMarkBeat(mark.beat)
    ) {
      continue
    }

    const sourceFrame = Math.floor(mark.sourceFrame)
    const existing = markBySourceFrame.get(sourceFrame)
    if (!existing || mark.beat === 1) {
      markBySourceFrame.set(sourceFrame, { sourceFrame, beat: mark.beat })
    }
  }

  return {
    mode: aiMarks.mode === 'beat1' || aiMarks.mode === 'beat1234' ? aiMarks.mode : 'none',
    marks: Array.from(markBySourceFrame.values()).sort((a, b) => a.sourceFrame - b.sourceFrame),
    generatedFor,
  }
}

export function cloneAIMarks(aiMarks: AIMarks | undefined): AIMarks | undefined {
  const normalized = normalizeAIMarks(aiMarks)
  return normalized && {
    mode: normalized.mode,
    marks: normalized.marks.map((mark) => ({ ...mark })),
    generatedFor: { ...normalized.generatedFor },
  }
}

/**
 * Returns the coverage state of persisted beats for the item's current source range.
 * The result is independent of the selected display mode.
 */
export function getAIMarksStatus(item: UnifiedTimelineItemData): AIMarksStatus {
  if (
    !isSourceBackedMediaType(item) ||
    item.timelineStatus !== 'ready' ||
    typeof item.mediaItemId !== 'string' ||
    getSourceDuration(item.timeRange) <= 0 ||
    getTimelineDuration(item.timeRange) <= 0
  ) {
    return 'unsupported'
  }

  if (!item.aiMarks) {
    return 'notGenerated'
  }

  const aiMarks = normalizeAIMarks(item.aiMarks)
  if (!aiMarks || aiMarks.generatedFor.mediaItemId !== item.mediaItemId) {
    return 'stale'
  }

  const { clipStartTime, clipEndTime } = item.timeRange
  const { sourceStartFrame, sourceEndFrame } = aiMarks.generatedFor
  if (sourceStartFrame <= clipStartTime && clipEndTime <= sourceEndFrame) {
    return 'available'
  }

  if (clipStartTime < sourceEndFrame && sourceStartFrame < clipEndTime) {
    return 'partial'
  }

  return 'stale'
}

/**
 * Resolves persistent source-frame marks to offsets in the current timeline item.
 * Hidden marks deliberately resolve to no UI or snapping targets by default.
 */
export function resolveAIMarksForTimelineItem(item: UnifiedTimelineItemData): ResolvedAIMarks {
  const status = getAIMarksStatus(item)
  const aiMarks = normalizeAIMarks(item.aiMarks)
  if (!aiMarks || (status !== 'available' && status !== 'partial') || aiMarks.mode === 'none') {
    return { status, marks: [] }
  }

  const markByOffset = new Map<number, ResolvedAIMark>()
  for (const mark of aiMarks.marks) {
    const offsetFrames = sourceFrameToTimelineOffset(item.timeRange, mark.sourceFrame)
    if (offsetFrames === undefined) {
      continue
    }

    const existing = markByOffset.get(offsetFrames)
    if (!existing || mark.beat === 1) {
      markByOffset.set(offsetFrames, { ...mark, offsetFrames })
    }
  }

  return {
    status,
    marks: Array.from(markByOffset.values()).sort((a, b) => a.offsetFrames - b.offsetFrames),
  }
}

/** Returns manual marker offsets that are visible inside the current clip. */
export function getVisibleManualTimelineMarkers(item: UnifiedTimelineItemData): number[] {
  return resolveTimelineMarkersForTimelineItem(item).map((marker) => marker.offsetFrames)
}

/** Returns the AI beats selected by the current display mode. */
export function getVisibleAIMarks(item: UnifiedTimelineItemData): ResolvedAIMark[] {
  return resolveAIMarksForTimelineItem(item).marks
}

function isTimelineAnchorSource(value: unknown): value is TimelineAnchorSource {
  return value === 'none' || value === 'music-structure' || value === 'beat-this'
}

/**
 * The explicit selection is authoritative. Older projects retain their former AI-beat
 * behavior until the user chooses a new automatic anchor source.
 */
export function getTimelineAnchorSource(
  item: UnifiedTimelineItemData,
  mediaItem?: UnifiedMediaItemData,
): TimelineAnchorSource {
  if (isTimelineAnchorSource(item.anchorSource)) {
    return item.anchorSource
  }

  if (
    item.musicStructureOverlay?.visible &&
    mediaItem?.metadata?.musicAnalysis?.editingAnchors?.length
  ) {
    return 'music-structure'
  }

  return getVisibleAIMarks(item).length > 0 ? 'beat-this' : 'none'
}

function isMusicAnalysisAnchor(value: unknown): value is MusicAnalysisAnchor {
  if (!value || typeof value !== 'object') return false
  const anchor = value as Partial<MusicAnalysisAnchor>
  return (
    typeof anchor.id === 'string' &&
    typeof anchor.time === 'number' &&
    Number.isFinite(anchor.time) &&
    anchor.time >= 0 &&
    typeof anchor.eventLabel === 'string' &&
    Array.isArray(anchor.roles) &&
    anchor.roles.every((role) => typeof role === 'string') &&
    typeof anchor.strength === 'number' &&
    Number.isFinite(anchor.strength)
  )
}

/** Resolves persisted music-analysis anchors to the current clip's timeline offsets. */
export function resolveMusicAnalysisAnchorsForTimelineItem(
  item: UnifiedTimelineItemData,
  mediaItem?: UnifiedMediaItemData,
): ResolvedMusicAnalysisAnchor[] {
  if (
    !isSourceBackedMediaType(item) ||
    item.timelineStatus !== 'ready' ||
    !item.mediaItemId ||
    !mediaItem ||
    mediaItem.id !== item.mediaItemId
  ) {
    return []
  }

  const anchorByOffset = new Map<number, ResolvedMusicAnalysisAnchor>()
  for (const anchor of mediaItem.metadata?.musicAnalysis?.editingAnchors ?? []) {
    if (!isMusicAnalysisAnchor(anchor)) continue

    const sourceFrame = Math.round(anchor.time * RENDERER_FPS)
    const offsetFrames = sourceFrameToTimelineOffset(item.timeRange, sourceFrame)
    if (offsetFrames === undefined) continue

    const existing = anchorByOffset.get(offsetFrames)
    if (!existing || anchor.strength > existing.strength) {
      anchorByOffset.set(offsetFrames, { ...anchor, sourceFrame, offsetFrames })
    }
  }

  return Array.from(anchorByOffset.values()).sort((left, right) => left.offsetFrames - right.offsetFrames)
}

/** Returns manual markers plus the selected automatic anchor source. */
export function getVisibleTimelineMarkers(
  item: UnifiedTimelineItemData,
  mediaItem?: UnifiedMediaItemData,
): number[] {
  const source = getTimelineAnchorSource(item, mediaItem)
  const automaticOffsets =
    source === 'music-structure'
      ? resolveMusicAnalysisAnchorsForTimelineItem(item, mediaItem).map((anchor) => anchor.offsetFrames)
      : source === 'beat-this'
        ? getVisibleAIMarks(item).map((mark) => mark.offsetFrames)
        : []

  return normalizeTimelineMarkerOffsets([
    ...getVisibleManualTimelineMarkers(item),
    ...automaticOffsets,
  ])
}

/** Returns markers that may be used as timeline snapping targets. */
export function getSnapTimelineMarkerOffsets(item: UnifiedTimelineItemData): number[] {
  return normalizeTimelineMarkerOffsets([
    ...getVisibleManualTimelineMarkers(item),
    ...resolveAIMarksForTimelineItem(item).marks.map((mark) => mark.offsetFrames),
  ])
}

/** Converts one clip-local marker offset to its absolute timeline frame. */
export function timelineMarkerToAbsoluteFrame(
  item: UnifiedTimelineItemData,
  markerOffset: number,
): number {
  return item.timeRange.timelineStartTime + markerOffset
}
