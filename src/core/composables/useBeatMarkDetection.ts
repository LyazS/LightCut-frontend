import { ref } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { useAppI18n } from '@/core/composables/useI18n'
import type { AIMarkMode } from '@/core/timelineitem/model/timelineItem'
import { detectBeatThis } from '@/core/utils/beat-detector'
import type { BeatThisProgressEvent } from '@/core/utils/beatthis/types'

type DetectableAIMarkMode = Exclude<AIMarkMode, 'none'>
const detectingTimelineItemIds = new Set<string>()

export function useBeatMarkDetection() {
  const unifiedStore = useUnifiedStore()
  const { t } = useAppI18n()
  const isDetectingBeatMarks = ref(false)

  async function detectBeatMarks(
    timelineItemId: string,
    mode: DetectableAIMarkMode,
  ): Promise<void> {
    if (isDetectingBeatMarks.value || detectingTimelineItemIds.has(timelineItemId)) return

    const timelineItem = unifiedStore.getTimelineItem(timelineItemId)
    if (
      !timelineItem ||
      timelineItem.timelineStatus !== 'ready' ||
      (timelineItem.mediaType !== 'video' && timelineItem.mediaType !== 'audio') ||
      typeof timelineItem.mediaItemId !== 'string'
    ) {
      return
    }

    const generatedFor = {
      mediaItemId: timelineItem.mediaItemId,
      sourceStartFrame: timelineItem.timeRange.clipStartTime,
      sourceEndFrame: timelineItem.timeRange.clipEndTime,
    }

    isDetectingBeatMarks.value = true
    detectingTimelineItemIds.add(timelineItemId)
    await unifiedStore.pause()

    const abortController = new AbortController()
    const loading = unifiedStore.createLoading({
      title: t('timeline.beatDetection.title'),
      showProgress: true,
      showDetails: true,
      showTips: true,
      tipText: t('timeline.beatDetection.tip'),
      showCancel: true,
      cancelText: t('common.cancel'),
      onCancel: () => abortController.abort(),
    })

    try {
      const updateProgress = (event: BeatThisProgressEvent) => {
        let details: string
        switch (event.stage) {
          case 'loading-model':
            details = t('timeline.beatDetection.progress.loadingModel')
            break
          case 'checking-cache':
            details = t('timeline.beatDetection.progress.checkingCache')
            break
          case 'loading-from-cache':
            details = t('timeline.beatDetection.progress.loadingFromCache')
            break
          case 'downloading-model':
            details = t('timeline.beatDetection.progress.downloadingModel', {
              percent: Math.round((event.progress ?? 0) * 100),
            })
            break
          case 'initializing-model':
            details = t('timeline.beatDetection.progress.initializingModel')
            break
          case 'model-ready':
            details = t('timeline.beatDetection.progress.modelReady')
            break
          case 'decoding-audio':
            details = t('timeline.beatDetection.progress.decodingAudio')
            break
          case 'extracting-features':
            details = t('timeline.beatDetection.progress.extractingFeatures', {
              current: Math.floor(event.audioCurrentSeconds ?? 0),
              total: Math.ceil(event.audioTotalSeconds ?? 0),
            })
            break
          case 'detecting-beats':
            details = t('timeline.beatDetection.progress.detectingBeats')
            break
          case 'finalizing-beats':
            details = t('timeline.beatDetection.progress.finalizingBeats')
            break
        }

        loading.update({
          progress:
            event.total > 0 ? Math.min(100, Math.round((event.current / event.total) * 100)) : 0,
          details,
        })
      }

      const mediaItem = unifiedStore.getMediaItem(timelineItem.mediaItemId)
      const originalFile = mediaItem?.runtime.bunny?.bunnyMedia?.getOriFile()
      if (!originalFile) {
        throw new Error('无法获取原始文件')
      }

      const marks = await detectBeatThis(generatedFor, originalFile, {
        signal: abortController.signal,
        onProgress: updateProgress,
      })
      if (abortController.signal.aborted) {
        throw new DOMException('自动节拍已取消', 'AbortError')
      }

      const currentTimelineItem = unifiedStore.getTimelineItem(timelineItemId)
      if (!currentTimelineItem || currentTimelineItem.mediaItemId !== generatedFor.mediaItemId) {
        return
      }

      const wasUpdated = await unifiedStore.updateAIMarksWithHistory(timelineItemId, {
        mode,
        marks,
        generatedFor,
      })
      if (!wasUpdated) {
        return
      }

      if (marks.length === 0) {
        unifiedStore.messageWarning(t('timeline.beatDetection.noCompleteBars'))
      } else {
        unifiedStore.messageSuccess(t('timeline.beatDetection.success', { count: marks.length }))
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        unifiedStore.messageInfo(t('timeline.beatDetection.cancelled'))
      } else {
        unifiedStore.messageError(
          t('timeline.beatDetection.error', {
            message: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    } finally {
      loading.close()
      isDetectingBeatMarks.value = false
      detectingTimelineItemIds.delete(timelineItemId)
    }
  }

  return {
    isDetectingBeatMarks,
    detectBeatMarks,
  }
}
