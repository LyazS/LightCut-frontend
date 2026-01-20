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
  BLTCY_SORA2 = 'bltcy_sora2',  // BLTCY Sora2 视频生成（支持 T2V 和 I2V）
  RUNNINGHUB_GENERATE_MEDIA = 'runninghub_generate_media',  // RunningHub 媒体生成
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
  NOT_FOUND = 'not_found',
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
  sub_ai_task_type?: string // 子任务类型（可选），用于区分同一服务提供商的不同API类型
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
 * 任务不存在，那就是错误
 */
export interface NotFoundEvent extends BaseTaskStreamEvent {
  type: TaskStreamEventType.NOT_FOUND
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
export type TaskStreamEvent =
  | ProgressUpdateEvent
  | NotFoundEvent
  | FinalEvent
  | ErrorEvent
  | HeartbeatEvent

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
    value: string | number
    add_cost?: number  // 可选的额外成本字段
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
  minFiles?: number // 最小文件数量，默认为 0
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
  EMPTY = 'empty', // 空槽位（显示上传框）
  FILLED = 'filled', // 已填充文件
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
export type UIConfig = NumberInputConfig | TextareaInputConfig | SelectInputConfig | FileInputConfig

/**
 * 上传服务器类型
 */
export type UploadServerType = 'bizyair' | 'bltcy' | 'runninghub' | 'runninghub2'

/**
 * AI 生成配置结构
 */
export interface AIGenerateConfig {
  id: string // 配置唯一标识符
  name: I18nText
  description: I18nText
  contentType: ContentType
  aiTaskType: AITaskType
  uploadServer?: UploadServerType // 上传服务器类型，默认为 'default'
  subAiTaskType?: string // 子任务类型（可选），用于区分同一服务提供商的不同API类型
  cost: number // 生成成本
  aiConfig: Record<string, any> // 不再包含 web_app_id
  uiConfig: UIConfig[]
}
