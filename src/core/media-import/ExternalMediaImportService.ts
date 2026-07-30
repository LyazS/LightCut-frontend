import { buildDirectoryImportPlan } from './DirectoryImportPlanBuilder'
import { discoverExternalImportEntries } from './ExternalEntryDiscovery'
import { executeDirectoryImportPlan } from './DirectoryImportExecutor'
import type {
  DirectoryImportOperations,
  DirectoryImportSummary,
  ExternalImportRoot,
  ExternalMediaImportOptions,
} from './types'

export function createExternalMediaImportService(operations: DirectoryImportOperations) {
  async function importExternalMedia(
    roots: ExternalImportRoot[],
    targetDirectoryId: string,
    options: ExternalMediaImportOptions = {},
  ): Promise<DirectoryImportSummary> {
    options.onProgress?.({ phase: 'discovering', current: 0, total: 0 })
    const discovered = await discoverExternalImportEntries(roots, options.signal)

    options.onProgress?.({ phase: 'planning', current: 0, total: discovered.files.length })
    const plan = buildDirectoryImportPlan(discovered)

    return executeDirectoryImportPlan(plan, targetDirectoryId, operations, options)
  }

  return { importExternalMedia }
}
