/**
 * 统一工具函数导出
 * 提供基于新架构统一类型的工具函数
 */

// ==================== 媒体类型检测工具 ====================
export {
  // 类型定义
  type DetectedMediaType,

  // 配置常量
  SUPPORTED_MEDIA_TYPES,
  FILE_SIZE_LIMITS,

  // 检测函数
  detectFileMediaType,
  isSupportedMediaType,
  isSupportedMimeType,
  getMediaTypeFromMimeType,
  getMediaTypeDisplayName,
  getMediaTypeIcon,
} from './mediaTypeDetector'

// ==================== 统一时间范围工具 ====================
export {
  // 同步工具
  syncTimeRange,

  // 计算工具
  calculateDuration,
} from './timeRangeUtils'


// ==================== 坐标转换工具 ====================
export {
  // 计算可见时间范围
  calculateVisibleFrameRange,

  // 坐标转换函数
  frameToPixel,
  pixelToFrame,

  // 坐标系转换函数
  webavToProjectCoords,
  projectToWebavCoords,

  // 验证和调试函数
  validateCoordinateTransform,
  debugCoordinateTransform,

  // 中心缩放计算
  calculateCenterScalePosition,
  debugCenterScaling,
} from './coordinateUtils'

// ==================== 统一时间工具 ====================
export {
  // 时间计算工具
  calculatePixelsPerFrame,
  formatFileSize,

  // 时间码转换函数
  framesToSeconds,
  secondsToFrames,
  framesToMicroseconds,
  microsecondsToFrames,
  framesToTimecode,
  timecodeToFrames,
  alignFramesToFrame,
} from './timeUtils'

// ==================== 统一时间重叠检测工具 ====================
export {
  // 核心重叠检测函数
  detectTimeRangeOverlap,
  isTimeRangeOverlapping,

  // TimelineItem 专用函数
  extractTimeRange,
  isTimelineItemsOverlapping,

  // 重叠计算函数
  calculateOverlapDuration,

  // 批量重叠检测
  countOverlappingItems,
} from './timeOverlapUtils'

// ==================== 统一缩略图生成器 ====================
export {
  // 视频缩略图生成
  generateVideoThumbnail,

  // 图片缩略图生成
  generateImageThumbnail,

  // Canvas转Blob URL
  canvasToBlob,

  // 统一媒体项目缩略图生成
  generateThumbnailForUnifiedMediaItem,
} from './thumbnailGenerator'

// ==================== 统一时间轴搜索工具 ====================
export {
  // 根据时间查找时间轴项目
  getTimelineItemAtFrames,

  // 根据轨道查找时间轴项目
  getTimelineItemsByTrack,

  // 查找孤立的时间轴项目
  findOrphanedTimelineItems,

  // 根据sprite查找时间轴项目
  findTimelineItemBySprite,

  // 根据时间查找所有重叠的时间轴项目
  getTimelineItemsAtFrames,

  // 根据轨道和时间查找时间轴项目
  getTimelineItemAtTrackAndFrames,

  // 检测播放头是否在时间轴项目的时间范围内
  isPlayheadInTimelineItem,
} from './timelineSearchUtils'

// ==================== 统一文本时间轴工具 ====================
export {
  // ID生成
  generateTimelineItemId,

  // 文本时间轴项目创建
  createTextTimelineItem,
} from './textTimelineUtils'

export { TextHelper } from './TextHelper'
// ==================== 统一动画转换器 ====================
export {
  // 转换核心函数
  framesToPercentage,
  convertKeyframeToWebAV,
  convertToWebAVAnimation,

  // 验证和工具函数
  isValidAnimationConfig,
  isKeyframeInRange,
  filterKeyframesInRange,
} from './animationConverter'

// ==================== 统一关键帧工具 ====================
export {
  // 关键帧位置转换工具函数
  absoluteFrameToRelativeFrame,
  relativeFrameToAbsoluteFrame,

  // 关键帧基础操作
  initializeAnimation,
  createKeyframe,
  hasAnimation,
  isCurrentFrameOnKeyframe,
  getKeyframeButtonState,
  getKeyframeUIState,

  // 关键帧操作
  enableAnimation,
  disableAnimation,
  removeKeyframeAtFrame,

  // 关键帧时长变化处理
  adjustKeyframesForDurationChange,
  sortKeyframes,

  // 统一关键帧交互逻辑
  toggleKeyframe,

  // 属性修改处理
  handlePropertyChange,

  // 关键帧导航
  getPreviousKeyframeFrame,
  getNextKeyframeFrame,

  // 清理和重置
  clearAllKeyframes,
  getKeyframeCount,
  getAllKeyframeFrames,

  // 调试和验证
  validateKeyframes,
  debugKeyframes,
} from './unifiedKeyframeUtils'

// ==================== 项目文件操作工具 ====================
export * as ProjectFileOps from './ProjectFileOperations'

// ==================== WebAV Clip工具 ====================
export {
  // Clip创建函数
  createMP4Clip,
  createImgClip,
  createAudioClip,

  // 克隆函数
  cloneMP4Clip,
  cloneImgClip,
  cloneAudioClip,
} from './webavClipUtils'

// ==================== 项目导出工具 ====================
export {
  // 项目导出函数
  exportProject,
  // 导出项目参数接口
  type ExportProjectOptions,
} from './projectExporter'

// ==================== WebAV处理器 ====================
export {
  // WebAV处理器类
  WebAVProcessor,

  // 类型定义
  type WebAVProcessingResult,
} from './WebAVProcessor'
