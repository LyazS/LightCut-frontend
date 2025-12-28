import { ref, computed } from 'vue'
import type { UnifiedTrackData } from '@/core/track/TrackTypes'
import { createUnifiedTrackData } from '@/core/track/TrackTypes'
import { isReady } from '@/core/timelineitem/queries'

/**
 * 统一轨道管理模块
 * 基于新架构的统一类型系统重构的轨道管理功能
 *
 * 主要变化：
 * 1. 使用 UnifiedTrackData 替代原有的 Track 类型
 * 2. 支持更丰富的轨道状态和属性管理
 * 3. 保持与原有模块相同的API接口，便于迁移
 */
export function createUnifiedTrackModule() {
  // ==================== 状态定义 ====================

  // 轨道列表 - 使用统一轨道类型
  const tracks = ref<UnifiedTrackData[]>([])

  // 🔑 计算属性：轨道ID到索引的映射
  // 用于快速查找轨道在数组中的位置，优化渲染排序性能
  // 时间复杂度从 O(n) 优化到 O(1)
  const trackIndexMap = computed(() => {
    const map = new Map<string, number>()
    tracks.value.forEach((track, index) => {
      map.set(track.id, index)
    })
    return map
  })

  // ==================== 轨道管理方法 ====================

  /**
   * 添加新轨道
   * @param type 轨道类型
   * @param name 轨道名称（可选）
   * @param position 插入位置（可选，默认为末尾）
   * @returns 新创建的轨道对象
   */
  function addTrack(trackData: UnifiedTrackData, position?: number): UnifiedTrackData {
    // 检查轨道数据是否有效
    if (!trackData || !trackData.id) {
      throw new Error('无效的轨道数据：缺少必要的轨道信息')
    }

    // 根据位置参数决定插入位置
    if (position !== undefined && position >= 0 && position <= tracks.value.length) {
      tracks.value.splice(position, 0, trackData)
    } else {
      tracks.value.push(trackData)
    }

    console.log('🎵 添加轨道:', {
      id: trackData.id,
      name: trackData.name,
      type: trackData.type,
      position: position !== undefined ? position : tracks.value.length - 1,
      totalTracks: tracks.value.length,
    })

    return trackData
  }

  /**
   * 删除轨道
   * @param trackId 要删除的轨道ID
   */
  async function removeTrack(trackId: string) {
    // 不能删除最后一个轨道
    if (tracks.value.length <= 1) {
      console.warn('⚠️ 不能删除最后一个轨道')
      return
    }

    const trackToRemove = tracks.value.find((t) => t.id === trackId)
    if (!trackToRemove) {
      console.warn('⚠️ 找不到要删除的轨道:', trackId)
      return
    }

    // 动态导入 store 以避免循环依赖
    const { useUnifiedStore } = await import('@/core/unifiedStore')
    const store = useUnifiedStore()

    // 找到该轨道上的所有时间轴项目并删除它们
    const affectedItems = store.timelineItems.filter((item: any) => item.trackId === trackId)

    // 删除该轨道上的所有时间轴项目
    affectedItems.forEach(async (item: any) => {
      await store.removeTimelineItem(item.id)
    })

    // 删除轨道
    const index = tracks.value.findIndex((t) => t.id === trackId)
    if (index > -1) {
      tracks.value.splice(index, 1)
    }

    console.log('🗑️ 删除轨道:', {
      removedTrackId: trackId,
      removedTrackName: trackToRemove.name,
      deletedItemsCount: affectedItems.length,
      remainingTracks: tracks.value.length,
    })
  }

  /**
   * 切换轨道可见性
   * @param trackId 轨道ID
   * @param targetVisibleState 目标可见性状态（可选），如果提供则将轨道设置为指定状态
   */
  async function toggleTrackVisibility(trackId: string, targetVisibleState?: boolean) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) {
      console.warn('⚠️ 找不到轨道:', trackId)
      return
    }

    // 音频轨道不支持可见性控制，只支持静音控制
    if (track.type === 'audio') {
      console.warn('⚠️ 音频轨道不支持可见性控制，请使用静音功能')
      return
    }

    // 设置可见性状态：如果有外部指定状态则使用，否则切换当前状态
    if (targetVisibleState !== undefined) {
      track.isVisible = targetVisibleState
    } else {
      track.isVisible = !track.isVisible
    }
  }

  /**
   * 切换轨道静音状态
   * @param trackId 轨道ID
   * @param targetMuteState 目标静音状态（可选），如果提供则将轨道设置为指定状态
   */
  async function toggleTrackMute(trackId: string, targetMuteState?: boolean) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) {
      console.warn('⚠️ 找不到轨道:', trackId)
      return
    }

    // 检查轨道类型是否支持静音操作
    if (track.type === 'text') {
      console.warn('⚠️ 文本轨道不支持静音操作')
      return
    }

    // 设置静音状态：如果有外部指定状态则使用，否则切换当前状态
    if (targetMuteState !== undefined) {
      track.isMuted = targetMuteState
    } else {
      track.isMuted = !track.isMuted
    }
  }

  /**
   * 重命名轨道
   * @param trackId 轨道ID
   * @param newName 新名称
   */
  function renameTrack(trackId: string, newName: string) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (track && newName.trim()) {
      const oldName = track.name
      track.name = newName.trim()

      console.log('✏️ 重命名轨道:', {
        trackId,
        oldName,
        newName: track.name,
      })
    } else if (!track) {
      console.warn('⚠️ 找不到轨道:', trackId)
    } else {
      console.warn('⚠️ 无效的轨道名称:', newName)
    }
  }

  /**
   * 设置轨道高度
   * @param trackId 轨道ID
   * @param height 新高度
   */
  function setTrackHeight(trackId: string, height: number) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (track && height > 0) {
      track.height = height

      console.log('📏 设置轨道高度:', {
        trackId,
        trackName: track.name,
        height,
      })
    } else if (!track) {
      console.warn('⚠️ 找不到轨道:', trackId)
    } else {
      console.warn('⚠️ 无效的轨道高度:', height)
    }
  }

  /**
   * 获取轨道信息
   * @param trackId 轨道ID
   * @returns 轨道对象或undefined
   */
  function getTrack(trackId: string): UnifiedTrackData | undefined {
    return tracks.value.find((t) => t.id === trackId)
  }

  /**
   * 获取所有轨道的摘要信息
   * @returns 轨道摘要数组
   */
  function getTracksSummary() {
    return tracks.value.map((track) => ({
      id: track.id,
      name: track.name,
      type: track.type,
      isVisible: track.isVisible,
      isMuted: track.isMuted,
      height: track.height,
    }))
  }

  /**
   * 重置所有轨道为默认状态
   */
  function resetTracksToDefaults() {
    tracks.value.forEach((track) => {
      // 重置可见性和静音状态
      track.isVisible = true
      track.isMuted = false
    })
    console.log('🔄 所有轨道已重置为默认状态')
  }

  /**
   * 恢复轨道列表（用于项目加载）
   * @param restoredTracks 要恢复的轨道数组
   */
  function restoreTracks(restoredTracks: UnifiedTrackData[]) {
    console.log(`📋 开始恢复轨道: ${restoredTracks.length}个轨道`)

    // 清空现有轨道
    tracks.value = []

    // 添加恢复的轨道
    for (const track of restoredTracks) {
      // 创建新的响应式轨道对象
      const restoredTrack = createUnifiedTrackData(
        track.type,
        {
          ...track,
        },
        track.id,
      )

      tracks.value.push(restoredTrack)
      console.log(`📋 恢复轨道: ${track.name} (${track.type})`)
    }

    console.log(`✅ 轨道恢复完成: ${tracks.value.length}个轨道`)
  }

  // ==================== 导出接口 ====================

  return {
    // 状态
    tracks,
    trackIndexMap,  // 导出计算属性供其他模块使用

    // 基础方法
    addTrack,
    removeTrack,
    toggleTrackVisibility,
    toggleTrackMute,
    renameTrack,
    setTrackHeight,
    getTrack,
    getTracksSummary,
    resetTracksToDefaults,

    // 恢复方法
    restoreTracks,
  }
}

// 导出类型定义
export type UnifiedTrackModule = ReturnType<typeof createUnifiedTrackModule>
