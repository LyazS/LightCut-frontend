import type { UnifiedTimelineItemData } from '@/core/timelineitem/model/timelineItem'
import type { UnifiedTimeRange } from '@/core/types/timeRange'

function getTimelineDuration(timeRange: UnifiedTimeRange): number {
  return Math.max(0, timeRange.timelineEndTime - timeRange.timelineStartTime)
}

/**
 * Normalizes clip-local marker offsets so they are safe to render and persist.
 */
export function normalizeTimelineMarkers(markers: number[] | undefined): number[] {
  return Array.from(
    new Set(
      (markers ?? [])
        .filter((marker) => Number.isInteger(marker) && marker >= 0)
        .map((marker) => Math.floor(marker)),
    ),
  ).sort((a, b) => a - b)
}

/**
 * Returns marker offsets that are visible inside the clip, including its end boundary.
 */
export function getVisibleTimelineMarkers(item: UnifiedTimelineItemData): number[] {
  const duration = getTimelineDuration(item.timeRange)
  return normalizeTimelineMarkers(item.markers).filter((marker) => marker <= duration)
}

/**
 * Converts one clip-local marker offset to its absolute timeline frame.
 */
export function timelineMarkerToAbsoluteFrame(
  item: UnifiedTimelineItemData,
  markerOffset: number,
): number {
  return item.timeRange.timelineStartTime + markerOffset
}

/**
 * Keeps only markers that survive a Trim and re-bases them to the new clip start.
 */
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

/**
 * Re-scales markers for resize mode, matching the existing keyframe behavior.
 */
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
 * Selects the markers that belong to a split fragment and re-bases them locally.
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
