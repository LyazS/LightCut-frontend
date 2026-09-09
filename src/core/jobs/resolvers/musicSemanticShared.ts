import { fetchClient, sleepWithAbortSignal } from '@/utils/fetchClient'
import { DashScopeTemporaryFileUploader } from '@/core/utils/dashscopeTemporaryFileUploader'
import { exportMediaItemAudio, exportMediaItemAudioWindow } from '@/core/utils/mediaExporter'
import { globalMetaFileManager } from '@/core/managers/media/globalMetaFileManager'
import type {
  MusicSemanticMetadata,
  MusicSemanticResult as FrontendMusicSemanticResult,
  UnifiedMediaItemData,
} from '@/core/mediaitem/types'
import type { UnifiedMediaModule } from '@/core/modules/UnifiedMediaModule'
import type { FinalEvent, TaskStreamEvent } from '@/core/datasource/providers/ai-generation/types'
import { TaskStatus, TaskStreamEventType } from '@/core/datasource/providers/ai-generation/types'
import type { ResourcePolicy, ResourceRequest } from '../ResourceTypes'

export const MUSIC_SEMANTIC_TASK_SUBMIT_RESOURCE_TYPE = 'music-semantic-task-submit'
export const MUSIC_SEMANTIC_TASK_COMPLETE_RESOURCE_TYPE = 'music-semantic-task-complete'
export const MUSIC_SEMANTIC_METADATA_WRITEBACK_RESOURCE_TYPE = 'music-semantic-metadata-writeback'

export interface MusicSemanticTaskSubmitResult {
  mediaId: string
  taskId: string
}
export interface MusicSemanticTaskCompleteResult {
  mediaId: string
  taskId: string
  result: FrontendMusicSemanticResult
}
export interface MusicSemanticModule extends Pick<UnifiedMediaModule, 'getMediaItem'> {
  ensureMediaReady(mediaId: string): Promise<unknown>
  ensureMusicStructureAnalysis(mediaId: string): Promise<unknown>
}

export function createMusicSemanticTaskSubmitRequest(
  mediaId: string,
  policy?: ResourcePolicy,
): ResourceRequest<{ mediaId: string }> {
  return {
    type: MUSIC_SEMANTIC_TASK_SUBMIT_RESOURCE_TYPE,
    key: mediaId,
    input: { mediaId },
    policy: { queue: 'ai-remote', ...policy },
  }
}
export function createMusicSemanticTaskCompleteRequest(
  mediaId: string,
  policy?: ResourcePolicy,
): ResourceRequest<{ mediaId: string }> {
  return {
    type: MUSIC_SEMANTIC_TASK_COMPLETE_RESOURCE_TYPE,
    key: mediaId,
    input: { mediaId },
    policy: { queue: 'ai-remote', ...policy },
  }
}
export function createMusicSemanticMetadataWritebackRequest(
  mediaId: string,
  policy?: ResourcePolicy,
): ResourceRequest<{ mediaId: string }> {
  return {
    type: MUSIC_SEMANTIC_METADATA_WRITEBACK_RESOURCE_TYPE,
    key: mediaId,
    input: { mediaId },
    policy: { queue: 'background', ...policy },
  }
}

export function setMusicSemanticMetadata(
  mediaItem: UnifiedMediaItemData,
  patch: Partial<MusicSemanticMetadata>,
): void {
  mediaItem.metadata = {
    ...mediaItem.metadata,
    musicSemantic: { ...(mediaItem.metadata?.musicSemantic ?? { status: 'pending' }), ...patch },
  }
}
export async function persistMusicSemantic(mediaItem: UnifiedMediaItemData): Promise<void> {
  if (!(await globalMetaFileManager.saveMetaFile(mediaItem)))
    throw new Error(`保存音乐语义元数据失败: ${mediaItem.name}`)
}
export function shouldRecoverMusicSemantic(metadata: MusicSemanticMetadata | undefined): boolean {
  return metadata?.status === 'pending' || metadata?.status === 'processing'
}
export function getMusicSemanticTaskId(mediaItem: UnifiedMediaItemData): string | undefined {
  const taskId = mediaItem.metadata?.musicSemantic?.lastTaskId
  return typeof taskId === 'string' && taskId.trim() ? taskId : undefined
}
export function canResumeMusicSemanticFromRemote(
  metadata: MusicSemanticMetadata | undefined,
): boolean {
  return shouldRecoverMusicSemantic(metadata) && Boolean(metadata?.lastTaskId)
}

function normalizeMusicSemanticResult(raw: unknown): FrontendMusicSemanticResult {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const global = (value.global ?? value.global_ ?? {}) as Record<string, unknown>
  const sections = Array.isArray(value.sections) ? value.sections : []
  const rawFailedSections = value.failedSectionIds ?? value.failed_section_ids
  const stringValue = (candidate: unknown, fallback = ''): string =>
    typeof candidate === 'string' ? candidate : fallback
  return {
    global: {
      genres: Array.isArray(global.genres) ? global.genres : [],
      rhythm: stringValue(global.rhythm),
      energyArc: stringValue(global.energyArc ?? global.energy_arc),
    },
    sections: sections.map((section) => {
      const sectionRecord = (section && typeof section === 'object' ? section : {}) as Record<
        string,
        unknown
      >
      const semantic = (
        sectionRecord.semantic && typeof sectionRecord.semantic === 'object'
          ? sectionRecord.semantic
          : {}
      ) as FrontendMusicSemanticResult['sections'][number]['semantic']
      const refinement = (
        sectionRecord.refinement && typeof sectionRecord.refinement === 'object'
          ? sectionRecord.refinement
          : {}
      ) as Record<string, unknown>
      const anchors = Array.isArray(refinement.anchors) ? refinement.anchors : []
      return {
        sectionId: stringValue(sectionRecord.sectionId ?? sectionRecord.section_id),
        start: Number(sectionRecord.start ?? 0),
        end: Number(sectionRecord.end ?? 0),
        semantic,
        refinement: {
          status: refinement.status === 'completed' ? 'completed' : 'local_fallback',
          editingNotes: stringValue(refinement.editingNotes ?? refinement.editing_notes),
          shotPace: stringValue(
            refinement.shotPace ?? refinement.shot_pace,
            '无法判断',
          ) as FrontendMusicSemanticResult['sections'][number]['refinement']['shotPace'],
          anchors: anchors.map((anchor) => {
            const anchorRecord = (anchor && typeof anchor === 'object' ? anchor : {}) as Record<
              string,
              unknown
            >
            const rawUses = anchorRecord.recommendedUses ?? anchorRecord.recommended_uses
            return {
              anchorId: stringValue(anchorRecord.anchorId ?? anchorRecord.anchor_id),
              time: Number(anchorRecord.time ?? 0),
              eventLabel: stringValue(anchorRecord.eventLabel ?? anchorRecord.event_label),
              roles: Array.isArray(anchorRecord.roles)
                ? anchorRecord.roles.filter((role): role is string => typeof role === 'string')
                : [],
              strength: Number(anchorRecord.strength ?? 0),
              decision: stringValue(
                anchorRecord.decision,
              ) as FrontendMusicSemanticResult['sections'][number]['refinement']['anchors'][number]['decision'],
              recommendedUses: Array.isArray(rawUses)
                ? rawUses.filter((item): item is string => typeof item === 'string')
                : [],
              reason: stringValue(anchorRecord.reason),
            }
          }),
        },
      }
    }),
    status: value.status === 'partial_failed' ? 'partial_failed' : 'completed',
    failedSectionIds: Array.isArray(rawFailedSections)
      ? rawFailedSections.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

export async function prepareMusicSemanticTaskInput(
  module: MusicSemanticModule,
  mediaId: string,
  signal: AbortSignal,
  onProgress: (progress: number, stage: string) => void,
): Promise<Record<string, unknown>> {
  const mediaItem = module.getMediaItem(mediaId)
  if (!mediaItem || (mediaItem.mediaType !== 'audio' && mediaItem.mediaType !== 'video'))
    throw new Error('仅音频或视频素材支持音乐语义分析')
  await module.ensureMediaReady(mediaId)
  const analysis = mediaItem.metadata?.musicAnalysis
  if (!analysis) {
    await module.ensureMusicStructureAnalysis(mediaId)
  }
  const currentAnalysis = mediaItem.metadata?.musicAnalysis
  if (!currentAnalysis) throw new Error('音乐结构分析尚未完成')
  onProgress(0.1, 'preparing-audio')
  const blob = await exportMediaItemAudio(mediaItem, (p) =>
    onProgress(0.1 + (p / 100) * 0.3, 'exporting-audio'),
  )
  if (signal.aborted) throw new DOMException('音乐语义分析已取消', 'AbortError')
  const uploaded = await DashScopeTemporaryFileUploader.uploadBlob(
    blob,
    `${mediaItem.name}.mp3`,
    'music-semantic',
    (p) => onProgress(0.4 + (p / 100) * 0.2, 'uploading-audio'),
  )
  if (!uploaded.success || !uploaded.url) throw new Error(uploaded.error || '音乐语义音频上传失败')
  const sections = []
  const durationSeconds = currentAnalysis.input.durationSeconds
  for (const [index, segment] of currentAnalysis.segments.entries()) {
    const fraction = index / Math.max(1, currentAnalysis.segments.length)
    const windowStart = Math.max(0, segment.start - 2)
    const windowEnd = Math.min(durationSeconds, segment.end + 2)
    const sectionAudio = await exportMediaItemAudioWindow(mediaItem, windowStart, windowEnd, (p) =>
      onProgress(
        0.6 + (fraction + p / 100 / currentAnalysis.segments.length) * 0.25,
        'exporting-section-audio',
      ),
    )
    const uploadedSection = await DashScopeTemporaryFileUploader.uploadBlob(
      sectionAudio,
      `${mediaItem.name}-section-${index + 1}.mp3`,
      'music-semantic',
      (p) =>
        onProgress(
          0.6 + (fraction + (0.5 + p / 200) / currentAnalysis.segments.length) * 0.25,
          'uploading-section-audio',
        ),
    )
    if (!uploadedSection.success || !uploadedSection.url) {
      throw new Error(uploadedSection.error || `第 ${index + 1} 段音乐语义音频上传失败`)
    }
    sections.push({
      sectionId: `${segment.label}-${index + 1}`,
      start: segment.start,
      end: segment.end,
      structuralLabel: segment.label,
      audio_oss_url: uploadedSection.url,
      candidates: (currentAnalysis.editingAnchors ?? [])
        .filter((anchor) => anchor.time >= segment.start && anchor.time <= segment.end)
        .map((anchor) => ({
          id: anchor.id,
          time: anchor.time,
          eventLabel: anchor.eventLabel,
          roles: anchor.roles,
          strength: anchor.strength,
        })),
    })
  }
  return {
    media_id: mediaId,
    full_audio_oss_url: uploaded.url,
    sections,
    bpm: currentAnalysis.bpm,
    selectionBudget: 4,
  }
}

export async function waitForMusicSemanticTask(
  mediaItem: UnifiedMediaItemData,
  taskId: string,
  onProgress: (patch: { progress?: number; stage?: string; message?: string }) => void,
  signal: AbortSignal,
): Promise<FrontendMusicSemanticResult> {
  let finalResult: FrontendMusicSemanticResult | null = null
  let reconnect = true
  let delay = 1
  while (reconnect) {
    try {
      await fetchClient
        .stream<TaskStreamEvent>(
          'GET',
          `/api/media/tasks/${taskId}/status`,
          (event) => {
            if (event.type === TaskStreamEventType.PROGRESS_UPDATE) {
              setMusicSemanticMetadata(mediaItem, { status: 'processing', lastTaskId: taskId })
              onProgress({
                progress: Math.max(0.05, Math.min(0.95, event.progress / 100)),
                stage: 'polling-task',
                message: event.message,
              })
              return false
            }
            if (event.type === TaskStreamEventType.FINAL) {
              const finalEvent = event as FinalEvent
              if (finalEvent.status !== TaskStatus.COMPLETED) {
                setMusicSemanticMetadata(mediaItem, { status: 'failed', lastTaskId: taskId })
                throw new Error(finalEvent.message || '音乐语义分析失败')
              }
              const rawResult = finalEvent.result_data as
                | { music_semantic_result?: unknown; musicSemanticResult?: unknown }
                | undefined
              const result = rawResult?.music_semantic_result ?? rawResult?.musicSemanticResult
              if (!result) {
                setMusicSemanticMetadata(mediaItem, { status: 'failed', lastTaskId: taskId })
                throw new Error('音乐语义任务结果缺失')
              }
              finalResult = normalizeMusicSemanticResult(result)
              reconnect = false
              return true
            }
            if (event.type === TaskStreamEventType.NOT_FOUND) {
              setMusicSemanticMetadata(mediaItem, { status: 'failed', lastTaskId: taskId })
              throw new Error(event.message)
            }
            return event.type === TaskStreamEventType.ERROR
          },
          undefined,
          { signal },
        )
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          throw error
        })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (mediaItem.metadata?.musicSemantic?.status === 'failed') {
        await persistMusicSemantic(mediaItem)
        throw error
      }
      onProgress({
        stage: 'reconnecting-task',
        message: `音乐语义状态流断开，${delay} 秒后重试`,
      })
    }
    if (reconnect) {
      await sleepWithAbortSignal(delay * 1000, signal)
      delay = Math.min(delay * 2, 60)
    }
  }
  if (!finalResult) throw new Error('未获取到音乐语义任务结果')
  return finalResult
}
