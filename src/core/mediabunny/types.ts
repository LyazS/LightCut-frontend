/**
 * 播放状态
 */
export interface PlaybackState {
  isPlaying: boolean
  currentTime: number
  duration: number
  currentTimeN: bigint
  durationN: bigint
}

export interface TimeRange {
  // 帧数为单位，RENDERER_FPS是帧率
  clipStart: bigint
  clipEnd: bigint
  timelineStart: bigint
  timelineEnd: bigint
}