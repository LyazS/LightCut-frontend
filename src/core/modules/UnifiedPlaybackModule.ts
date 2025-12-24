import { ref, computed } from 'vue'
import { alignFramesToFrame, framesToTimecode } from '@/core/utils/timeUtils'
import { ModuleRegistry, MODULE_NAMES } from '@/core/modules/ModuleRegistry'
import type { UnifiedConfigModule } from '@/core/modules/UnifiedConfigModule'
import type { UnifiedWebavModule } from '@/core/modules/UnifiedWebavModule'

/**
 * 播放控制管理模块
 * 负责管理播放状态和时间控制
 */
export function createUnifiedPlaybackModule(registry: ModuleRegistry) {
  // 通过注册中心获取依赖模块
  const configModule = registry.get<UnifiedConfigModule>(MODULE_NAMES.CONFIG)
  const frameRate = configModule.frameRate
  
  // 获取 WebAV 模块引用（延迟获取，避免循环依赖）
  let webavModule: UnifiedWebavModule | null = null
  const getWebavModule = () => {
    if (!webavModule) {
      webavModule = registry.get<UnifiedWebavModule>(MODULE_NAMES.WEBAV)
    }
    return webavModule
  }
  // ==================== 状态定义 ====================

  // 播放相关状态
  const currentFrame = ref(0) // 当前播放帧数（整数）
  const currentWebAVFrame = ref(0) // 当前播放帧数（整数）
  const isPlaying = ref(false) // 是否正在播放
  const playbackRate = ref(1) // 播放速度倍率

  // ==================== 计算属性 ====================

  /**
   * 格式化当前时间为时间码格式
   */
  const formattedCurrentTime = computed(() => {
    return framesToTimecode(currentFrame.value)
  })

  /**
   * 播放速度的显示文本
   */
  const playbackRateText = computed(() => {
    // 使用容差来处理浮点数精度问题，避免显示1.00x快速
    const tolerance = 0.001
    const rate = playbackRate.value

    if (Math.abs(rate - 1) <= tolerance) {
      return '正常速度'
    } else if (rate < 1 - tolerance) {
      return `${rate.toFixed(1)}x 慢速`
    } else {
      return `${rate.toFixed(1)}x 快速`
    }
  })

  // ==================== 播放控制方法 ====================

  /**
   * 设置当前播放帧数
   * @param frames 帧数
   * @param forceAlign 是否强制对齐到整数帧
   */
  function setCurrentFrame(frames: number) {
    const finalFrames = alignFramesToFrame(frames)
    const clampedFrames = Math.max(0, finalFrames)

    if (currentFrame.value !== clampedFrames) {
      currentFrame.value = clampedFrames
    }
  }

  /**
   * 跳转到指定帧数
   * @param frames 目标帧数
   */
  async function seekToFrame(frames: number): Promise<void> {
    const webav = getWebavModule()
    if (webav.isWebAVReadyGlobal()) {
      await webav.seekTo(frames)
    }
    setCurrentFrame(frames)
    console.log('🎯 跳转到帧:', frames, `(${framesToTimecode(frames)})`)
  }

  /**
   * 相对跳转（帧数）
   * @param deltaFrames 帧数偏移量（可为负数）
   */
  function seekByFrames(deltaFrames: number) {
    const newFrames = currentFrame.value + deltaFrames
    setCurrentFrame(newFrames)
    console.log('⏭️ 相对跳转:', {
      deltaFrames,
      oldFrame: currentFrame.value - deltaFrames,
      newFrame: currentFrame.value,
      timecode: framesToTimecode(currentFrame.value),
    })
  }

  /**
   * 跳转到下一帧
   */
  function nextFrame() {
    seekByFrames(1)
    console.log('⏭️ 下一帧')
  }

  /**
   * 跳转到上一帧
   */
  function previousFrame() {
    seekByFrames(-1)
    console.log('⏮️ 上一帧')
  }

  /**
   * 设置播放状态
   * @param playing 是否播放
   */
  function setPlaying(playing: boolean) {
    if (isPlaying.value !== playing) {
      isPlaying.value = playing
      console.log('▶️ 设置播放状态:', playing ? '播放' : '暂停')
    }
  }

  /**
   * 播放
   */
  async function play(): Promise<void> {
    const webav = getWebavModule()
    if (webav.isWebAVReadyGlobal()) {
      await webav.play()
    }
    setPlaying(true)
  }

  /**
   * 暂停
   */
  async function pause(): Promise<void> {
    const webav = getWebavModule()
    if (webav.isWebAVReadyGlobal()) {
      webav.pause()
    }
    setPlaying(false)
  }

  /**
   * 切换播放/暂停状态
   */
  function togglePlayPause() {
    setPlaying(!isPlaying.value)
    console.log('⏯️ 切换播放状态:', isPlaying.value ? '播放' : '暂停')
  }

  /**
   * 停止播放并回到开始
   */
  async function stop(): Promise<void> {
    const webav = getWebavModule()
    if (webav.isWebAVReadyGlobal()) {
      webav.pause()
      await webav.seekTo(0)
    }
    setPlaying(false)
    setCurrentFrame(0)
    console.log('⏹️ 停止播放')
  }

  /**
   * 设置播放速度
   * @param rate 播放速度倍率
   */
  function setPlaybackRate(rate: number) {
    // 限制播放速度在合理范围内
    const clampedRate = Math.max(0.1, Math.min(10, rate))

    if (playbackRate.value !== clampedRate) {
      const oldRate = playbackRate.value
      playbackRate.value = clampedRate
      console.log('🏃 设置播放速度:', {
        requestedRate: rate,
        oldRate,
        newRate: clampedRate,
        clamped: rate !== clampedRate,
      })
    }
  }

  /**
   * 重置播放速度为正常
   */
  function resetPlaybackRate() {
    setPlaybackRate(1)
    console.log('🔄 重置播放速度为正常')
  }

  /**
   * 获取播放状态摘要
   * @returns 播放状态摘要对象
   */
  function getPlaybackSummary() {
    return {
      currentFrame: currentFrame.value,
      formattedCurrentTime: formattedCurrentTime.value,
      isPlaying: isPlaying.value,
      playbackRate: playbackRate.value,
      playbackRateText: playbackRateText.value,
      frameRate: frameRate.value,
    }
  }

  /**
   * 重置播放状态为默认值
   */
  function resetToDefaults() {
    currentFrame.value = 0
    isPlaying.value = false
    playbackRate.value = 1
    console.log('🔄 播放状态已重置为默认值')
  }

  // ==================== 导出接口 ====================

  return {
    // 状态
    currentFrame,
    currentWebAVFrame,
    isPlaying,
    playbackRate,

    // 计算属性
    formattedCurrentTime,
    playbackRateText,

    // 帧数控制方法
    setCurrentFrame,
    seekToFrame,
    seekByFrames,
    nextFrame,
    previousFrame,

    // 播放控制方法
    setPlaying,
    play,
    pause,
    togglePlayPause,
    stop,
    setPlaybackRate,
    resetPlaybackRate,
    getPlaybackSummary,
    resetToDefaults,
  }
}

// 导出类型定义
export type UnifiedPlaybackModule = ReturnType<typeof createUnifiedPlaybackModule>
