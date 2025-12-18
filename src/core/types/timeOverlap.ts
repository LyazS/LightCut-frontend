/**
 * 时间重叠检测相关接口
 * 统一处理时间重叠检测的类型定义
 */

// ==================== 时间重叠检测相关接口 ====================

/**
 * 重叠检测时间范围接口 - 用于时间重叠检测的统一时间范围表示
 */
export interface OverlapTimeRange {
  start: number // 开始时间（帧数）
  end: number // 结束时间（帧数）
}

/**
 * 重叠检测结果
 */
export interface OverlapResult {
  hasOverlap: boolean // 是否有重叠
  overlapStart: number // 重叠开始时间（帧数）
  overlapEnd: number // 重叠结束时间（帧数）
  overlapDuration: number // 重叠时长（帧数）
}

/**
 * 冲突信息 - 用于拖拽预览等场景
 */
export interface ConflictInfo {
  itemId: string
  startTime: number
  endTime: number
  overlapStart: number
  overlapEnd: number
}
