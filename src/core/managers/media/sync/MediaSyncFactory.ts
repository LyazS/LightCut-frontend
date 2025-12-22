/**
 * 媒体同步工厂
 * 负责创建不同场景的媒体同步实例
 */

import { CommandMediaSync } from './CommandMediaSync'
import { ProjectLoadMediaSync } from './ProjectLoadMediaSync'

/**
 * 媒体同步工厂类
 */
export class MediaSyncFactory {
  /**
   * 为命令场景创建媒体同步
   * @param commandId 命令ID
   * @param mediaItemId 媒体项目ID
   * @param timelineItemId 时间轴项目ID（可选）
   * @returns CommandMediaSync 实例
   * 
   * @example
   * ```typescript
   * // 有 timelineItemId 的情况
   * const sync = MediaSyncFactory.forCommand(
   *   'cmd-123',
   *   'media-456',
   *   'timeline-789'
   * )
   * await sync.setup()
   * 
   * // 无 timelineItemId 的情况
   * const sync = MediaSyncFactory.forCommand(
   *   'cmd-123',
   *   'media-456'
   * )
   * await sync.setup()
   * ```
   */
  static forCommand(
    commandId: string,
    mediaItemId: string,
    timelineItemId?: string,
  ): CommandMediaSync {
    return new CommandMediaSync(commandId, mediaItemId, timelineItemId)
  }

  /**
   * 为项目加载场景创建媒体同步
   * @param mediaItemId 媒体项目ID
   * @param timelineItemId 时间轴项目ID（必需）
   * @returns ProjectLoadMediaSync 实例
   * 
   * @example
   * ```typescript
   * const sync = MediaSyncFactory.forProjectLoad(
   *   'media-456',
   *   'timeline-789'
   * )
   * await sync.setup()
   * ```
   */
  static forProjectLoad(
    mediaItemId: string,
    timelineItemId: string,
  ): ProjectLoadMediaSync {
    return new ProjectLoadMediaSync(mediaItemId, timelineItemId)
  }
}