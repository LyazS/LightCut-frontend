import type {
  AIMark,
  AIMarks,
  AIMarksGeneratedFor,
  UnifiedTimelineItemData,
} from '@/core/timelineitem/model/timelineItem'
import type { UnifiedTimeRange } from '@/core/types/timeRange'

export type AIMarksStatus = 'available' | 'partial' | 'stale' | 'notGenerated' | 'unsupported'

export interface ResolvedAIMark extends AIMark {
  /** 当前片段中的时间轴本地偏移量，由 sourceFrame 派生。 */
  offsetFrames: number
}

export interface ResolvedAIMarks {
  status: AIMarksStatus
  marks: ResolvedAIMark[]
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

/** Normalizes clip-local manual marker offsets so they are safe to render and persist. */
export function normalizeTimelineMarkers(markers: number[] | undefined): number[] {
  return Array.from(
    new Set(
      (markers ?? [])
        .filter((marker) => Number.isInteger(marker) && marker >= 0)
        .map((marker) => Math.floor(marker)),
    ),
  ).sort((a, b) => a - b)
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

  const sourceDurationFrames = getSourceDuration(item.timeRange)
  const timelineDurationFrames = getTimelineDuration(item.timeRange)
  const { clipStartTime, clipEndTime } = item.timeRange
  const markByOffset = new Map<number, ResolvedAIMark>()

  for (const mark of aiMarks.marks) {
    if (mark.sourceFrame < clipStartTime || mark.sourceFrame >= clipEndTime) {
      continue
    }

    const offsetFrames = Math.round(
      ((mark.sourceFrame - clipStartTime) / sourceDurationFrames) * timelineDurationFrames,
    )
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

/** Returns manual marker offsets that are visible inside the clip, including its end boundary. */
export function getVisibleManualTimelineMarkers(item: UnifiedTimelineItemData): number[] {
  const duration = getTimelineDuration(item.timeRange)
  return normalizeTimelineMarkers(item.markers).filter((marker) => marker <= duration)
}

/** Returns the AI beats selected by the current display mode. */
export function getVisibleAIMarks(item: UnifiedTimelineItemData): ResolvedAIMark[] {
  return resolveAIMarksForTimelineItem(item).marks
}

/** Returns manual markers and the AI marks selected by the current display mode. */
export function getVisibleTimelineMarkers(item: UnifiedTimelineItemData): number[] {
  return normalizeTimelineMarkers([
    ...getVisibleManualTimelineMarkers(item),
    ...getVisibleAIMarks(item).map((mark) => mark.offsetFrames),
  ])
}

/** Returns markers that may be used as timeline snapping targets. */
export function getSnapTimelineMarkerOffsets(item: UnifiedTimelineItemData): number[] {
  return normalizeTimelineMarkers([
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

/** Keeps only manual markers that survive a trim and re-bases them to the new clip start. */
export function trimTimelineMarkers(
  markers: number[] | undefined,
  originalTimeRange: UnifiedTimeRange,
  nextTimeRange: UnifiedTimeRange,
): number[] {
  const originalStart = originalTimeRange.timelineStartTime
  const nextStart = nextTimeRange.timelineStartTime
  const nextEnd = nextTimeRange.timelineEndTime

  return normalizeTimelineMarkers(markers)
    .map((marker) => originalStart + marker)
    .filter((absoluteFrame) => absoluteFrame >= nextStart && absoluteFrame <= nextEnd)
    .map((absoluteFrame) => absoluteFrame - nextStart)
}

/** Re-scales manual markers for resize mode. */
export function resizeTimelineMarkers(
  markers: number[] | undefined,
  originalTimeRange: UnifiedTimeRange,
  nextTimeRange: UnifiedTimeRange,
): number[] {
  const originalDuration = getTimelineDuration(originalTimeRange)
  const nextDuration = getTimelineDuration(nextTimeRange)
  if (originalDuration === 0 || nextDuration === 0) {
    return []
  }

  return normalizeTimelineMarkers(markers)
    .filter((marker) => marker <= originalDuration)
    .map((marker) => Math.round((marker / originalDuration) * nextDuration))
    .filter((marker) => marker <= nextDuration)
    .filter((marker) => marker >= 0)
}

/**
 * Selects manual markers that belong to a split fragment and re-bases them locally.
 * A marker on a split boundary belongs to the fragment on its right. A marker on the
 * original clip's end boundary belongs to the final fragment.
 */
export function splitTimelineMarkers(
  markers: number[] | undefined,
  originalTimeRange: UnifiedTimeRange,
  fragmentTimeRange: UnifiedTimeRange,
): number[] {
  const originalStart = originalTimeRange.timelineStartTime
  const originalEnd = originalTimeRange.timelineEndTime
  const fragmentStart = fragmentTimeRange.timelineStartTime
  const fragmentEnd = fragmentTimeRange.timelineEndTime

  return normalizeTimelineMarkers(markers)
    .map((marker) => originalStart + marker)
    .filter(
      (absoluteFrame) =>
        absoluteFrame >= fragmentStart &&
        (absoluteFrame < fragmentEnd ||
          (absoluteFrame === originalEnd && fragmentEnd === originalEnd)),
    )
    .map((absoluteFrame) => absoluteFrame - fragmentStart)
}
