/**
 * 统一时间轴工具函数
 * 适配自旧架构的 timeUtils，支持统一类型系统
 */

import type { Ref, WritableComputedRef } from 'vue'
import { TimeConstants } from '@/constants/TimeConstants'

// ==================== 时间码系统常量 ====================
// 使用 TimeConstants.FRAME_RATE 替代

// ==================== 时间计算工具 ====================

/**
 * 计算每帧像素数（帧数版本）
 * @param timelineWidth 时间轴宽度（像素）
 * @param totalDurationFrames 总时长（帧数）
 * @param zoomLevel 缩放级别
 * @returns 每帧像素数
 */
export function calculatePixelsPerFrame(
  timelineWidth: number,
  totalDurationFrames: number,
  zoomLevel: number,
): number {
  return (timelineWidth * zoomLevel) / totalDurationFrames
}

/**
 * 动态扩展时间轴长度（帧数版本）
 * @param targetFrames 目标帧数
 * @param timelineDurationFrames 当前时间轴长度的ref（帧数）
 */
export function expandTimelineIfNeededFrames(
  targetFrames: number,
  timelineDurationFrames: Ref<number> | WritableComputedRef<number>,
) {
  if (targetFrames > timelineDurationFrames.value) {
    // 扩展到目标帧数的1.5倍，确保有足够的空间
    timelineDurationFrames.value = Math.max(targetFrames * 1.5, timelineDurationFrames.value)
    console.log(`📏 [UnifiedTimeUtils] 时间轴扩展到: ${timelineDurationFrames.value} 帧`)
  }
}

/**
 * 格式化文件大小
 * @param bytes 文件大小（字节）
 * @param precision 小数位数（默认为1）
 * @returns 格式化的文件大小字符串
 */
export function formatFileSize(bytes: number, precision: number = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(precision)) + ' ' + sizes[i]
}

// ==================== 时间码转换函数 ====================

/**
 * 帧数转换为秒数
 * @param frames 帧数
 * @returns 秒数
 */
export function framesToSeconds(frames: number): number {
  return frames / TimeConstants.FRAME_RATE
}

/**
 * 秒数转换为帧数
 * @param seconds 秒数
 * @returns 帧数（向下取整）
 */
export function secondsToFrames(seconds: number): number {
  return Math.floor(seconds * TimeConstants.FRAME_RATE)
}

/**
 * 帧数转换为微秒（WebAV接口）
 * @param frames 帧数
 * @returns 微秒数
 */
export function framesToMicroseconds(frames: number): number {
  // 使用更精确的计算，避免精度丢失
  return Math.floor((frames / TimeConstants.FRAME_RATE) * 1_000_000)
}

/**
 * 微秒转换为帧数（WebAV接口）
 * @param microseconds 微秒数
 * @returns 帧数（四舍五入到最近整数）
 */
export function microsecondsToFrames(microseconds: number): number {
  // 直接四舍五入，避免精度问题
  return Math.round((microseconds / 1_000_000) * TimeConstants.FRAME_RATE)
}

/**
 * 帧数转换为时间码字符串
 * @param frames 帧数
 * @returns 时间码字符串 "HH:MM:SS.FF"
 */
export function framesToTimecode(frames: number): string {
  const totalSeconds = Math.floor(frames / TimeConstants.FRAME_RATE)
  const remainingFrames = frames % TimeConstants.FRAME_RATE

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${remainingFrames.toString().padStart(2, '0')}`
}

/**
 * 时间码字符串转换为帧数
 * @param timecode 时间码字符串 "HH:MM:SS.FF"
 * @returns 帧数
 * @throws Error 如果时间码格式无效
 */
export function timecodeToFrames(timecode: string): number {
  const match = timecode.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid timecode format: ${timecode}. Expected format: HH:MM:SS.FF`)
  }

  const [, hours, minutes, seconds, frames] = match.map(Number)

  // 验证范围
  if (minutes >= 60 || seconds >= 60 || frames >= TimeConstants.FRAME_RATE) {
    throw new Error(`Invalid timecode values: ${timecode}`)
  }

  return (hours * 3600 + minutes * 60 + seconds) * TimeConstants.FRAME_RATE + frames
}

/**
 * 将帧数对齐到整数帧
 * @param frames 帧数
 * @returns 对齐后的帧数（整数）
 */
export function alignFramesToFrame(frames: number): number {
  return Math.floor(frames)
}

// ==================== 时间轴扩展增强功能 ====================

/**
 * 智能扩展时间轴长度（增强版）
 * @param targetFrames 目标帧数
 * @param timelineDurationFrames 当前时间轴长度的ref（帧数）
 * @param minExpansionRatio 最小扩展比例（默认1.2）
 * @param maxExpansionRatio 最大扩展比例（默认2.0）
 * @returns 是否进行了扩展
 */
export function smartExpandTimelineIfNeeded(
  targetFrames: number,
  timelineDurationFrames: Ref<number> | WritableComputedRef<number>,
  minExpansionRatio: number = 1.2,
  maxExpansionRatio: number = 2.0,
): boolean {
  if (targetFrames > timelineDurationFrames.value) {
    const currentDuration = timelineDurationFrames.value
    const expansionRatio = Math.min(
      Math.max(targetFrames / currentDuration, minExpansionRatio),
      maxExpansionRatio,
    )

    const newDuration = Math.ceil(currentDuration * expansionRatio)
    timelineDurationFrames.value = newDuration

    console.log(
      `📏 [UnifiedTimeUtils] 智能扩展时间轴: ${currentDuration} → ${newDuration} 帧 (比例: ${expansionRatio.toFixed(2)})`,
    )
    return true
  }
  return false
}

/**
 * 批量扩展时间轴以适应多个目标帧数
 * @param targetFramesList 目标帧数数组
 * @param timelineDurationFrames 当前时间轴长度的ref（帧数）
 * @param expansionRatio 扩展比例（默认1.5）
 * @returns 是否进行了扩展
 */
export function batchExpandTimelineIfNeeded(
  targetFramesList: number[],
  timelineDurationFrames: Ref<number> | WritableComputedRef<number>,
  expansionRatio: number = 1.5,
): boolean {
  const maxTargetFrames = Math.max(...targetFramesList)

  if (maxTargetFrames > timelineDurationFrames.value) {
    const newDuration = Math.ceil(maxTargetFrames * expansionRatio)
    const oldDuration = timelineDurationFrames.value
    timelineDurationFrames.value = newDuration

    console.log(
      `📏 [UnifiedTimeUtils] 批量扩展时间轴: ${oldDuration} → ${newDuration} 帧 (适应 ${targetFramesList.length} 个目标)`,
    )
    return true
  }
  return false
}

/**
 * 预测性扩展时间轴长度
 * 根据当前使用情况预测未来可能需要的长度
 * @param currentUsedFrames 当前已使用的帧数
 * @param timelineDurationFrames 当前时间轴长度的ref（帧数）
 * @param usageThreshold 使用率阈值（默认0.8，即80%）
 * @param expansionRatio 扩展比例（默认1.5）
 * @returns 是否进行了扩展
 */
export function predictiveExpandTimeline(
  currentUsedFrames: number,
  timelineDurationFrames: Ref<number> | WritableComputedRef<number>,
  usageThreshold: number = 0.8,
  expansionRatio: number = 1.5,
): boolean {
  const currentDuration = timelineDurationFrames.value
  const usageRatio = currentUsedFrames / currentDuration

  if (usageRatio > usageThreshold) {
    const newDuration = Math.ceil(currentDuration * expansionRatio)
    timelineDurationFrames.value = newDuration

    console.log(
      `📏 [UnifiedTimeUtils] 预测性扩展时间轴: ${currentDuration} → ${newDuration} 帧 (使用率: ${(usageRatio * 100).toFixed(1)}%)`,
    )
    return true
  }
  return false
}

/**
 * 获取时间轴扩展建议
 * @param currentDuration 当前时间轴长度（帧数）
 * @param targetFrames 目标帧数
 * @param currentUsedFrames 当前已使用的帧数
 * @returns 扩展建议对象
 */
export function getTimelineExpansionSuggestion(
  currentDuration: number,
  targetFrames: number,
  currentUsedFrames: number,
): {
  needsExpansion: boolean
  suggestedDuration: number
  expansionRatio: number
  reason: string
} {
  if (targetFrames <= currentDuration) {
    return {
      needsExpansion: false,
      suggestedDuration: currentDuration,
      expansionRatio: 1.0,
      reason: '当前时间轴长度足够',
    }
  }

  const usageRatio = currentUsedFrames / currentDuration
  let expansionRatio: number
  let reason: string

  if (usageRatio > 0.9) {
    // 高使用率，保守扩展
    expansionRatio = Math.max(targetFrames / currentDuration, 1.2)
    reason = '高使用率，保守扩展'
  } else if (usageRatio > 0.7) {
    // 中等使用率，适中扩展
    expansionRatio = Math.max(targetFrames / currentDuration, 1.5)
    reason = '中等使用率，适中扩展'
  } else {
    // 低使用率，积极扩展
    expansionRatio = Math.max(targetFrames / currentDuration, 2.0)
    reason = '低使用率，积极扩展'
  }

  return {
    needsExpansion: true,
    suggestedDuration: Math.ceil(currentDuration * expansionRatio),
    expansionRatio,
    reason,
  }
}
