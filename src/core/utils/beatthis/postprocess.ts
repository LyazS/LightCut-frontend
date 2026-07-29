import type { AIMark } from '@/core/timelineitem/model/timelineItem'

const PEAK_RADIUS = 3

function deduplicatePeaks(peaks: readonly number[]): number[] {
  if (peaks.length === 0) {
    return []
  }

  const sorted = [...peaks].sort((left, right) => left - right)
  const result: number[] = []
  let current = sorted[0] ?? 0
  let count = 1

  for (const candidate of sorted.slice(1)) {
    if (candidate - current <= 1) {
      count += 1
      current += (candidate - current) / count
      continue
    }
    result.push(current)
    current = candidate
    count = 1
  }
  result.push(current)
  return result
}

export function collectChunkPeaks(
  logits: Float32Array,
  chunkStartFrame: number,
  firstFrameToKeep: number,
  totalFrameCount: number,
): number[] {
  const peaks: number[] = []
  const firstIndex = Math.max(6, firstFrameToKeep - chunkStartFrame)
  const lastIndex = Math.min(logits.length - 6, totalFrameCount - chunkStartFrame)

  for (let index = firstIndex; index < lastIndex; index++) {
    const logit = logits[index] ?? Number.NEGATIVE_INFINITY
    if (logit <= 0) {
      continue
    }

    let maximum = Number.NEGATIVE_INFINITY
    for (let neighbor = index - PEAK_RADIUS; neighbor <= index + PEAK_RADIUS; neighbor++) {
      maximum = Math.max(maximum, logits[neighbor] ?? Number.NEGATIVE_INFINITY)
    }
    if (logit === maximum) {
      peaks.push(chunkStartFrame + index)
    }
  }

  return peaks
}

export function postprocessBeatFrames(
  beatPeakFrames: readonly number[],
  downbeatPeakFrames: readonly number[],
): { beatFrames: number[]; downbeatFrames: number[] } {
  const beatFrames = deduplicatePeaks(beatPeakFrames)
  if (beatFrames.length === 0) {
    return { beatFrames, downbeatFrames: [] }
  }

  const snappedDownbeats = deduplicatePeaks(downbeatPeakFrames).map((downbeat) => {
    let closestBeat = beatFrames[0] ?? downbeat
    let closestDistance = Math.abs(closestBeat - downbeat)
    for (const beat of beatFrames.slice(1)) {
      const distance = Math.abs(beat - downbeat)
      if (distance < closestDistance) {
        closestBeat = beat
        closestDistance = distance
      }
    }
    return closestBeat
  })

  return {
    beatFrames,
    downbeatFrames: Array.from(new Set(snappedDownbeats)).sort((left, right) => left - right),
  }
}

function normalizeBeatNumber(counter: number): AIMark['beat'] {
  return (((counter - 1) % 4) + 1) as AIMark['beat']
}

/** Mirrors Beat This `infer_beat_numbers` after its minimal peak postprocessor. */
export function labelBeatFrames(
  beatFrames: readonly number[],
  downbeatFrames: readonly number[],
): Array<{ frame: number; beat: AIMark['beat'] }> {
  const downbeatIndices = downbeatFrames
    .map((downbeat) => beatFrames.findIndex((beat) => beat === downbeat))
    .filter((index) => index >= 0)

  const firstDownbeatIndex = downbeatIndices[0]
  const secondDownbeatIndex = downbeatIndices[1]
  const beatsInFirstMeasure =
    firstDownbeatIndex !== undefined && secondDownbeatIndex !== undefined
      ? secondDownbeatIndex - firstDownbeatIndex
      : 1
  let counter =
    firstDownbeatIndex !== undefined && firstDownbeatIndex < beatsInFirstMeasure
      ? beatsInFirstMeasure - firstDownbeatIndex
      : 1
  let nextDownbeatIndex = 0

  return beatFrames.map((frame, index) => {
    if (index === downbeatIndices[nextDownbeatIndex]) {
      counter = 1
      nextDownbeatIndex += 1
    } else {
      counter += 1
    }
    return { frame, beat: normalizeBeatNumber(counter) }
  })
}
