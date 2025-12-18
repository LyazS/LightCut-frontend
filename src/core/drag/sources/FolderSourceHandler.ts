/**
 * 文件夹拖拽源处理器
 */

import type {
  DragSourceHandler,
  DragSourceType,
  FolderDragParams,
  FolderDragData,
  DragSourceParams,
  UnifiedDragData,
} from '@/core/types/drag'
import { DragSourceType as SourceType } from '@/core/types/drag'
import type { UnifiedDirectoryModule } from '@/core/modules/UnifiedDirectoryModule'

export class FolderSourceHandler implements DragSourceHandler {
  readonly sourceType: DragSourceType = SourceType.FOLDER

  constructor(private directoryModule: UnifiedDirectoryModule) {}

  createDragData(
    element: HTMLElement,
    event: DragEvent,
    params: DragSourceParams,
  ): UnifiedDragData {
    const folderParams = params as FolderDragParams

    const folder = this.directoryModule.getDirectory(folderParams.folderId)

    if (!folder) {
      throw new Error(`Folder not found: ${folderParams.folderId}`)
    }

    const dragData: FolderDragData = {
      sourceType: SourceType.FOLDER,
      timestamp: Date.now(),
      folderId: folderParams.folderId,
      folderName: folder.name,
      sourceFolderId: folder.parentId || undefined,
    }

    console.log(`📁 [FolderSourceHandler] 创建拖拽数据:`, dragData)

    return dragData
  }
}
