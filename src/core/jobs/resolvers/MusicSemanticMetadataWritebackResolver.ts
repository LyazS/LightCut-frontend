import type { ResolveCheckContext, ResolveContext, ResourceResolver } from '../ResourceResolver'
import type { ResourceRequest } from '../ResourceTypes'
import {
  createMusicSemanticMetadataWritebackRequest,
  createMusicSemanticTaskCompleteRequest,
  persistMusicSemantic,
  setMusicSemanticMetadata,
  type MusicSemanticModule,
  type MusicSemanticTaskCompleteResult,
  MUSIC_SEMANTIC_METADATA_WRITEBACK_RESOURCE_TYPE,
} from './musicSemanticShared'

export class MusicSemanticMetadataWritebackResolver
  implements ResourceResolver<{ mediaId: string }, { mediaId: string; status: string }>
{
  readonly type = MUSIC_SEMANTIC_METADATA_WRITEBACK_RESOURCE_TYPE
  constructor(private readonly module: MusicSemanticModule) {}
  getKey(input: { mediaId: string }): string {
    return input.mediaId
  }
  async isSatisfied(
    ctx: ResolveCheckContext<{ mediaId: string }>,
  ): Promise<{ mediaId: string; status: string } | null> {
    const status = this.module.getMediaItem(ctx.input.mediaId)?.metadata?.musicSemantic?.status
    return status === 'completed' || status === 'partial_failed'
      ? { mediaId: ctx.input.mediaId, status }
      : null
  }
  async getDependencies(ctx: ResolveContext<{ mediaId: string }>): Promise<ResourceRequest[]> {
    return [createMusicSemanticTaskCompleteRequest(ctx.input.mediaId)]
  }
  async resolve(
    ctx: ResolveContext<{ mediaId: string }>,
  ): Promise<{ mediaId: string; status: string }> {
    const mediaItem = this.module.getMediaItem(ctx.input.mediaId)
    if (!mediaItem) throw new Error(`素材不存在: ${ctx.input.mediaId}`)
    const completed = await ctx.ensure<MusicSemanticTaskCompleteResult>(
      createMusicSemanticTaskCompleteRequest(ctx.input.mediaId),
    )
    const fallbackCount = completed.result.sections.filter(
      (section) => section.refinement.status === 'local_fallback',
    ).length
    const status =
      completed.result.status === 'partial_failed' ||
      fallbackCount === completed.result.sections.length
        ? 'partial_failed'
        : 'completed'
    setMusicSemanticMetadata(mediaItem, {
      status,
      lastTaskId: completed.taskId,
      failedSectionIds: completed.result.failedSectionIds,
      global: completed.result.global,
      sections: completed.result.sections,
    })
    await persistMusicSemantic(mediaItem)
    ctx.update({
      progress: 1,
      stage: 'metadata-written',
      message: `音乐语义结果已写回: ${mediaItem.name}`,
    })
    return { mediaId: mediaItem.id, status }
  }
}

export function createMusicSemanticMetadataWritebackResolver(
  module: MusicSemanticModule,
): MusicSemanticMetadataWritebackResolver {
  return new MusicSemanticMetadataWritebackResolver(module)
}
export { createMusicSemanticMetadataWritebackRequest }
