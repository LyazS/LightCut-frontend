import { useUnifiedStore } from '@/core/unifiedStore'

/**
 * 统一的播放控制工具函数
 * 提供可复用的播放控制逻辑，避免代码重复
 *
 * 新架构特点：
 * 1. 使用 unifiedStore 替代旧的 videoStore
 * 2. 使用 UnifiedPlaybackModule 和 UnifiedWebavModule
 * 3. 保持原有功能的同时，适应新的模块化架构
 */
export function usePlaybackControls() {
  const unifiedStore = useUnifiedStore()

  /**
   * 安全地暂停播放
   * 在需要暂停播放进行编辑操作时调用
   * @param reason 暂停原因，用于调试日志
   */
  function pauseForEditing(reason: string = '编辑操作') {
    if (unifiedStore.isWebAVReadyGlobal() && unifiedStore.isPlaying) {
      console.log(`⏸️ 因${reason}暂停播放`)
      unifiedStore.webAVPause()
      return true // 返回是否实际执行了暂停
    }
    return false
  }

  /**
   * 检查WebAV是否就绪，如果未就绪则显示警告
   * @param operation 操作名称，用于错误日志
   * @returns 是否就绪
   */
  function ensureWebAVReady(operation: string = '操作'): boolean {
    if (!unifiedStore.isWebAVReadyGlobal()) {
      console.warn(`⚠️ WebAV canvas not ready for ${operation}`)
      return false
    }
    return true
  }

  /**
   * 安全地执行播放控制操作
   * @param operation 要执行的操作函数
   * @param operationName 操作名称，用于日志
   * @returns 操作是否成功执行
   */
  function safePlaybackOperation(operation: () => void, operationName: string): boolean {
    if (!ensureWebAVReady(operationName)) {
      return false
    }

    try {
      operation()
      return true
    } catch (error) {
      console.error(`❌ ${operationName}执行失败:`, error)
      return false
    }
  }

  /**
   * 重启播放（用于播放速度变更等场景）
   * @param delay 重启延迟时间（毫秒）
   */
  function restartPlayback(delay: number = 50) {
    if (!ensureWebAVReady('重启播放')) return

    const wasPlaying = unifiedStore.isPlaying
    if (wasPlaying) {
      console.log('🔄 重启播放以应用新设置')
      unifiedStore.webAVPause()
      setTimeout(() => {
        if (unifiedStore.isWebAVReadyGlobal()) {
          unifiedStore.webAVPlay()
        }
      }, delay)
    }
  }

  /**
   * 安全地跳转到指定帧数
   * @param frames 目标帧数
   * @returns 是否成功跳转
   */
  function safeSeekToFrame(frames: number): boolean {
    return safePlaybackOperation(() => {
      unifiedStore.seekToFrame(frames)
    }, '跳转帧数')
  }

  /**
   * 安全地设置播放状态
   * @param playing 是否播放
   * @returns 是否成功设置
   */
  function safeSetPlaying(playing: boolean): boolean {
    return safePlaybackOperation(() => {
      unifiedStore.setPlaying(playing)
    }, '设置播放状态')
  }

  /**
   * 安全地切换播放/暂停状态
   * @returns 是否成功切换
   */
  function safeTogglePlayPause(): boolean {
    return safePlaybackOperation(() => {
      unifiedStore.togglePlayPause()
    }, '切换播放状态')
  }

  /**
   * 安全地停止播放
   * @returns 是否成功停止
   */
  function safeStop(): boolean {
    return safePlaybackOperation(() => {
      unifiedStore.stop()
    }, '停止播放')
  }

  /**
   * 安全地设置播放速度
   * @param rate 播放速度倍率
   * @returns 是否成功设置
   */
  function safeSetPlaybackRate(rate: number): boolean {
    return safePlaybackOperation(() => {
      unifiedStore.setPlaybackRate(rate)
    }, '设置播放速度')
  }

  /**
   * 安全地重置播放速度
   * @returns 是否成功重置
   */
  function safeResetPlaybackRate(): boolean {
    return safePlaybackOperation(() => {
      unifiedStore.resetPlaybackRate()
    }, '重置播放速度')
  }

  /**
   * 安全地跳到下一帧
   * @returns 是否成功跳转
   */
  function safeNextFrame(): boolean {
    return safePlaybackOperation(() => {
      unifiedStore.nextFrame()
    }, '跳到下一帧')
  }

  /**
   * 安全地跳到上一帧
   * @returns 是否成功跳转
   */
  function safePreviousFrame(): boolean {
    return safePlaybackOperation(() => {
      unifiedStore.previousFrame()
    }, '跳到上一帧')
  }

  /**
   * 安全地相对跳转帧数
   * @param deltaFrames 帧数偏移量（可为负数）
   * @returns 是否成功跳转
   */
  function safeSeekByFrames(deltaFrames: number): boolean {
    return safePlaybackOperation(() => {
      unifiedStore.seekByFrames(deltaFrames)
    }, '相对跳转帧数')
  }

  return {
    // 原有功能
    pauseForEditing,
    ensureWebAVReady,
    safePlaybackOperation,
    restartPlayback,

    // 新增的安全操作方法
    safeSeekToFrame,
    safeSetPlaying,
    safeTogglePlayPause,
    safeStop,
    safeSetPlaybackRate,
    safeResetPlaybackRate,
    safeNextFrame,
    safePreviousFrame,
    safeSeekByFrames,
  }
}
