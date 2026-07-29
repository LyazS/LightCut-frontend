import type {
  AIMark,
  AIMarks,
  UnifiedTimelineItemData,
} from '@/core/timelineitem/model/timelineItem'
import type { UnifiedTimeRange } from '@/core/types/timeRange'

function getTimelineDuration(timeRange: UnifiedTimeRange): number {
  return Math.max(0, timeRange.timelineEndTime - timeRange.timelineStartTime)
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

export function normalizeAIMarks(aiMarks: AIMarks | undefined): AIMarks | undefined {
  if (!aiMarks) {
    return undefined
  }

  const markByOffset = new Map<number, AIMark>()
  for (const mark of aiMarks.marks ?? []) {
    if (!Number.isInteger(mark.offsetFrames) || mark.offsetFrames < 0 || !isAIMarkBeat(mark.beat)) {
      continue
    }

    const offsetFrames = Math.floor(mark.offsetFrames)
    const existing = markByOffset.get(offsetFrames)
    if (!existing || mark.beat === 1) {
      markByOffset.set(offsetFrames, { offsetFrames, beat: mark.beat })
    }
  }

  return {
    mode: aiMarks.mode === 'beat1' || aiMarks.mode === 'beat1234' ? aiMarks.mode : 'none',
    marks: Array.from(markByOffset.values()).sort((a, b) => a.offsetFrames - b.offsetFrames),
  }
}

export function cloneAIMarks(aiMarks: AIMarks | undefined): AIMarks | undefined {
  const normalized = normalizeAIMarks(aiMarks)
  return normalized && {
    mode: normalized.mode,
    marks: normalized.marks.map((mark) => ({ ...mark })),
  }
}

/** Returns manual marker offsets that are visible inside the clip, including its end boundary. */
export function getVisibleManualTimelineMarkers(item: UnifiedTimelineItemData): number[] {
  const duration = getTimelineDuration(item.timeRange)
  return normalizeTimelineMarkers(item.markers).filter((marker) => marker <= duration)
}

/** Returns the complete stored AI result, independent of the current display mode. */
export function getStoredAIMarks(item: UnifiedTimelineItemData): AIMark[] {
  const duration = getTimelineDuration(item.timeRange)
  return (normalizeAIMarks(item.aiMarks)?.marks ?? []).filter(
    (mark) => mark.offsetFrames <= duration,
  )
}

/** Returns the AI beats selected by the current display mode. */
export function getVisibleAIMarks(item: UnifiedTimelineItemData): AIMark[] {
  const aiMarks = normalizeAIMarks(item.aiMarks)
  if (!aiMarks || aiMarks.mode === 'none') {
    return []
  }

  const storedMarks = getStoredAIMarks(item)
  return aiMarks.mode === 'beat1' ? storedMarks.filter((mark) => mark.beat === 1) : storedMarks
}

/** Returns manual markers and the AI marks selected by the current display mode. */
export function getVisibleTimelineMarkers(item: UnifiedTimelineItemData): number[] {
  return normalizeTimelineMarkers([
    ...getVisibleManualTimelineMarkers(item),
    ...getVisibleAIMarks(item).map((mark) => mark.offsetFrames),
  ])
}

/** Returns manual markers plus all stored AI beats for timeline snapping. */
export function getSnapTimelineMarkerOffsets(item: UnifiedTimelineItemData): number[] {
  return normalizeTimelineMarkers([
    ...getVisibleManualTimelineMarkers(item),
    ...getStoredAIMarks(item).map((mark) => mark.offsetFrames),
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

function transformAIMarks(
  aiMarks: AIMarks | undefined,
  transform: (mark: AIMark) => AIMark | undefined,
): AIMarks | undefined {
  const normalized = normalizeAIMarks(aiMarks)
  if (!normalized) {
    return undefined
  }

  return normalizeAIMarks({
    mode: normalized.mode,
    marks: normalized.marks
      .map(transform)
      .filter((mark): mark is AIMark => mark !== undefined),
  })
}

export function trimAIMarks(
  aiMarks: AIMarks | undefined,
  originalTimeRange: UnifiedTimeRange,
  nextTimeRange: UnifiedTimeRange,
): AIMarks | undefined {
  const originalStart = originalTimeRange.timelineStartTime
  const nextStart = nextTimeRange.timelineStartTime
  const nextEnd = nextTimeRange.timelineEndTime

  return transformAIMarks(aiMarks, (mark) => {
    const absoluteFrame = originalStart + mark.offsetFrames
    if (absoluteFrame < nextStart || absoluteFrame > nextEnd) {
      return undefined
    }
    return { ...mark, offsetFrames: absoluteFrame - nextStart }
  })
}

export function resizeAIMarks(
  aiMarks: AIMarks | undefined,
  originalTimeRange: UnifiedTimeRange,
  nextTimeRange: UnifiedTimeRange,
): AIMarks | undefined {
  const originalDuration = getTimelineDuration(originalTimeRange)
  const nextDuration = getTimelineDuration(nextTimeRange)
  if (originalDuration === 0 || nextDuration === 0) {
    return aiMarks ? { mode: normalizeAIMarks(aiMarks)?.mode ?? 'none', marks: [] } : undefined
  }

  return transformAIMarks(aiMarks, (mark) => {
    if (mark.offsetFrames > originalDuration) {
      return undefined
    }
    const offsetFrames = Math.round((mark.offsetFrames / originalDuration) * nextDuration)
    return offsetFrames >= 0 && offsetFrames <= nextDuration ? { ...mark, offsetFrames } : undefined
  })
}

export function splitAIMarks(
  aiMarks: AIMarks | undefined,
  originalTimeRange: UnifiedTimeRange,
  fragmentTimeRange: UnifiedTimeRange,
): AIMarks | undefined {
  const originalStart = originalTimeRange.timelineStartTime
  const originalEnd = originalTimeRange.timelineEndTime
  const fragmentStart = fragmentTimeRange.timelineStartTime
  const fragmentEnd = fragmentTimeRange.timelineEndTime

  return transformAIMarks(aiMarks, (mark) => {
    const absoluteFrame = originalStart + mark.offsetFrames
    const belongsToFragment =
      absoluteFrame >= fragmentStart &&
      (absoluteFrame < fragmentEnd ||
        (absoluteFrame === originalEnd && fragmentEnd === originalEnd))
    return belongsToFragment ? { ...mark, offsetFrames: absoluteFrame - fragmentStart } : undefined
  })
}
