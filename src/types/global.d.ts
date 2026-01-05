/**
 * 全局类型声明文件
 * 为全局对象和扩展提供类型定义
 */

import type { TimelineItemDragData, MediaItemDragData } from './index'

// 扩展 Window 接口，添加拖拽数据属性和 File System Access API
declare global {
  interface Window {
    __timelineDragData?: TimelineItemDragData | null
    __mediaDragData?: MediaItemDragData | null
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  }

  // File System Access API 类型定义
  interface SaveFilePickerOptions {
    suggestedName?: string
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
    excludeAcceptAllOption?: boolean
  }

  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>
  }

  interface FileSystemWritableFileStream {
    write(data: Blob | BufferSource | string): Promise<void>
    close(): Promise<void>
  }
}

// 确保这个文件被视为模块
export {}
