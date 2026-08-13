import type { MusicAnalysisResult } from './types'

interface DecodedBeats {
  beats: number[]
  positions: number[]
  meter: number
}

export type DownbeatDecoder = (activations: Float32Array) => DecodedBeats

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value))
}

function slidingMaximum(values: Float32Array, windowSize: number): Float32Array {
  const result = new Float32Array(values.length - windowSize + 1)
  const deque: number[] = []
  for (let index = 0; index < values.length; index += 1) {
    while (deque.length && values[deque[deque.length - 1]!] < values[index]!) deque.pop()
    deque.push(index)
    if (deque[0]! <= index - windowSize) deque.shift()
    if (index >= windowSize - 1) result[index - windowSize + 1] = values[deque[0]!]!
  }
  return result
}

function postprocessStructure(sectionLogits: Float32Array, functionLogits: Float32Array) {
  const length = sectionLogits.length
  const functionProbabilities = new Float32Array(functionLogits.length)
  for (let frame = 0; frame < length; frame += 1) {
    let maximum = -Infinity
    for (let category = 0; category < 10; category += 1) {
      maximum = Math.max(maximum, functionLogits[category * length + frame]!)
    }
    let total = 0
    for (let category = 0; category < 10; category += 1) {
      const value = Math.exp(functionLogits[category * length + frame]! - maximum)
      functionProbabilities[category * length + frame] = value
      total += value
    }
    for (let category = 0; category < 10; category += 1) {
      functionProbabilities[category * length + frame]! /= total
    }
  }

  const sections = new Float32Array(length)
  for (let index = 0; index < length; index += 1) sections[index] = sigmoid(sectionLogits[index]!)
  const padding = 48
  const paddedSections = new Float32Array(length + padding * 2)
  paddedSections.fill(-Infinity)
  paddedSections.set(sections, padding)
  const maxima = slidingMaximum(paddedSections, padding * 2 + 1)
  const localMaxima = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    localMaxima[index] = sections[index] === maxima[index] ? sections[index]! : 0
  }

  const past = 1_200
  const future = 1_200
  const padded = new Float32Array(length + past + future)
  padded.set(localMaxima, past)
  const maxValues = slidingMaximum(padded, past + future + 1)
  const sums = new Float64Array(padded.length + 1)
  for (let index = 0; index < padded.length; index += 1) {
    sums[index + 1] = sums[index]! + padded[index]!
  }
  const boundaries: number[] = []
  for (let index = 0; index < length; index += 1) {
    const value = localMaxima[index]!
    const previousMean = (sums[index + past]! - sums[index]!) / past
    const futureMean = (sums[index + past + future + 1]! - sums[index + past + 1]!) / future
    if (value === maxValues[index] && value > 0 && value - (previousMean + futureMean) / 2 > 0) {
      boundaries.push(index)
    }
  }

  const labels = [
    'start',
    'end',
    'intro',
    'outro',
    'break',
    'bridge',
    'inst',
    'solo',
    'verse',
    'chorus',
  ]
  const splits = boundaries.filter((boundary) => boundary > 0)
  const timeBoundaries =
    boundaries.length && boundaries[0] === 0 ? [...boundaries] : [0, ...boundaries]
  const duration = length / 100
  if (timeBoundaries[timeBoundaries.length - 1] !== length) timeBoundaries.push(length)
  const segmentStarts = [0, ...splits]
  const segmentEnds = [...splits, length]

  return segmentStarts.map((start, segment) => {
    const end = segmentEnds[segment]!
    let label = 0
    let labelScore = -Infinity
    for (let category = 0; category < labels.length; category += 1) {
      let score = 0
      for (let frame = start; frame < end; frame += 1) {
        score += functionProbabilities[category * length + frame]!
      }
      const mean = score / Math.max(1, end - start)
      if (mean > labelScore) {
        label = category
        labelScore = mean
      }
    }
    return {
      start: timeBoundaries[segment]! / 100,
      end: segment === timeBoundaries.length - 2 ? duration : timeBoundaries[segment + 1]! / 100,
      label: labels[label]!,
    }
  })
}

function estimateTempo(beats: number[]): number | null {
  if (beats.length < 2) return null
  const counts = new Map<number, number>()
  for (let index = 1; index < beats.length; index += 1) {
    const bpm = Math.round(60 / (beats[index]! - beats[index - 1]!))
    counts.set(bpm, (counts.get(bpm) ?? 0) + 1)
  }
  let tempo = 0
  let count = -1
  counts.forEach((value, bpm) => {
    if (value > count || (value === count && bpm > tempo)) {
      tempo = bpm
      count = value
    }
  })
  return tempo
}

export function analyzeLogits(
  beatLogits: Float32Array,
  downbeatLogits: Float32Array,
  sectionLogits: Float32Array,
  functionLogits: Float32Array,
  decodeDownbeats: DownbeatDecoder,
): MusicAnalysisResult {
  const length = beatLogits.length
  const activations = new Float32Array(length * 2)
  for (let index = 0; index < length; index += 1) {
    const beat = sigmoid(beatLogits[index]!)
    const downbeat = sigmoid(downbeatLogits[index]!)
    const ordinary = Math.max(1e-8, beat - downbeat)
    const none = (1 - beat + (1 - downbeat)) / 2
    const total = ordinary + downbeat + none
    activations[index * 2] = ordinary / total
    activations[index * 2 + 1] = downbeat / total
  }
  const decoded = decodeDownbeats(activations)
  return {
    input: {
      durationSeconds: length / 100,
      sampleRate: 44_100,
    },
    bpm: estimateTempo(decoded.beats),
    beats: decoded.beats,
    downbeats: decoded.beats.filter((_, index) => decoded.positions[index] === 1),
    beatPositions: decoded.positions,
    segments: postprocessStructure(sectionLogits, functionLogits),
    meter: decoded.meter,
  }
}
