import MusicAnalysisWorker from './musicAnalysis.worker.ts?worker'
import type {
  MusicAnalysisDetectorConfig,
  MusicAnalysisResult,
  MusicAnalysisWorkerMessage,
} from './types'

/** Run one local All-In-One analysis in an isolated worker. */
export function analyzeMusicStructure(
  file: File,
  expectedDurationSeconds: number,
  config: MusicAnalysisDetectorConfig = {},
): Promise<MusicAnalysisResult> {
  return new Promise<MusicAnalysisResult>((resolve, reject) => {
    const worker = new MusicAnalysisWorker()
    let settled = false

    const cleanup = () => {
      worker.terminate()
      config.signal?.removeEventListener('abort', onAbort)
    }

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const onAbort = () => {
      if (!settled) {
        fail(new DOMException('音乐结构分析已取消', 'AbortError'))
      }
    }

    config.signal?.addEventListener('abort', onAbort, { once: true })
    if (config.signal?.aborted) {
      onAbort()
    }

    worker.onmessage = (event: MessageEvent<MusicAnalysisWorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        config.onProgress?.(message.event)
        return
      }

      if (settled) return
      settled = true
      cleanup()

      if (message.type === 'done') {
        resolve(message.result)
      } else if (message.message === '音乐结构分析已取消') {
        reject(new DOMException(message.message, 'AbortError'))
      } else {
        reject(new Error(message.message))
      }
    }

    worker.onerror = (event: ErrorEvent) => {
      fail(new Error(event.message || '音乐结构分析 Worker 执行出错'))
    }

    worker.postMessage({ type: 'analyze', file, expectedDurationSeconds })
  })
}
