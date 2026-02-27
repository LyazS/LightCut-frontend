import { ScriptExecutor } from '@/aipanel/agent/executors/ScriptExecutor'
import { useBatchCommandBuilder } from '@/aipanel/agent/composables/useBatchCommandBuilder'
import { ConfigValidator } from '@/aipanel/agent/core/ConfigValidator'
import { framesToTimecode } from '@/core/utils/timeUtils'
import { calculateVisibleFrameRange } from '@/core/utils/timelineScaleUtils'
import { useUnifiedStore } from '@/core/unifiedStore'

// 导入共享类型定义
import type {
  BuildResult,
  BuildOperationResult,
  ExecutionResult,
  LogMessage,
  ValidationError,
  ScriptExecutionResult,
} from '@/aipanel/agent/core/types'

type EditSDKReturn = ReturnType<typeof createEditSDK>

// 单例缓存
let editSDKCache: EditSDKReturn | null = null

/**
 * 代理媒体信息接口 - 用于list_medias函数返回的数据结构
 */
export interface AgentMediaInfo {
  /** 素材名称 */
  name: string
  /** 素材唯一标识符 */
  id: string
  /** 素材类型（loading、error、video、image、audio、text） */
  mediaType: 'loading' | 'error' | 'video' | 'image' | 'audio' | 'text'
  /** 素材时长（时间码格式：HH:MM:SS.FF） */
  duration: string
  /** 素材宽度（可选，主要针对视频和图片素材） */
  width?: number
  /** 素材高度（可选，主要针对视频和图片素材） */
  height?: number
}

/**
 * 视觉媒体通用属性接口（视频、图片、文本共用）
 */
export interface VisualMediaProperties {
  /** 水平位置 */
  x: number
  /** 垂直位置 */
  y: number
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
  /** 旋转角度（弧度） */
  rotation: number
  /** 透明度（0-1） */
  opacity: number
}

/**
 * 音频媒体属性接口
 */
export interface AudioMediaProperties {
  /** 音量（0-1） */
  volume: number
  /** 静音状态 */
  isMuted: boolean
  /** 增益（dB） */
  gain: number
}

/**
 * 文本样式属性接口
 */
export interface TextStyleProperties {
  /** 文本内容 */
  text: string
  /** 字体大小 */
  fontSize: number
  /** 字体族 */
  fontFamily: string
  /** 字重 */
  fontWeight: string | number
  /** 字体样式 */
  fontStyle: 'normal' | 'italic'
  /** 文字颜色 */
  color: string
  /** 背景颜色 */
  backgroundColor?: string
  /** 文本对齐 */
  textAlign: 'left' | 'center' | 'right'
  /** 行高 */
  lineHeight?: number
  /** 最大宽度 */
  maxWidth?: number
  /** 文字阴影 */
  textShadow?: string
  /** 文字描边 */
  textStroke?: {
    width: number
    color: string
  }
  /** 文字发光 */
  textGlow?: {
    color: string
    blur: number
    spread?: number
  }
  /** 自定义字体 */
  customFont?: {
    name: string
    url: string
  }
}

/**
 * 代理时间轴项目信息接口 - 用于list_timelineitems函数返回的数据结构
 */
export interface AgentTimelineItemInfo {
  /** 时间轴项目ID */
  id: string
  /** 关联的素材ID */
  mediaItemId: string
  /** 素材类型（loading、error、video、image、audio、text） */
  mediaType: 'loading' | 'error' | 'video' | 'image' | 'audio' | 'text'
  /** 时间轴时间范围（时间码格式：HH:MM:SS.FF - HH:MM:SS.FF） */
  timelineTimeRange: string
  /** 素材内部剪辑时间范围（时间码格式：HH:MM:SS.FF - HH:MM:SS.FF） */
  clipTimeRange: string
  /** 视觉媒体属性（视频、图片、文本） */
  visual?: VisualMediaProperties
  /** 音频媒体属性（音频、视频） */
  audio?: AudioMediaProperties
  /** 文本样式属性（仅文本） */
  textStyle?: TextStyleProperties
}

/**
 * 创建音视频编辑SDK实例
 *
 * 提供完整的三阶段执行流程协调功能
 */
function createEditSDK() {
  // 使用统一存储
  const unifiedStore = useUnifiedStore()

  // 创建批量命令构建器
  const batchCommandBuilder = useBatchCommandBuilder()

  // 创建配置验证器
  const configValidator = new ConfigValidator()

  /**
   * 执行用户脚本 - 核心执行函数
   *
   * 协调音视频编辑四阶段执行流程：
   * 1. 脚本执行 → 2. 配置验证 → 3. 命令构建 → 4. 批量执行
   */
  async function executeUserScript(userScript: string, timeout: number = 5000): Promise<string> {
    let allLogs: LogMessage[] = []
    let scriptExecutionError: string | undefined = undefined
    let validationErrors: ValidationError[] | undefined = undefined
    let buildOperationErrors: BuildOperationResult[] | undefined = undefined
    let batchExecutionError: string | undefined = undefined

    try {
      // 阶段1: 脚本执行
      const result = await executeScriptPhase(userScript, timeout)
      const { operations, logs, error } = result
      allLogs = logs || []
      scriptExecutionError = error

      if (!operations || operations.length === 0) {
        const executionResult: ExecutionResult = {
          success: !scriptExecutionError,
          operationCount: 0,
          logs: allLogs,
          scriptExecutionError,
        }
        return generateExecutionReport(executionResult)
      }

      // 阶段2: 配置验证
      validationErrors = configValidator.validateOperations(operations)
      if (validationErrors.length > 0) {
        const executionResult: ExecutionResult = {
          success: false,
          logs: allLogs,
          scriptExecutionError,
          validationErrors,
        }
        return generateExecutionReport(executionResult)
      }

      // 阶段3: 命令构建
      const buildResult = await batchCommandBuilder.buildOperations(operations)

      if (buildResult.buildResults.some((r) => !r.success)) {
        buildOperationErrors = buildResult.buildResults.filter((r) => !r.success)
        const executionResult: ExecutionResult = {
          success: false,
          logs: allLogs,
          scriptExecutionError,
          validationErrors,
          buildOperationErrors,
        }
        return generateExecutionReport(executionResult)
      }

      // 阶段4: 批量执行
      const executionResult = await executeCommandsPhase(buildResult)
      if (executionResult) {
        batchExecutionError = executionResult
        const executionResultObj: ExecutionResult = {
          success: false,
          logs: allLogs,
          scriptExecutionError,
          validationErrors,
          buildOperationErrors,
          batchExecutionError,
        }
        return generateExecutionReport(executionResultObj)
      }

      const finalResult: ExecutionResult = {
        success: true,
        operationCount: operations.length,
      }
      return generateExecutionReport(finalResult)
    } catch (error: any) {
      const executionResult: ExecutionResult = {
        success: false,
        logs: allLogs,
        scriptExecutionError,
        validationErrors,
        buildOperationErrors,
        batchExecutionError,
      }
      return generateExecutionReport(executionResult)
    }
  }

  /**
   * 阶段1: 脚本执行
   *
   * 在沙箱环境中执行用户代码，生成音视频编辑操作配置
   */
  async function executeScriptPhase(
    userScript: string,
    timeout: number,
  ): Promise<ScriptExecutionResult> {
    // 每次执行时创建新的ScriptExecutor实例
    const scriptExecutor = new ScriptExecutor()
    const result = await scriptExecutor.executeScript(userScript, timeout)
    // 确保资源被清理
    scriptExecutor.destroy()
    return result
  }

  /**
   * 阶段3: 批量执行
   *
   * 执行构建好的音视频编辑批量命令
   */
  async function executeCommandsPhase(buildResult: BuildResult): Promise<string | null> {
    try {
      // 执行批量命令
      await buildResult.batchCommand.execute()

      // 创建成功结果
      return null
    } catch (error: any) {
      // 批量执行失败
      return error.message
    }
  }

  /**
   * 生成执行结果报告
   *
   * 根据ExecutionResult生成详细的执行报告，根据错误字段的递进关系决定显示哪些阶段
   */
  function generateExecutionReport(result: ExecutionResult): string {
    const lines: string[] = []

    // 标题
    lines.push(`音视频编辑: ${result.success ? '✅ 成功' : '❌ 失败'}`)
    lines.push('')

    // 操作数量信息
    if (result.operationCount !== undefined && result.operationCount > 0) {
      lines.push(`操作数量: ${result.operationCount}`)
    }

    // 脚本执行阶段 - 总是显示
    if (result.scriptExecutionError) {
      lines.push(`❌ 代码执行报错:`)
      lines.push(result.scriptExecutionError)
    }

    // 验证阶段 - 只有在没有脚本执行错误时才显示
    if (!result.scriptExecutionError) {
      if (result.validationErrors && result.validationErrors.length > 0) {
        lines.push(`❌ 验证失败 (${result.validationErrors.length} 个错误):`)
        result.validationErrors.forEach((error, index) => {
          lines.push(`  ${index + 1}. 操作类型: ${error.operation.type}`)
          lines.push(`     错误: ${error.error}`)
        })
      }
    }

    // 命令构建阶段 - 只有在没有脚本执行错误和验证错误时才显示
    if (
      !result.scriptExecutionError &&
      (!result.validationErrors || result.validationErrors.length === 0)
    ) {
      if (result.buildOperationErrors && result.buildOperationErrors.length > 0) {
        lines.push(`❌ 构建失败 (${result.buildOperationErrors.length} 个错误):`)
        result.buildOperationErrors.forEach((error, index) => {
          lines.push(`  ${index + 1}. 操作类型: ${error.operation.type}`)
          if (error.error) {
            lines.push(`     错误: ${error.error}`)
          }
        })
      }
    }

    // 批量执行阶段 - 只有在没有前面阶段的错误时才显示
    if (
      !result.scriptExecutionError &&
      (!result.validationErrors || result.validationErrors.length === 0) &&
      (!result.buildOperationErrors || result.buildOperationErrors.length === 0)
    ) {
      if (result.batchExecutionError) {
        lines.push(`❌ 执行失败: ${result.batchExecutionError}`)
      }
    }

    // 日志信息 - 总是显示
    if (result.logs && result.logs.length > 0) {
      lines.push('')
      lines.push('--- 代码执行日志 ---')
      result.logs.forEach((log, index) => {
        lines.push(`[${log.type.toUpperCase()}] ${log.message}`)
      })
    }

    return lines.join('\n')
  }

  /**
   * 列出所有媒体素材
   * 返回每个素材的名字、ID、素材类型、时长（时间码格式）
   * 对于视频和图片素材，还会包含宽高信息
   * 媒体类型会根据加载状态进行映射：loading/error/正常媒体类型
   */
  function list_medias(): AgentMediaInfo[] {
    const mediaItems = unifiedStore.getAllMediaItems()
    return mediaItems.map((mediaItem) => {
      // 根据媒体状态映射媒体类型
      let agentMediaType: AgentMediaInfo['mediaType']

      switch (mediaItem.mediaStatus) {
        case 'pending':
        case 'asyncprocessing':
        case 'decoding':
          agentMediaType = 'loading'
          break
        case 'error':
        case 'cancelled':
        case 'missing':
          agentMediaType = 'error'
          break
        case 'ready':
          // 正常状态，使用实际的媒体类型，unknown类型也映射为loading
          if (mediaItem.mediaType === 'unknown') {
            agentMediaType = 'loading'
          } else {
            agentMediaType = mediaItem.mediaType
          }
          break
        default:
          // 对于未知状态，默认使用loading
          agentMediaType = 'loading'
      }

      const baseInfo: AgentMediaInfo = {
        name: mediaItem.name,
        id: mediaItem.id,
        mediaType: agentMediaType,
        duration: mediaItem.duration ? framesToTimecode(mediaItem.duration) : '00:00:00.00',
      }

      // 对于视频和图片素材，添加宽高信息（仅在就绪状态下）
      if (
        mediaItem.mediaStatus === 'ready' &&
        mediaItem.runtime.bunny?.originalWidth &&
        mediaItem.runtime.bunny?.originalHeight
      ) {
        baseInfo.width = mediaItem.runtime.bunny.originalWidth
        baseInfo.height = mediaItem.runtime.bunny.originalHeight
      }

      return baseInfo
    })
  }

  /**
   * 列出所有时间轴项目
   * 返回每个时间轴项目的ID、对应素材的ID、素材类型、时间范围（时间码格式）
   * 包含时间轴位置、素材内部剪辑信息和素材维度信息
   * @param includeInvisible 是否包含不可见范围内的时间轴项目（默认false）
   */
  function list_timelineitems(includeInvisible: boolean = false): AgentTimelineItemInfo[] {
    const timelineItems = unifiedStore.timelineItems

    // 如果不需要包含不可见项目，计算可视范围
    let visibleStartFrame = 0
    let visibleEndFrame = Infinity

    if (!includeInvisible) {
      // 使用与 useTimelineTimeScale 相同的计算方法计算可见帧数范围
      const { startFrames, endFrames } = calculateVisibleFrameRange(
        unifiedStore.TimelineContainerWidth,
        unifiedStore.totalDurationFrames,
        unifiedStore.zoomLevel,
        unifiedStore.scrollOffset,
        unifiedStore.maxVisibleDurationFrames,
      )
      visibleStartFrame = startFrames
      visibleEndFrame = endFrames
    }

    return timelineItems
      .filter((timelineItem) => {
        // 如果不需要包含不可见项目，检查时间轴项目是否在可视范围内
        if (!includeInvisible) {
          const itemStart = timelineItem.timeRange.timelineStartTime
          const itemEnd = timelineItem.timeRange.timelineEndTime
          // 检查时间轴项目是否与可视范围有重叠
          return !(itemEnd < visibleStartFrame || itemStart > visibleEndFrame)
        }
        return true
      })
      .map((timelineItem) => {
        // 获取关联的媒体素材信息
        const mediaItem = timelineItem.mediaItemId !== null
          ? unifiedStore.getMediaItem(timelineItem.mediaItemId)
          : undefined

        // 根据媒体状态映射媒体类型（复用list_medias的逻辑）
        let agentMediaType: AgentTimelineItemInfo['mediaType']

        if (!mediaItem) {
          // 如果找不到关联的媒体素材，标记为error
          agentMediaType = 'error'
        } else {
          switch (mediaItem.mediaStatus) {
            case 'pending':
            case 'asyncprocessing':
            case 'decoding':
              agentMediaType = 'loading'
              break
            case 'error':
            case 'cancelled':
            case 'missing':
              agentMediaType = 'error'
              break
            case 'ready':
              // 正常状态，使用实际的媒体类型，unknown类型也映射为loading
              if (mediaItem.mediaType === 'unknown') {
                agentMediaType = 'loading'
              } else {
                agentMediaType = mediaItem.mediaType
              }
              break
            default:
              // 对于未知状态，默认使用loading
              agentMediaType = 'loading'
          }
        }

        const timelineStartTimecode = framesToTimecode(timelineItem.timeRange.timelineStartTime)
        const timelineEndTimecode = framesToTimecode(timelineItem.timeRange.timelineEndTime)
        const clipStartTimecode = framesToTimecode(timelineItem.timeRange.clipStartTime)
        const clipEndTimecode = framesToTimecode(timelineItem.timeRange.clipEndTime)

        const baseInfo: AgentTimelineItemInfo = {
          id: timelineItem.id,
          mediaItemId: timelineItem.mediaItemId ?? '', // 如果为 null，使用空字符串
          mediaType: agentMediaType,
          timelineTimeRange: `${timelineStartTimecode} - ${timelineEndTimecode}`,
          clipTimeRange: `${clipStartTimecode} - ${clipEndTimecode}`,
        }

        // 对于就绪状态的媒体，添加详细的配置信息
        if (mediaItem && mediaItem.mediaStatus === 'ready') {
          const config = timelineItem.config

          // 根据媒体类型填充详细信息
          switch (timelineItem.mediaType) {
            case 'video':
            case 'image':
            case 'text':
              // 视觉媒体通用属性
              if ('x' in config)
                baseInfo.visual = {
                  x: config.x,
                  y: config.y || 0,
                  width: config.width || 0,
                  height: config.height || 0,
                  rotation: config.rotation || 0,
                  opacity: config.opacity || 1,
                }
              if ('y' in config && baseInfo.visual) baseInfo.visual.y = config.y
              if ('width' in config && baseInfo.visual) baseInfo.visual.width = config.width
              if ('height' in config && baseInfo.visual) baseInfo.visual.height = config.height
              if ('rotation' in config && baseInfo.visual)
                baseInfo.visual.rotation = config.rotation
              if ('opacity' in config && baseInfo.visual) baseInfo.visual.opacity = config.opacity

              // 视频特有属性
              if (timelineItem.mediaType === 'video') {
                if ('volume' in config)
                  baseInfo.audio = {
                    volume: config.volume,
                    isMuted: config.isMuted || false,
                    gain: 0,
                  }
                if ('isMuted' in config && baseInfo.audio) baseInfo.audio.isMuted = config.isMuted
              }

              // 文本特有属性
              if (timelineItem.mediaType === 'text' && 'text' in config) {
                baseInfo.textStyle = {
                  text: config.text,
                  fontSize: config.style.fontSize,
                  fontFamily: config.style.fontFamily,
                  fontWeight: config.style.fontWeight,
                  fontStyle: config.style.fontStyle,
                  color: config.style.color,
                  textAlign: config.style.textAlign,
                  lineHeight: config.style.lineHeight,
                  backgroundColor: config.style.backgroundColor,
                  textShadow: config.style.textShadow,
                  textStroke: config.style.textStroke,
                  textGlow: config.style.textGlow,
                  maxWidth: config.style.maxWidth,
                  customFont: config.style.customFont,
                }
              }
              break

            case 'audio':
              // 音频媒体属性
              if ('volume' in config)
                baseInfo.audio = {
                  volume: config.volume,
                  isMuted: config.isMuted || false,
                  gain: 0,
                }
              if ('isMuted' in config && baseInfo.audio) baseInfo.audio.isMuted = config.isMuted
              break
          }
        }

        return baseInfo
      })
  }

  // 返回组合式API接口
  return {
    // 核心函数
    executeUserScript,
    // 环境读取函数
    list_medias,
    list_timelineitems,
  }
}

/**
 * 音视频编辑SDK组合式函数（单例模式）
 *
 * 提供完整的三阶段执行流程协调功能
 * 使用单例缓存确保整个应用共享同一个实例
 */
export function useEditSDK() {
  if (!editSDKCache) {
    editSDKCache = createEditSDK()
  }
  return editSDKCache
}
