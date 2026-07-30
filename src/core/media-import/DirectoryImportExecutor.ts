import pLimit from 'p-limit'
import { getDirectoryPlanKey } from './DirectoryImportPlanBuilder'
import type {
  DirectoryImportOperations,
  DirectoryImportPlan,
  DirectoryImportSummary,
  ExternalMediaImportOptions,
  SkippedImportItem,
} from './types'

const copyNameSuffix = /^(.*) \((\d+)\)$/

export async function executeDirectoryImportPlan(
  plan: DirectoryImportPlan,
  targetDirectoryId: string,
  operations: DirectoryImportOperations,
  options: ExternalMediaImportOptions = {},
): Promise<DirectoryImportSummary> {
  const skipped = [...plan.skipped]
  const directoryIdByPath = new Map<string, string>()
  const blockedDirectories = new Set<string>()
  const occupiedNamesByParent = getOccupiedNamesByParent(operations)

  if (!operations.getDirectory(targetDirectoryId)) {
    throw new Error('目标目录不存在，无法导入素材')
  }

  options.onProgress?.({
    phase: 'creating-directories',
    current: 0,
    total: plan.directories.length,
  })

  let processedDirectories = 0
  for (const directory of plan.directories) {
    if (options.signal?.aborted) {
      return createCancelledSummary(0, 0, skipped)
    }

    const key = getDirectoryPlanKey(directory.sourceId, directory.relativePath)
    const parentPath = directory.relativePath.slice(0, -1)
    const parentKey = getDirectoryPlanKey(directory.sourceId, parentPath)
    const parentDirectoryId =
      parentPath.length === 0 ? targetDirectoryId : directoryIdByPath.get(parentKey)

    if (!parentDirectoryId || blockedDirectories.has(parentKey)) {
      blockedDirectories.add(key)
      skipped.push({
        sourceId: directory.sourceId,
        relativePath: directory.relativePath,
        reason: 'unreadable',
        message: '父目录创建失败',
      })
      processedDirectories += 1
      reportDirectoryProgress(options, processedDirectories, plan.directories.length)
      if (processedDirectories % 32 === 0) await yieldToBrowser()
      continue
    }

    const originalName = directory.relativePath[directory.relativePath.length - 1]
    const allocatedName = allocateCopyName(
      originalName,
      getOrCreateOccupiedNames(occupiedNamesByParent, parentDirectoryId),
    )
    const result = operations.createDirectory(allocatedName, parentDirectoryId)
    if (!result.success) {
      blockedDirectories.add(key)
      skipped.push({
        sourceId: directory.sourceId,
        relativePath: directory.relativePath,
        reason: 'invalid',
        message: result.error,
      })
      processedDirectories += 1
      reportDirectoryProgress(options, processedDirectories, plan.directories.length)
      if (processedDirectories % 32 === 0) await yieldToBrowser()
      continue
    }

    directoryIdByPath.set(key, result.directory.id)
    processedDirectories += 1
    reportDirectoryProgress(options, processedDirectories, plan.directories.length)
    if (processedDirectories % 32 === 0) await yieldToBrowser()
  }

  options.onProgress?.({ phase: 'importing-files', current: 0, total: plan.files.length })
  const limit = pLimit(options.concurrency ?? 2)
  let started = 0
  let queued = 0

  await Promise.all(
    plan.files.map((plannedFile) =>
      limit(async () => {
        if (options.signal?.aborted) {
          skipped.push({
            sourceId: plannedFile.sourceId,
            relativePath: plannedFile.relativePath,
            reason: 'cancelled',
          })
          return
        }

        const parentPath = plannedFile.relativePath.slice(0, -1)
        const parentDirectoryId =
          parentPath.length === 0
            ? targetDirectoryId
            : directoryIdByPath.get(getDirectoryPlanKey(plannedFile.sourceId, parentPath))
        if (!parentDirectoryId) {
          skipped.push({
            sourceId: plannedFile.sourceId,
            relativePath: plannedFile.relativePath,
            reason: 'unreadable',
            message: '目标目录创建失败',
          })
          return
        }

        started += 1
        options.onProgress?.({
          phase: 'importing-files',
          current: started,
          total: plan.files.length,
        })
        try {
          await operations.importMedia(plannedFile.file, parentDirectoryId)
          queued += 1
        } catch (error) {
          skipped.push({
            sourceId: plannedFile.sourceId,
            relativePath: plannedFile.relativePath,
            reason: 'unreadable',
            message: getErrorMessage(error),
          })
        }
      }),
    ),
  )

  return {
    queued,
    started,
    skipped,
    cancelled: options.signal?.aborted ?? false,
  }
}

export function allocateCopyName(name: string, occupiedNames: Set<string>): string {
  if (!occupiedNames.has(name)) {
    occupiedNames.add(name)
    return name
  }

  const baseName = getCopyBaseName(name)
  let nextNumber = 1
  for (const occupiedName of occupiedNames) {
    const copyNumber = getCopyNumber(occupiedName, baseName)
    if (copyNumber !== null) {
      nextNumber = Math.max(nextNumber, copyNumber)
    }
  }

  let candidate: string
  do {
    nextNumber += 1
    candidate = `${baseName} (${nextNumber})`
  } while (occupiedNames.has(candidate))

  occupiedNames.add(candidate)
  return candidate
}

function getOccupiedNamesByParent(operations: DirectoryImportOperations): Map<string, Set<string>> {
  const namesByParent = new Map<string, Set<string>>()
  for (const directory of operations.getAllDirectories()) {
    if (!directory.parentId) continue
    getOrCreateOccupiedNames(namesByParent, directory.parentId).add(directory.name)
  }
  return namesByParent
}

function getOrCreateOccupiedNames(
  namesByParent: Map<string, Set<string>>,
  parentDirectoryId: string,
): Set<string> {
  let names = namesByParent.get(parentDirectoryId)
  if (!names) {
    names = new Set<string>()
    namesByParent.set(parentDirectoryId, names)
  }
  return names
}

function getCopyBaseName(name: string): string {
  const match = name.match(copyNameSuffix)
  return match && Number(match[2]) >= 2 ? match[1] : name
}

function getCopyNumber(name: string, baseName: string): number | null {
  if (name === baseName) return 1
  const match = name.match(copyNameSuffix)
  if (!match || match[1] !== baseName) return null

  const number = Number(match[2])
  return number >= 2 ? number : null
}

function createCancelledSummary(
  queued: number,
  started: number,
  skipped: SkippedImportItem[],
): DirectoryImportSummary {
  return { queued, started, skipped, cancelled: true }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '导入失败'
}

function reportDirectoryProgress(
  options: ExternalMediaImportOptions,
  current: number,
  total: number,
): void {
  options.onProgress?.({ phase: 'creating-directories', current, total })
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}
