/**
 * 素材项目拖拽源处理器
 */

import type {
  DragSourceHandler,
  DragSourceType,
  MediaItemDragParams,
  MediaItemDragData,
  DragSourceParams,
  UnifiedDragData,
} from '@/core/types/drag'
import { DragSourceType as SourceType } from '@/core/types/drag'
import type { UnifiedMediaModule } from '@/core/modules/UnifiedMediaModule'
import type { UnifiedDirectoryModule } from '@/core/modules/UnifiedDirectoryModule'

export class MediaItemSourceHandler implements DragSourceHandler {
  readonly sourceType: DragSourceType = SourceType.MEDIA_ITEM

  constructor(
    private mediaModule: UnifiedMediaModule,
    private directoryModule: UnifiedDirectoryModule,
  ) {}

  createDragData(
    element: HTMLElement,
    event: DragEvent,
    params: DragSourceParams,
  ): UnifiedDragData {
    const mediaParams = params as MediaItemDragParams

    // 从 mediaModule 获取素材信息
    const mediaItem = this.mediaModule.getMediaItem(mediaParams.mediaItemId)

    if (!mediaItem) {
      throw new Error(`Media item not found: ${mediaParams.mediaItemId}`)
    }

    // 从 directoryModule 获取当前文件夹信息
    const sourceFolderId = this.directoryModule.currentDir.value?.id

    const dragData: MediaItemDragData = {
      sourceType: SourceType.MEDIA_ITEM,
      timestamp: Date.now(),
      mediaItemIds: mediaParams.selectedMediaItemIds || [mediaParams.mediaItemId],
      mediaItemId: mediaParams.mediaItemId,
      name: mediaItem.name,
      duration: mediaItem.duration || 0,
      mediaType: mediaItem.mediaType,
      sourceFolderId,
    }

    console.log(`📦 [MediaItemSourceHandler] 创建拖拽数据:`, dragData)

    return dragData
  }
}
