import type { AIMark } from '@/core/timelineitem/model/timelineItem'

export const BEAT_THIS_MODEL_ID = 'beat_this_small0'
export const BEAT_THIS_SAMPLE_RATE = 22050
export const BEAT_THIS_HOP_LENGTH = 441
export const BEAT_THIS_FEATURE_FPS = BEAT_THIS_SAMPLE_RATE / BEAT_THIS_HOP_LENGTH
export const BEAT_THIS_MEL_BINS = 128
export const BEAT_THIS_CHUNK_SIZE = 1500
export const BEAT_THIS_BORDER_SIZE = 6
export const BEAT_THIS_CHUNK_STEP = BEAT_THIS_CHUNK_SIZE - BEAT_THIS_BORDER_SIZE * 2

export type BeatThisProgressStage =
  | 'loading-model'
  | 'checking-cache'
  | 'loading-from-cache'
  | 'downloading-model'
  | 'initializing-model'
  | 'model-ready'
  | 'decoding-audio'
  | 'extracting-features'
  | 'detecting-beats'
  | 'finalizing-beats'

export interface BeatThisProgressEvent {
  current: number
  total: number
  stage: BeatThisProgressStage
  progress?: number
  loadedBytes?: number
  totalBytes?: number
  audioCurrentSeconds?: number
  audioTotalSeconds?: number
}

export interface BeatThisDetectorConfig {
  signal?: AbortSignal
  onProgress?: (event: BeatThisProgressEvent) => void
}

export type BeatThisMarks = AIMark[]
