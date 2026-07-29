import type { ToolDefinition } from '../core/toolTypes'
import { createTimelineCommandHelpers } from './timelineEditShared'
import { historyLabels } from '@/core/modules/historyLabel'

export async function executeRemoveClip(args: Record<string, any>) {
  const { clipIds } = args

  if (!Array.isArray(clipIds) || clipIds.length === 0) {
    return {
      success: false,
      output: JSON.stringify({ tool: 'remove_clip', error: 'clipIds 必须是非空数组。' }, null, 2),
      error: 'clipIds 必须是非空数组。',
    }
  }

  if (!clipIds.every((id) => typeof id === 'string' && id)) {
    return {
      success: false,
      output: JSON.stringify(
        { tool: 'remove_clip', error: 'clipIds 中的每一项都必须是非空字符串。' },
        null,
        2,
      ),
      error: 'clipIds 中的每一项都必须是非空字符串。',
    }
  }

  try {
    const { store, createRemoveTimelineItemCommand } = createTimelineCommandHelpers()
    const missingIds = clipIds.filter((id) => !store.getTimelineItem(id))
    if (missingIds.length > 0) {
      const message = `以下片段不存在：${missingIds.join(', ')}`
      return {
        success: false,
        output: JSON.stringify({ tool: 'remove_clip', error: message }, null, 2),
        error: message,
      }
    }

    const batch = store.startBatch(historyLabels.deleteClips(clipIds.length))
    for (const clipId of clipIds) {
      batch.addCommand(createRemoveTimelineItemCommand(clipId))
    }
    await store.executeBatchCommand(batch.build())

    return {
      success: true,
      output: JSON.stringify(
        {
          tool: 'remove_clip',
          removedClipIds: clipIds,
        },
        null,
        2,
      ),
    }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      output: JSON.stringify({ tool: 'remove_clip', error: message }, null, 2),
      error: message,
    }
  }
}

export const removeClipTool: ToolDefinition = {
  name: 'remove_clip',
  execute: executeRemoveClip,
} as ToolDefinition
