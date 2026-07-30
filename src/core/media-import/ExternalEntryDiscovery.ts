import type {
  DiscoveredExternalEntries,
  DiscoveredFile,
  ExternalImportRoot,
  SkippedImportItem,
} from './types'

interface CapturedDropItem {
  file: File | null
  handle: Promise<FileSystemHandle | null> | null
}

/**
 * Invoke getAsFileSystemHandle before returning control to the browser. Chromium
 * invalidates the drag permission when this call is deferred past the drop event.
 */
export function captureDroppedImportRoots(
  items: DataTransferItemList | DataTransferItem[],
  fallbackFiles: FileList | File[] = [],
): Promise<ExternalImportRoot[]> {
  const capturedItems: CapturedDropItem[] = Array.from(items)
    .filter((item) => item.kind === 'file')
    .map((item) => {
      const getAsFileSystemHandle = item.getAsFileSystemHandle
      return {
        file: item.getAsFile(),
        handle:
          typeof getAsFileSystemHandle === 'function'
            ? getAsFileSystemHandle.call(item).catch(() => null)
            : null,
      }
    })

  return Promise.all(
    capturedItems.map(async ({ file, handle }) => {
      const fileSystemHandle = handle ? await handle : null
      if (fileSystemHandle && isDirectoryHandle(fileSystemHandle)) {
        return { kind: 'directory', handle: fileSystemHandle } satisfies ExternalImportRoot
      }

      if (fileSystemHandle?.kind === 'file' && file) {
        return { kind: 'file', file } satisfies ExternalImportRoot
      }

      return file ? ({ kind: 'file', file } satisfies ExternalImportRoot) : null
    }),
  ).then((roots) => {
    const fallbackRoots =
      capturedItems.length === 0
        ? Array.from(fallbackFiles).map(
            (file) => ({ kind: 'file', file }) satisfies ExternalImportRoot,
          )
        : []

    return [...roots.filter((root): root is ExternalImportRoot => root !== null), ...fallbackRoots]
  })
}

export async function discoverExternalImportEntries(
  roots: ExternalImportRoot[],
  signal?: AbortSignal,
): Promise<DiscoveredExternalEntries> {
  const files: DiscoveredFile[] = []
  const skipped: SkippedImportItem[] = []

  await Promise.all(
    roots.map(async (root, index) => {
      const sourceId = `root-${index}`
      if (signal?.aborted) {
        skipped.push({
          sourceId,
          relativePath: root.kind === 'file' ? [root.file.name] : [root.handle.name],
          reason: 'cancelled',
        })
        return
      }

      if (root.kind === 'file') {
        files.push({ sourceId, file: root.file, relativePath: [root.file.name] })
        return
      }

      await discoverDirectory(root.handle, sourceId, [root.handle.name], files, skipped, signal)
    }),
  )

  return { files, skipped }
}

async function discoverDirectory(
  handle: FileSystemDirectoryHandle,
  sourceId: string,
  relativePath: string[],
  files: DiscoveredFile[],
  skipped: SkippedImportItem[],
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    skipped.push({ sourceId, relativePath, reason: 'cancelled' })
    return
  }

  try {
    for await (const [name, childHandle] of handle.entries()) {
      if (signal?.aborted) {
        skipped.push({ sourceId, relativePath, reason: 'cancelled' })
        return
      }

      const childPath = [...relativePath, name]
      if (childHandle.kind === 'directory') {
        await discoverDirectory(childHandle, sourceId, childPath, files, skipped, signal)
        continue
      }

      try {
        files.push({
          sourceId,
          file: await childHandle.getFile(),
          relativePath: childPath,
        })
      } catch (error) {
        skipped.push({
          sourceId,
          relativePath: childPath,
          reason: 'unreadable',
          message: getErrorMessage(error),
        })
      }
    }
  } catch (error) {
    skipped.push({
      sourceId,
      relativePath,
      reason: 'unreadable',
      message: getErrorMessage(error),
    })
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '无法读取此项目'
}

function isDirectoryHandle(handle: FileSystemHandle): handle is FileSystemDirectoryHandle {
  return handle.kind === 'directory' && 'entries' in handle
}
