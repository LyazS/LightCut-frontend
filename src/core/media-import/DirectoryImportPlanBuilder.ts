import { detectFileMediaType, validateFile } from '@/core/utils/mediaTypeDetector'
import type {
  DirectoryImportPlan,
  DiscoveredExternalEntries,
  PlannedDirectory,
  PlannedMediaFile,
} from './types'

const invalidDirectoryName = /[\\/\u0000-\u001f\u007f]/

export function buildDirectoryImportPlan(
  discovered: DiscoveredExternalEntries,
): DirectoryImportPlan {
  const directories: PlannedDirectory[] = []
  const files: PlannedMediaFile[] = []
  const skipped = [...discovered.skipped]
  const directoryKeys = new Set<string>()

  for (const discoveredFile of discovered.files) {
    const normalizedDirectoryPath = normalizeDirectoryPath(discoveredFile.relativePath.slice(0, -1))
    if (!normalizedDirectoryPath.ok) {
      skipped.push({
        sourceId: discoveredFile.sourceId,
        relativePath: discoveredFile.relativePath,
        reason: 'invalid',
        message: normalizedDirectoryPath.message,
      })
      continue
    }

    const validation = validateFile(discoveredFile.file)
    if (!validation.isValid) {
      skipped.push({
        sourceId: discoveredFile.sourceId,
        relativePath: discoveredFile.relativePath,
        reason: detectFileMediaType(discoveredFile.file) === 'unknown' ? 'unsupported' : 'invalid',
        message: validation.errorMessage,
      })
      continue
    }

    files.push({
      ...discoveredFile,
      relativePath: [...normalizedDirectoryPath.path, discoveredFile.file.name],
      mediaType: validation.mediaType,
    })

    for (let depth = 1; depth <= normalizedDirectoryPath.path.length; depth += 1) {
      const relativePath = normalizedDirectoryPath.path.slice(0, depth)
      const key = getDirectoryPlanKey(discoveredFile.sourceId, relativePath)
      if (!directoryKeys.has(key)) {
        directoryKeys.add(key)
        directories.push({ sourceId: discoveredFile.sourceId, relativePath })
      }
    }
  }

  directories.sort(
    (left, right) =>
      left.relativePath.length - right.relativePath.length ||
      getSourceIndex(left.sourceId) - getSourceIndex(right.sourceId),
  )

  return {
    directories,
    files,
    skipped,
  }
}

export function getDirectoryPlanKey(sourceId: string, relativePath: string[]): string {
  return [sourceId, ...relativePath].join('\u0000')
}

function normalizeDirectoryPath(
  path: string[],
): { ok: true; path: string[] } | { ok: false; message: string } {
  const normalizedPath: string[] = []

  for (const name of path) {
    const normalizedName = name.trim()
    if (!normalizedName || normalizedName === '.' || normalizedName === '..') {
      return { ok: false, message: '目录名称不合法' }
    }
    if (invalidDirectoryName.test(normalizedName)) {
      return { ok: false, message: '目录名称包含非法字符' }
    }
    normalizedPath.push(normalizedName)
  }

  return { ok: true, path: normalizedPath }
}

function getSourceIndex(sourceId: string): number {
  const match = /^root-(\d+)$/.exec(sourceId)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}
