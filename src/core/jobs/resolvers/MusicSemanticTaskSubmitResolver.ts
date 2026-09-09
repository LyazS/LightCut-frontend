import { fetchClient } from '@/utils/fetchClient'
import type { ResolveCheckContext, ResolveContext, ResourceResolver } from '../ResourceResolver'
import type { ResourceRequest } from '../ResourceTypes'
import {
  createMusicSemanticTaskSubmitRequest,
  prepareMusicSemanticTaskInput,
  persistMusicSemantic,
  setMusicSemanticMetadata,
  type MusicSemanticModule,
  type MusicSemanticTaskSubmitResult,
  MUSIC_SEMANTIC_TASK_SUBMIT_RESOURCE_TYPE,
} from './musicSemanticShared'
import { createMusicStructureAnalysisRequest } from './MusicStructureAnalysisResolver'

export class MusicSemanticTaskSubmitResolver
  implements ResourceResolver<{ mediaId: string }, MusicSemanticTaskSubmitResult>
{
  readonly type = MUSIC_SEMANTIC_TASK_SUBMIT_RESOURCE_TYPE
  constructor(private readonly module: MusicSemanticModule) {}
  getKey(input: { mediaId: string }): string {
    return input.mediaId
  }
  async isSatisfied(
    ctx: ResolveCheckContext<{ mediaId: string }>,
  ): Promise<MusicSemanticTaskSubmitResult | null> {
    const metadata = this.module.getMediaItem(ctx.input.mediaId)?.metadata?.musicSemantic
    return metadata?.status === 'processing' && metadata.lastTaskId
      ? { mediaId: ctx.input.mediaId, taskId: metadata.lastTaskId }
      : null
  }
  async getDependencies(ctx: ResolveContext<{ mediaId: string }>): Promise<ResourceRequest[]> {
    return [createMusicStructureAnalysisRequest(ctx.input.mediaId)]
  }
  async resolve(ctx: ResolveContext<{ mediaId: string }>): Promise<MusicSemanticTaskSubmitResult> {
    const mediaItem = this.module.getMediaItem(ctx.input.mediaId)
    if (!mediaItem) throw new Error(`素材不存在: ${ctx.input.mediaId}`)
    setMusicSemanticMetadata(mediaItem, { status: 'pending', lastTaskId: undefined })
    await persistMusicSemantic(mediaItem)
    try {
      const input = await prepareMusicSemanticTaskInput(
        this.module,
        ctx.input.mediaId,
        ctx.signal,
        (progress, stage) =>
          ctx.update({ progress, stage, message: `准备音乐语义输入: ${mediaItem.name}` }),
      )
      setMusicSemanticMetadata(mediaItem, { status: 'processing' })
      await persistMusicSemantic(mediaItem)
      const response = await fetchClient.post<{
        task_id: string
        success?: boolean
        error_details?: { error?: string }
      }>('/api/media/music-semantic', input)
      if (
        response.status < 200 ||
        response.status >= 300 ||
        !response.data?.success ||
        !response.data.task_id
      )
        throw new Error(response.data?.error_details?.error || '提交音乐语义任务失败')
      setMusicSemanticMetadata(mediaItem, {
        status: 'processing',
        lastTaskId: response.data.task_id,
      })
      await persistMusicSemantic(mediaItem)
      return { mediaId: mediaItem.id, taskId: response.data.task_id }
    } catch (error) {
      setMusicSemanticMetadata(mediaItem, { status: 'failed' })
      await persistMusicSemantic(mediaItem)
      throw error
    }
  }
}

export function createMusicSemanticTaskSubmitResolver(
  module: MusicSemanticModule,
): MusicSemanticTaskSubmitResolver {
  return new MusicSemanticTaskSubmitResolver(module)
}
export { createMusicSemanticTaskSubmitRequest }
