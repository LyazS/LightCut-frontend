import type { VirtualDirectory } from '@/core/directory/types'

export type ImportMediaType = 'video' | 'audio' | 'image'

export type ExternalImportRoot =
  | {
      kind: 'file'
      file: File
    }
  | {
      kind: 'directory'
      handle: FileSystemDirectoryHandle
    }

export interface DiscoveredFile {
  sourceId: string
  file: File
  /** Includes the file name. Directory roots always occupy the first segment. */
  relativePath: string[]
}

export interface SkippedImportItem {
  sourceId: string
  relativePath: string[]
  reason: 'unsupported' | 'invalid' | 'unreadable' | 'cancelled'
  message?: string
}

export interface DiscoveredExternalEntries {
  files: DiscoveredFile[]
  skipped: SkippedImportItem[]
}

export interface PlannedDirectory {
  sourceId: string
  relativePath: string[]
}

export interface PlannedMediaFile extends DiscoveredFile {
  mediaType: ImportMediaType
}

export interface DirectoryImportPlan {
  directories: PlannedDirectory[]
  files: PlannedMediaFile[]
  skipped: SkippedImportItem[]
}

export interface DirectoryImportSummary {
  /** Media items successfully added to the library. */
  queued: number
  /** Media items for which an import attempt was started. */
  started: number
  skipped: SkippedImportItem[]
  cancelled: boolean
}

export type DirectoryImportPhase =
  | 'discovering'
  | 'planning'
  | 'creating-directories'
  | 'importing-files'

export interface DirectoryImportProgress {
  phase: DirectoryImportPhase
  current: number
  total: number
}

export interface DirectoryImportOperations {
  getDirectory(directoryId: string): VirtualDirectory | undefined
  getAllDirectories(): VirtualDirectory[]
  createDirectory(
    name: string,
    parentDirectoryId: string,
  ): { success: true; directory: VirtualDirectory } | { success: false; error: string }
  importMedia(file: File, parentDirectoryId: string): Promise<void>
}

export interface ExternalMediaImportOptions {
  signal?: AbortSignal
  concurrency?: number
  onProgress?: (progress: DirectoryImportProgress) => void
}
