import type { MusicAnalysisMetadata } from '@/core/mediaitem/types'

export const MUSIC_ANALYSIS_PIPELINE_VERSION = 'allinone-web-v1'
export const MUSIC_ANALYSIS_MIN_DURATION_SECONDS = 76
export const MUSIC_ANALYSIS_MAX_DURATION_SECONDS = 660
export const MUSIC_ANALYSIS_SAMPLE_RATE = 44_100

export type MusicAnalysisStage =
  | 'checking-model-cache'
  | 'decoding-audio'
  | 'separating-stems'
  | 'extracting-features'
  | 'running-ensemble'
  | 'decoding-structure'

export interface MusicAnalysisProgressEvent {
  stage: MusicAnalysisStage
  progress: number
  detail: string
}

export type MusicAnalysisResult = Omit<
  MusicAnalysisMetadata,
  'schemaVersion' | 'pipelineVersion' | 'analyzedAt'
>

export interface MusicAnalysisDetectorConfig {
  signal?: AbortSignal
  onProgress?: (event: MusicAnalysisProgressEvent) => void
}

export interface MusicAnalysisStartMessage {
  type: 'analyze'
  file: File
  expectedDurationSeconds: number
}

export type MusicAnalysisInboundMessage = MusicAnalysisStartMessage | { type: 'abort' }

export type MusicAnalysisWorkerMessage =
  | { type: 'progress'; event: MusicAnalysisProgressEvent }
  | { type: 'done'; result: MusicAnalysisResult }
  | { type: 'error'; message: string }
