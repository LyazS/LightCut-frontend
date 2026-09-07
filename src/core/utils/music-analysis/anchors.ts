import type { MusicAnalysisSegment } from '@/core/mediaitem/types'
import type { AcousticEvent, MusicAnalysisAnchor, MusicAnalysisResult } from './types'

const MERGE_TOLERANCE_SECONDS = 0.12
const MINIMUM_DISTANCE_SECONDS = 1.25
const BOUNDARY_SUPPRESSION_SECONDS = 0.35

type Source = 'section_boundary' | 'downbeat' | 'beat' | AcousticEvent['source']

interface RawAnchorEvent {
  time: number
  source: Source
  eventLabel: string
  score: number
  beat?: number
}

interface Candidate extends MusicAnalysisAnchor {
  sources: Source[]
  roleFamily: string | null
}

interface Section extends MusicAnalysisSegment {
  id: string
}

const SOURCE_ORDER: Source[] = [
  'section_boundary',
  'downbeat',
  'beat',
  'energy_change',
  'onset_change',
  'silence',
  'pitch_change',
]

function sourceOrder(source: Source): number {
  return SOURCE_ORDER.indexOf(source)
}

function sectionId(segments: MusicAnalysisSegment[]): Section[] {
  const occurrences = new Map<string, number>()
  return segments.map((segment) => {
    const slug = segment.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'section'
    const occurrence = (occurrences.get(slug) ?? 0) + 1
    occurrences.set(slug, occurrence)
    return { ...segment, id: `${slug}-${occurrence}` }
  })
}

function rolesFor(
  sources: Source[],
  eventLabels: string[],
  time: number,
  section: Section,
): string[] {
  const sourceSet = new Set(sources)
  const labels = new Set(eventLabels)
  const roles: string[] = []
  const isBoundary = sourceSet.has('section_boundary')
  const isAcoustic = sources.some((source) =>
    ['energy_change', 'onset_change', 'silence', 'pitch_change'].includes(source),
  )

  if (labels.has('section_entry') || (isBoundary && Math.abs(time - section.start) <= 0.001)) {
    roles.push('section_entry')
  }
  if (labels.has('section_exit') || (isBoundary && Math.abs(time - section.end) <= 0.001)) {
    roles.push('section_exit')
  }
  if (
    !isBoundary &&
    isAcoustic &&
    sourceSet.has('downbeat') &&
    Math.abs(time - section.start) <= BOUNDARY_SUPPRESSION_SECONDS
  ) {
    roles.push('section_entry')
  }
  if (
    !isBoundary &&
    isAcoustic &&
    sourceSet.has('downbeat') &&
    Math.abs(time - section.end) <= BOUNDARY_SUPPRESSION_SECONDS
  ) {
    roles.push('section_exit')
  }
  if (
    labels.has('energy_rise') ||
    labels.has('onset_entry')
  ) {
    roles.push('build_up')
  }
  if (
    labels.has('energy_peak') ||
    (sourceSet.has('downbeat') && (labels.has('energy_rise') || labels.has('onset_event')))
  ) {
    roles.push('impact')
  }
  if (labels.has('onset_entry') || labels.has('onset_exit') || labels.has('onset_event')) {
    roles.push('instrument_change')
  }
  if (labels.has('silence_enter') || labels.has('silence_exit')) roles.push('pause')
  if (labels.has('energy_fall') || labels.has('onset_exit') || labels.has('silence_enter')) {
    roles.push('release')
  }
  if (['pitch_rise', 'pitch_fall', 'pitch_entry', 'pitch_exit'].some((label) => labels.has(label))) {
    roles.push('melodic_turn')
  }
  if (sources.every((source) => source === 'beat' || source === 'downbeat')) {
    roles.push('rhythm_scaffold')
  }

  return [...new Set(roles)]
}

function roleFamily(roles: string[]): string | null {
  if (roles.includes('section_entry')) return 'section_entry'
  if (roles.includes('section_exit')) return 'section_exit'
  if (roles.includes('impact')) return 'impact'
  if (roles.includes('build_up') || roles.includes('release')) return 'build_release'
  if (roles.includes('instrument_change')) return 'instrument_change'
  if (roles.includes('pause') || roles.includes('melodic_turn')) return 'pause_melodic'
  if (roles.includes('rhythm_scaffold')) return 'rhythm_scaffold'
  return null
}

function rawEvents(
  analysis: MusicAnalysisResult,
  section: Section,
  acousticEvents: AcousticEvent[],
): RawAnchorEvent[] {
  const events: RawAnchorEvent[] = [
    { time: section.start, source: 'section_boundary', eventLabel: 'section_entry', score: 1 },
    { time: section.end, source: 'section_boundary', eventLabel: 'section_exit', score: 1 },
  ]
  analysis.downbeats.forEach((time) => {
    if (time >= section.start && time <= section.end) {
      events.push({ time, source: 'downbeat', eventLabel: 'downbeat', score: 1, beat: 1 })
    }
  })
  analysis.beats.forEach((time, index) => {
    if (
      time >= section.start &&
      time <= section.end &&
      !analysis.downbeats.some((downbeat) => Math.abs(downbeat - time) <= 0.001)
    ) {
      events.push({
        time,
        source: 'beat',
        eventLabel: 'beat',
        score: 1,
        beat: analysis.beatPositions[index],
      })
    }
  })
  acousticEvents.forEach((event) => {
    if (event.time >= section.start && event.time <= section.end) {
      events.push({
        time: event.time,
        source: event.source,
        eventLabel: event.eventLabel,
        score: event.score,
      })
    }
  })
  return events.sort(
    (left, right) =>
      left.time - right.time ||
      sourceOrder(left.source) - sourceOrder(right.source) ||
      left.eventLabel.localeCompare(right.eventLabel),
  )
}

function mergeSection(section: Section, events: RawAnchorEvent[]): Candidate[] {
  const clusters: RawAnchorEvent[][] = []
  events.forEach((event) => {
    const previous = clusters[clusters.length - 1]
    const canMerge =
      previous &&
      event.time - previous[0]!.time <= MERGE_TOLERANCE_SECONDS &&
      !(event.source === 'section_boundary' && previous.some((item) => item.source === 'section_boundary'))
    if (canMerge) previous.push(event)
    else clusters.push([event])
  })

  return clusters.map((cluster) => {
    const sources = SOURCE_ORDER.filter((source) => cluster.some((event) => event.source === source))
    const eventLabels = [...new Set(cluster.map((event) => event.eventLabel))]
    const timeEvent =
      cluster.find((event) => event.source === 'section_boundary') ??
      cluster.find((event) => event.source === 'downbeat') ??
      cluster.find((event) => event.source === 'beat') ??
      cluster.reduce((best, event) => (event.score > best.score ? event : best))
    const strength = Math.max(
      0,
      ...cluster
        .filter((event) => !['section_boundary', 'downbeat', 'beat'].includes(event.source))
        .map((event) => event.score),
    )
    const localScore = Math.min(
      1,
      (sources.includes('downbeat') ? 0.35 : 0) +
        (sources.includes('energy_change') ? 0.25 : 0) +
        (sources.includes('onset_change') ? 0.2 : 0) +
        (sources.includes('silence') ? 0.15 : 0) +
        (sources.includes('pitch_change') ? 0.05 : 0) +
        (sources.includes('section_boundary') ? 0.15 : 0),
    )
    const time = Math.round(timeEvent.time * 1000) / 1000
    const roles = rolesFor(sources, eventLabels, time, section)
    return {
      id: `${section.id}:a-${String(Math.round(time * 1000)).padStart(6, '0')}`,
      time,
      eventLabel: eventLabels[0] ?? 'anchor',
      roles,
      strength: Math.round(Math.max(strength, localScore) * 1000) / 1000,
      sources,
      roleFamily: roleFamily(roles),
    }
  })
}

function priority(candidate: Candidate, section: Section): number {
  let score = candidate.strength
  const acousticCount = candidate.sources.filter((source) =>
    ['energy_change', 'onset_change', 'silence', 'pitch_change'].includes(source),
  ).length
  if (acousticCount >= 2) score += 0.08
  if (candidate.sources.includes('silence')) score += 0.2
  if (['onset_entry', 'onset_exit', 'pitch_entry', 'pitch_exit'].includes(candidate.eventLabel)) {
    score += 0.12
  }
  if (['energy_rise', 'energy_fall', 'energy_peak'].includes(candidate.eventLabel)) score += 0.08
  if (candidate.sources.includes('downbeat') && acousticCount) score += 0.05
  if (candidate.sources.every((source) => source === 'beat' || source === 'downbeat')) score -= 0.12
  if (
    !candidate.sources.includes('section_boundary') &&
    Math.min(Math.abs(candidate.time - section.start), Math.abs(candidate.time - section.end)) <=
      BOUNDARY_SUPPRESSION_SECONDS
  ) {
    score -= 0.2
  }
  return score
}

function selectCandidates(section: Section, merged: Candidate[]): Candidate[] {
  const boundaries = merged.filter((candidate) => candidate.sources.includes('section_boundary'))
  const ordinary = merged.filter((candidate) => !candidate.sources.includes('section_boundary'))
  const budget = Math.max(4, Math.min(8, Math.round((section.end - section.start) / 4)))
  const selected: Candidate[] = []
  const familyCounts = new Map<string, number>()
  const candidates = ordinary
    .filter((candidate) => {
      const nearBoundary =
        Math.min(Math.abs(candidate.time - section.start), Math.abs(candidate.time - section.end)) <=
        BOUNDARY_SUPPRESSION_SECONDS
      return !nearBoundary && candidate.roleFamily !== null
    })
    .sort((left, right) => priority(right, section) - priority(left, section) || left.time - right.time)

  const roleLimit: Record<string, number> = {
    impact: 2,
    build_release: 2,
    instrument_change: 2,
    pause_melodic: 1,
    rhythm_scaffold: 1,
  }
  for (const candidate of candidates) {
    if (selected.length >= budget || !candidate.roleFamily) break
    if ((familyCounts.get(candidate.roleFamily) ?? 0) >= (roleLimit[candidate.roleFamily] ?? 0)) {
      continue
    }
    if (selected.some((item) => Math.abs(item.time - candidate.time) < MINIMUM_DISTANCE_SECONDS)) {
      continue
    }
    selected.push(candidate)
    familyCounts.set(candidate.roleFamily, (familyCounts.get(candidate.roleFamily) ?? 0) + 1)
  }
  return [...boundaries, ...selected].sort((left, right) => left.time - right.time)
}

/**
 * Produces the sparse, deterministic layer used by the editor. Detailed acoustic
 * evidence remains inside the worker and is deliberately not persisted in project metadata.
 */
export function buildMusicAnalysisAnchors(
  analysis: MusicAnalysisResult,
  acousticEvents: AcousticEvent[],
): MusicAnalysisAnchor[] {
  const byTime = new Map<number, MusicAnalysisAnchor>()
  for (const section of sectionId(analysis.segments)) {
    for (const candidate of selectCandidates(section, mergeSection(section, rawEvents(analysis, section, acousticEvents)))) {
      const timeKey = Math.round(candidate.time * 1000)
      const existing = byTime.get(timeKey)
      if (!existing) {
        byTime.set(timeKey, {
          id: candidate.id,
          time: candidate.time,
          eventLabel: candidate.eventLabel,
          roles: candidate.roles,
          strength: candidate.strength,
        })
        continue
      }
      existing.roles = [...new Set([...existing.roles, ...candidate.roles])]
      existing.strength = Math.max(existing.strength, candidate.strength)
      if (candidate.eventLabel !== 'section_exit') existing.eventLabel = candidate.eventLabel
    }
  }
  return [...byTime.values()].sort((left, right) => left.time - right.time || left.id.localeCompare(right.id))
}
