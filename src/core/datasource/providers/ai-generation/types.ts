/**
 * AI生成数据源类型定义
 * 集中管理所有AI生成相关的类型、接口和枚举
 */

// ==================== 枚举定义 ====================

/**
 * AI任务类型枚举
 */
export enum AITaskType {
  TEXT_TO_IMAGE = 'text_to_image',
  REMOTE_IMAGE = 'remote_image',
  BIZYAIR_GENERATE_MEDIA = 'bizyair_generate_media',
}

/**
 * 内容类型枚举
 */
export enum ContentType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * 流事件类型枚举
 */
export enum TaskStreamEventType {
  PROGRESS_UPDATE = 'progress_update',
  ERROR = 'error',
  FINAL = 'final',
  HEARTBEAT = 'heartbeat',
}

// ==================== 请求和配置接口 ====================

/**
 * 媒体生成请求接口（3字段结构）
 */
export interface MediaGenerationRequest {
  ai_task_type: AITaskType
  content_type: ContentType
  task_config: Record<string, any>
}

/**
 * 文生图任务配置
 */
export interface TextToImageConfig {
  text: string
  width?: number
  height?: number
  style?: string
  quality?: string
  format?: string
}

// ==================== 流事件接口 ====================

/**
 * 流事件基础接口
 */
interface BaseTaskStreamEvent {
  task_id: string
  timestamp: string
}

/**
 * 进度更新事件
 */
export interface ProgressUpdateEvent extends BaseTaskStreamEvent {
  type: TaskStreamEventType.PROGRESS_UPDATE
  status: TaskStatus
  progress: number
  message: string
  metadata?: Record<string, any>
}

/**
 * 最终事件（任务完成/失败/取消）
 */
export interface FinalEvent extends BaseTaskStreamEvent {
  type: TaskStreamEventType.FINAL
  status: TaskStatus
  progress: number
  message: string
  result_path?: string // 任务结果路径（仅完成时有值）
}

/**
 * 错误事件（系统错误，不是任务失败）
 */
export interface ErrorEvent extends BaseTaskStreamEvent {
  type: TaskStreamEventType.ERROR
  message: string
}

/**
 * 心跳事件
 */
export interface HeartbeatEvent extends BaseTaskStreamEvent {
  type: TaskStreamEventType.HEARTBEAT
  message: string
}

/**
 * 流事件联合类型
 */
export type TaskStreamEvent = ProgressUpdateEvent | FinalEvent | ErrorEvent | HeartbeatEvent

// ==================== 处理器相关类型 ====================

/**
 * 媒体类型信息接口
 */
export interface MediaTypeInfo {
  mimeType: string
  extension: string
}

/**
 * 文件准备结果类型
 */
export type PrepareFileResult =
  | {
      success: true
      file: File
      mediaType: 'image' | 'video' | 'audio' | null
      needSaveMeta: boolean // 是否需要保存 meta 文件
      needSaveMedia: boolean // 是否需要保存媒体文件
    }
  | {
      success: false
      error: string
      needSaveMeta: boolean // 失败时也需要保存 meta（持久化失败状态）
    }

// ==================== AI 生成配置类型 ====================

/**
 * 多语言文本类型
 */
export interface I18nText {
  en: string
  zh: string
}

/**
 * UI 配置项基础类型
 */
export interface BaseUIConfig {
  type: string
  label: I18nText
  path: string
}

/**
 * 数字输入配置
 */
export interface NumberInputConfig extends BaseUIConfig {
  type: 'number-input'
  min: number
  max: number
  step: number
  precision: number
}

/**
 * 文本域输入配置
 */
export interface TextareaInputConfig extends BaseUIConfig {
  type: 'textarea-input'
}

/**
 * 选择输入配置
 */
export interface SelectInputConfig extends BaseUIConfig {
  type: 'select-input'
  options: Array<{
    label: I18nText
    value: string
  }>
}

/**
 * 文件输入配置
 */
export interface FileInputConfig extends BaseUIConfig {
  type: 'file-input'
  accept?: string[] // 接受的文件类型，如 ['image', 'video']
  placeholder?: I18nText // 占位符文本
  maxFiles?: number // 最大文件数量，默认为 1
}

/**
 * 文件数据接口
 */
export interface FileData {
  // 类型标识符，用于运行时类型检查
  readonly __type__: 'FileData'
  
  name: string
  mediaType: 'video' | 'image' | 'audio'
  mediaItemId?: string
  timelineItemId?: string
  duration?: number
  resolution?: {
    width: number
    height: number
  }
  timeRange?: {
    clipStartTime: number
    clipEndTime: number
    timelineStartTime: number
    timelineEndTime: number
  }
  source: 'media-item' | 'timeline-item'
}

/**
 * 多文件数据类型（数组形式）
 */
export type MultiFileData = FileData[]

/**
 * 文件项状态枚举
 */
export enum FileItemStatus {
  EMPTY = 'empty',   // 空槽位（显示上传框）
  FILLED = 'filled'  // 已填充文件
}

/**
 * 文件槽位接口
 */
export interface FileSlot {
  index: number
  status: FileItemStatus
  fileData: FileData | null
  isDragOver: boolean
  canAcceptDrop: boolean
}

/**
 * UI 配置项联合类型
 */
export type UIConfig =
  | NumberInputConfig
  | TextareaInputConfig
  | SelectInputConfig
  | FileInputConfig

/**
 * AI 生成配置结构
 */
export interface AIGenerateConfig {
  id: string // 配置唯一标识符
  name: I18nText
  description: I18nText
  contentType: ContentType
  aiTaskType: AITaskType
  aiConfig: Record<string, any> // 不再包含 web_app_id
  uiConfig: UIConfig[]
}