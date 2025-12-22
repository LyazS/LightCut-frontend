/**
 * 媒体同步模块导出
 */

export { MediaSyncFactory } from './MediaSyncFactory'
export { BaseMediaSync } from './BaseMediaSync'
export { CommandMediaSync } from './CommandMediaSync'
export { ProjectLoadMediaSync } from './ProjectLoadMediaSync'
export { TimelineItemTransitioner } from './TimelineItemTransitioner'
export {
  MediaSyncManager,
  cleanupCommandMediaSync,
  cleanupProjectLoadMediaSync,
  cleanupMediaItemSync,
  getMediaSyncInfo,
} from './MediaSyncManager'
export type { MediaSyncScenario, MediaSyncInfo, TransitionOptions, IMediaSync } from './types'