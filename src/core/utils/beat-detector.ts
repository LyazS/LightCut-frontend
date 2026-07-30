import type { UnifiedTimelineItemData } from '@/core/timelineitem/model/timelineItem'
import {
  type BeatThisDetectorConfig,
  type BeatThisMarks,
  type BeatThisProgressEvent,
} from './beatthis/types'
import BeatThisWorker from './beatthis/beatThis.worker.ts?worker'

export async function detectBeatThis(
  itemData: UnifiedTimelineItemData,
  file: File,
  config: BeatThisDetectorConfig = {},
): Promise<BeatThisMarks> {
  if (typeof AudioData === 'undefined') {
    throw new Error('当前浏览器不支持 AudioData')
  }

  const timeRange = {
    timelineStartTime: itemData.timeRange.timelineStartTime,
    timelineEndTime: itemData.timeRange.timelineEndTime,
    clipStartTime: itemData.timeRange.clipStartTime,
    clipEndTime: itemData.timeRange.clipEndTime,
  }
  return new Promise<BeatThisMarks>((resolve, reject) => {
    const worker = new BeatThisWorker()
    let settled = false

    const cleanup = () => {
      worker.terminate()
      config.signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      if (!settled) {
        worker.postMessage({ type: 'abort' })
      }
    }

    config.signal?.addEventListener('abort', onAbort)
    if (config.signal?.aborted) {
      onAbort()
    }

    worker.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'progress') {
        config.onProgress?.(event.data.event as BeatThisProgressEvent)
        return
      }

      settled = true
      cleanup()
      if (event.data.type === 'done') {
        const marks = event.data.marks as BeatThisMarks
        resolve(marks)
      } else if (event.data.message === '自动节拍已取消') {
        reject(new DOMException(event.data.message, 'AbortError'))
      } else {
        reject(new Error(event.data.message))
      }
    }

    worker.onerror = (event: ErrorEvent) => {
      settled = true
      cleanup()
      reject(new Error(event.message || '自动节拍 Worker 执行出错'))
    }

    worker.postMessage({
      type: 'detect',
      file,
      timeRange,
    })
  })
}
