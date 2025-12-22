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
   * 为命令场景创建媒体同步（支持文本类型）
   * @param commandId 命令ID
   * @param mediaItemId 媒体项目ID
   * @param timelineItemId 时间轴项目ID（可选）
   * @param setupTimelineItemSprite 设置时间轴项目精灵的函数（文本类型需要）
   * @returns CommandMediaSync 实例
   *
   * @example
   * ```typescript
   * // 有 timelineItemId 的情况（媒体类型）
   * const sync = MediaSyncFactory.forCommand(
   *   'cmd-123',
   *   'media-456',
   *   'timeline-789'
   * )
   * await sync.setup()
   *
   * // 文本类型的情况
   * const sync = MediaSyncFactory.forCommand(
   *   'cmd-123',
   *   'media-456',
   *   'timeline-789',
   *   setupTimelineItemSprite
   * )
   * await sync.setup()
   * ```
   */
  static forCommand(
    commandId: string,
    mediaItemId: string,
    timelineItemId?: string,
    setupTimelineItemSprite?: (item: any) => Promise<void>,
  ): CommandMediaSync {
    return new CommandMediaSync(commandId, mediaItemId, timelineItemId, setupTimelineItemSprite)
  }

  /**
   * 为项目加载场景创建媒体同步（支持文本类型）
   * @param mediaItemId 媒体项目ID
   * @param timelineItemId 时间轴项目ID（必需）
   * @param setupTimelineItemSprite 设置时间轴项目精灵的函数（文本类型需要）
   * @returns ProjectLoadMediaSync 实例
   *
   * @example
   * ```typescript
   * // 媒体类型
   * const sync = MediaSyncFactory.forProjectLoad(
   *   'media-456',
   *   'timeline-789'
   * )
   * await sync.setup()
   *
   * // 文本类型
   * const sync = MediaSyncFactory.forProjectLoad(
   *   'media-456',
   *   'timeline-789',
   *   setupTimelineItemSprite
   * )
   * await sync.setup()
   * ```
   */
  static forProjectLoad(
    mediaItemId: string,
    timelineItemId: string,
    setupTimelineItemSprite?: (item: any) => Promise<void>,
  ): ProjectLoadMediaSync {
    return new ProjectLoadMediaSync(mediaItemId, timelineItemId, setupTimelineItemSprite)
  }
}