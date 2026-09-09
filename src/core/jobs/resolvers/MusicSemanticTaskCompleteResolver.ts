import { fetchClient } from '@/utils/fetchClient'
import type { ResolveContext, ResourceResolver } from '../ResourceResolver'
import type { ResourceRequest } from '../ResourceTypes'
import {
  canResumeMusicSemanticFromRemote,
  createMusicSemanticTaskCompleteRequest,
  createMusicSemanticTaskSubmitRequest,
  getMusicSemanticTaskId,
  persistMusicSemantic,
  setMusicSemanticMetadata,
  waitForMusicSemanticTask,
  type MusicSemanticModule,
  type MusicSemanticTaskCompleteResult,
  type MusicSemanticTaskSubmitResult,
  MUSIC_SEMANTIC_TASK_COMPLETE_RESOURCE_TYPE,
} from './musicSemanticShared'

export class MusicSemanticTaskCompleteResolver
  implements ResourceResolver<{ mediaId: string }, MusicSemanticTaskCompleteResult>
{
  readonly type = MUSIC_SEMANTIC_TASK_COMPLETE_RESOURCE_TYPE
  constructor(private readonly module: MusicSemanticModule) {}
  getKey(input: { mediaId: string }): string {
    return input.mediaId
  }
  async getDependencies(ctx: ResolveContext<{ mediaId: string }>): Promise<ResourceRequest[]> {
    return canResumeMusicSemanticFromRemote(
      this.module.getMediaItem(ctx.input.mediaId)?.metadata?.musicSemantic,
    )
      ? []
      : [createMusicSemanticTaskSubmitRequest(ctx.input.mediaId)]
  }
  async resolve(
    ctx: ResolveContext<{ mediaId: string }>,
  ): Promise<MusicSemanticTaskCompleteResult> {
    const mediaItem = this.module.getMediaItem(ctx.input.mediaId)
    if (!mediaItem) throw new Error(`素材不存在: ${ctx.input.mediaId}`)
    const taskId =
      getMusicSemanticTaskId(mediaItem) ||
      (
        await ctx.ensure<MusicSemanticTaskSubmitResult>(
          createMusicSemanticTaskSubmitRequest(ctx.input.mediaId),
        )
      ).taskId
    const result = await waitForMusicSemanticTask(
      mediaItem,
      taskId,
      (patch) => ctx.update(patch),
      ctx.signal,
    )
    await persistMusicSemantic(mediaItem)
    return { mediaId: mediaItem.id, taskId, result }
  }
  async cancel(ctx: ResolveContext<{ mediaId: string }>): Promise<void> {
    const mediaItem = this.module.getMediaItem(ctx.input.mediaId)
    if (mediaItem?.metadata?.musicSemantic?.status !== 'pending') return
    const taskId = mediaItem ? getMusicSemanticTaskId(mediaItem) : undefined
    if (taskId) await fetchClient.delete(`/api/media/tasks/${taskId}`)
    if (mediaItem) {
      setMusicSemanticMetadata(mediaItem, { status: 'failed' })
      await persistMusicSemantic(mediaItem)
    }
  }
}

export function createMusicSemanticTaskCompleteResolver(
  module: MusicSemanticModule,
): MusicSemanticTaskCompleteResolver {
  return new MusicSemanticTaskCompleteResolver(module)
}
export { createMusicSemanticTaskCompleteRequest }
