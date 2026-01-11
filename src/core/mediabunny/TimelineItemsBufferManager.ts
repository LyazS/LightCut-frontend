/**
 * Timeline Items 双缓冲管理器
 * 
 * 优化渲染性能，只处理当前播放时间窗口内的 timeline items
 * 使用双缓冲机制避免更新与使用冲突
 */

import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { MediaType } from '@/core/mediaitem/types'
import { TimelineItemQueries } from '@/core/timelineitem/queries'

/**
 * 缓冲区数据结构
 */
interface TimelineItemsBuffer {
  /** 缓冲的 items 列表 */
  items: UnifiedTimelineItemData<MediaType>[]
  
  /** 缓冲的时间窗口起始帧 */
  startFrame: number
  
  /** 缓冲的时间窗口结束帧 */
  endFrame: number
  
  /** 缓冲创建时间戳（用于调试） */
  timestamp: number
  
  /** 缓冲是否有效 */
  isValid: boolean
}

/**
 * 双缓冲管理器状态
 */
interface DoubleBufferState {
  /** 前台缓冲（正在使用） */
  frontBuffer: TimelineItemsBuffer | null
  
  /** 后台缓冲（正在更新） */
  backBuffer: TimelineItemsBuffer | null
  
  /** 后台缓冲是否就绪可交换 */
  backBufferReady: boolean
  
  /** 上次更新缓冲的帧位置 */
  lastUpdateFrame: number
  
  /** 缓冲窗口大小（帧数） */
  bufferWindowFrames: number
  
  /** 更新触发阈值（帧数） */
  updateThresholdFrames: number
  
  /** 是否正在更新后台缓冲 */
  isUpdating: boolean
  
  /** 已准备好解码器的 clip ID 集合 */
  readyClips: Set<string>
}

/**
 * Timeline Items 双缓冲管理器
 */
export class TimelineItemsBufferManager {
  private state: DoubleBufferState
  
  constructor(fps: number = 30) {
    this.state = {
      frontBuffer: null,
      backBuffer: null,
      backBufferReady: false,
      lastUpdateFrame: -1,
      bufferWindowFrames: Math.floor(fps * 1.0),  // 1秒窗口
      updateThresholdFrames: Math.floor(fps * 0.5), // 0.5秒触发
      isUpdating: false,
      readyClips: new Set<string>(),
    }
  }
  
  /**
   * 检查是否需要更新缓冲
   */
  shouldUpdateBuffer(currentFrame: number): boolean {
    // 如果没有前台缓冲，需要初始化
    if (!this.state.frontBuffer) {
      return true
    }
    
    // 如果正在更新，不重复触发
    if (this.state.isUpdating) {
      return false
    }
    
    // 检查是否播放了足够的帧数（0.5秒）
    const framesSinceLastUpdate = currentFrame - this.state.lastUpdateFrame
    return framesSinceLastUpdate >= this.state.updateThresholdFrames
  }
  
  /**
   * 异步更新后台缓冲
   */
  async updateBackBuffer(
    allItems: UnifiedTimelineItemData<MediaType>[],
    currentFrame: number,
  ): Promise<void> {
    if (this.state.isUpdating) {
      return
    }
    
    this.state.isUpdating = true
    this.state.backBufferReady = false
    
    try {
      // 计算时间窗口
      const startFrame = currentFrame
      const endFrame = currentFrame + this.state.bufferWindowFrames
      
      // 过滤出窗口内的 items
      const bufferedItems = this.filterItemsInWindow(
        allItems,
        startFrame,
        endFrame,
      )
      
      // ✨ 预准备解码器：为新进入缓冲的 clips 调用 prepare()
      await this.prepareClipsInBuffer(bufferedItems)
      
      // 创建新的后台缓冲
      this.state.backBuffer = {
        items: bufferedItems,
        startFrame,
        endFrame,
        timestamp: Date.now(),
        isValid: true,
      }
      
      // 标记后台缓冲就绪
      this.state.backBufferReady = true
      this.state.lastUpdateFrame = currentFrame
      
      console.log(`🔄 后台缓冲更新完成: ${bufferedItems.length}/${allItems.length} items, 窗口 [${startFrame}, ${endFrame}]`)
    } catch (error) {
      console.error('❌ 后台缓冲更新失败:', error)
      this.state.backBuffer = null
      this.state.backBufferReady = false
    } finally {
      this.state.isUpdating = false
    }
  }
  
  /**
   * 为缓冲中的 clips 预准备解码器
   * 只为尚未准备的 clips 调用 prepare()
   */
  private async prepareClipsInBuffer(
    items: UnifiedTimelineItemData<MediaType>[],
  ): Promise<void> {
    const preparePromises: Promise<void>[] = []
    
    for (const item of items) {
      // 只处理视频和音频类型的 items
      if (
        !TimelineItemQueries.isVideoTimelineItem(item) &&
        !TimelineItemQueries.isAudioTimelineItem(item)
      ) {
        continue
      }
      
      const bunnyClip = item.runtime.bunnyClip
      if (!bunnyClip) {
        continue
      }
      
      // 检查是否已经准备过
      if (this.state.readyClips.has(item.id)) {
        continue
      }
      
      // 异步调用 prepare() 并添加到 readyClips
      const prepareTask = bunnyClip.prepare().then(() => {
        this.state.readyClips.add(item.id)
        console.log(`✅ Clip 解码器已准备: ${item.id}`)
      }).catch((error) => {
        console.error(`❌ Clip 解码器准备失败: ${item.id}`, error)
      })
      
      preparePromises.push(prepareTask)
    }
    
    // 等待所有 prepare 完成
    if (preparePromises.length > 0) {
      console.log(`🔧 开始准备 ${preparePromises.length} 个 clip 的解码器...`)
      await Promise.all(preparePromises)
      console.log(`✅ 所有 clip 解码器准备完成`)
    }
  }
  
  /**
   * 交换前后台缓冲
   */
  swapBuffers(): void {
    if (!this.state.backBufferReady || !this.state.backBuffer) {
      return
    }
    
    // 交换缓冲
    const temp = this.state.frontBuffer
    this.state.frontBuffer = this.state.backBuffer
    this.state.backBuffer = temp
    
    // 重置后台缓冲状态
    this.state.backBufferReady = false
    
    console.log(`🔀 缓冲交换完成: 前台缓冲 ${this.state.frontBuffer.items.length} items`)
  }
  
  /**
   * 获取当前应该使用的 items
   */
  getItemsForRendering(
    allItems: UnifiedTimelineItemData<MediaType>[],
    currentFrame: number,
  ): UnifiedTimelineItemData<MediaType>[] {
    // 1. 检查是否可以交换缓冲
    if (this.state.backBufferReady) {
      this.swapBuffers()
    }
    
    // 2. 检查前台缓冲是否有效
    if (this.state.frontBuffer && this.state.frontBuffer.isValid) {
      // 验证当前帧是否在缓冲窗口内
      if (
        currentFrame >= this.state.frontBuffer.startFrame &&
        currentFrame <= this.state.frontBuffer.endFrame
      ) {
        return this.state.frontBuffer.items
      }
    }
    
    // 3. 缓冲无效或不在窗口内，降级为全量遍历
    console.warn(`⚠️ 缓冲无效，使用全量遍历 (frame: ${currentFrame})`)
    return allItems
  }
  
  /**
   * 清空所有缓冲（用于 seek）
   */
  clearBuffers(): void {
    this.state.frontBuffer = null
    this.state.backBuffer = null
    this.state.backBufferReady = false
    this.state.lastUpdateFrame = -1
    this.state.isUpdating = false
    // ✨ Seek 时清空 readyClips，因为解码器状态可能已失效
    this.state.readyClips.clear()
    
    console.log('🧹 缓冲已清空（包括解码器准备状态）')
  }
  
  /**
   * 过滤出时间窗口内的 items
   */
  private filterItemsInWindow(
    allItems: UnifiedTimelineItemData<MediaType>[],
    startFrame: number,
    endFrame: number,
  ): UnifiedTimelineItemData<MediaType>[] {
    return allItems.filter((item) => {
      // item 的时间范围：[timelineStartTime, timelineEndTime]
      const itemStart = item.timeRange.timelineStartTime
      const itemEnd = item.timeRange.timelineEndTime
      
      // 检查是否有重叠：item 结束 >= 窗口开始 && item 开始 <= 窗口结束
      return itemEnd >= startFrame && itemStart <= endFrame
    })
  }
  
  /**
   * 获取缓冲统计信息（用于调试）
   */
  getStats(): {
    hasFrontBuffer: boolean
    frontBufferSize: number
    hasBackBuffer: boolean
    backBufferReady: boolean
    isUpdating: boolean
    readyClipsCount: number
  } {
    return {
      hasFrontBuffer: !!this.state.frontBuffer,
      frontBufferSize: this.state.frontBuffer?.items.length || 0,
      hasBackBuffer: !!this.state.backBuffer,
      backBufferReady: this.state.backBufferReady,
      isUpdating: this.state.isUpdating,
      readyClipsCount: this.state.readyClips.size,
    }
  }
}