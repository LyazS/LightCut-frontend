/**
 * 缩略图相关常量
 */
export const THUMBNAIL_CONSTANTS = {
  /** 缩略图宽度（像素） */
  WIDTH: 50,

  /** 缩略图高度（像素） */
  HEIGHT: 40,

  /** 缩略图容器顶部偏移量（像素） */
  TOP_OFFSET: 5,

  /** 可见性计算缓冲帧数 */
  VISIBILITY_BUFFER_FRAMES: 100,

  /** 媒体项缩略图最长边尺寸（像素） - 用于 WebAVProcessor 生成缩略图 */
  MEDIA_ITEM_MAX_EDGE: 240,
} as const

/**
 * 缩略图显示模式
 */
export enum ThumbnailMode {
  /** 适应模式 - 保持宽高比，居中显示，两侧或上下留黑边 */
  FIT = 'fit',
  /** 填满模式 - 填满整个容器，可能裁剪部分内容 */
  FILL = 'fill',
}
