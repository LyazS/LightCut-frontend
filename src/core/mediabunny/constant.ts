export const RENDERER_FPS = 30
// ==================== 音频相关常量 ====================

/** 音频提前调度时间（秒） - 确保音频能够连续播放 */
export const AUDIO_SCHEDULE_AHEAD = 0.1

/** 时间异常检测阈值（秒） - 超过此值需要重新 seek */
export const AUDIO_ANOMALY_THRESHOLD = 0.1

// ==================== 视频相关常量 ====================

/** 时间跳跃检测阈值（秒） - 超过此值需要重新 seek */
export const VIDEO_SEEK_THRESHOLD = 1.0

// ==================== 音频系统相关常量 ====================

/** 默认采样率（Hz） */
export const AUDIO_DEFAULT_SAMPLE_RATE = 48000
