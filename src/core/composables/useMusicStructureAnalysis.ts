import { computed, ref, watch } from 'vue'
import {
  MUSIC_STRUCTURE_ANALYSIS_RESOURCE_TYPE,
  type MusicStructureAnalysisResult,
  type TaskView,
} from '@/core/jobs'
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'

const analyzingMediaIds = new Set<string>()

/** Runs the shared music analysis task with the same cancellable progress modal as Beat This. */
export function useMusicStructureAnalysis() {
  const unifiedStore = useUnifiedStore()
  const { t } = useAppI18n()
  const isAnalyzingMusicStructure = ref(false)

  async function analyzeMusicStructure(mediaId: string, force = false) {
    if (analyzingMediaIds.has(mediaId)) return undefined

    const mediaItem = unifiedStore.getMediaItem(mediaId)
    if (!mediaItem) return undefined

    isAnalyzingMusicStructure.value = true
    analyzingMediaIds.add(mediaId)
    await unifiedStore.pause()

    const task = computed<TaskView | undefined>(() =>
      unifiedStore.jobTaskViews.find(
        (candidate) =>
          candidate.rootResourceId === `${MUSIC_STRUCTURE_ANALYSIS_RESOURCE_TYPE}:${mediaId}`,
      ),
    )
    const loading = unifiedStore.createLoading({
      title: t('media.musicAnalysisTaskTitle'),
      showProgress: true,
      showDetails: true,
      showTips: true,
      tipText: t('properties.mediaItem.musicAnalysis.analyzing'),
      showCancel: true,
      cancelText: t('common.cancel'),
      onCancel: () => {
        void unifiedStore.cancelMusicStructureAnalysis(mediaId)
      },
    })
    const stopTaskWatch = watch(
      task,
      (currentTask) => {
        loading.update({
          progress:
            typeof currentTask?.progress === 'number'
              ? Math.round(Math.min(1, Math.max(0, currentTask.progress)) * 100)
              : 0,
          details: currentTask?.message ?? t('properties.mediaItem.musicAnalysis.preparing'),
        })
      },
      { immediate: true },
    )

    unifiedStore.messageSuccess(t('media.musicAnalysisStarted', { name: mediaItem.name }))
    try {
      const result = (await unifiedStore.ensureMusicStructureAnalysis(
        mediaId,
        force,
      )) as MusicStructureAnalysisResult
      unifiedStore.messageSuccess(t('media.musicAnalysisSuccess', { name: mediaItem.name }))
      return result.musicAnalysis
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        unifiedStore.messageInfo(t('timeline.beatDetection.cancelled'))
        return undefined
      }

      console.error('音乐结构分析失败:', error)
      unifiedStore.messageError(
        t('media.musicAnalysisFailed', {
          name: mediaItem.name,
          error: error instanceof Error ? error.message : t('media.unknown'),
        }),
      )
      return undefined
    } finally {
      stopTaskWatch()
      loading.close()
      isAnalyzingMusicStructure.value = false
      analyzingMediaIds.delete(mediaId)
    }
  }

  return {
    isAnalyzingMusicStructure,
    analyzeMusicStructure,
  }
}
