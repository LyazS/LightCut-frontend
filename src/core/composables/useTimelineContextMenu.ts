import { ref, computed, type Ref, type Component } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { useAppI18n } from '@/core/composables/useI18n'
import {
  IconComponents,
  getTrackTypeIcon,
  getVisibilityIcon,
  getMuteIcon,
  getTrackTypeLabel,
} from '@/constants/iconComponents'
import type { UnifiedTrackType, UnifiedTrackData } from '@/core/track/TrackTypes'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import { LayoutConstants } from '@/constants/LayoutConstants'
import { detectScene } from '@/core/utils/scene-detector'
import { detectSceneAdv } from '@/core/utils/scene-detector-adv'
import { detectSceneContent } from '@/core/utils/scene-detector-content'

/**
 * 菜单项类型定义
 */
type MenuItem =
  | {
      label: string
      icon: Component
      onClick: () => void
    }
  | {
      label: string
      icon: Component
      children: MenuItem[]
    }
  | {
      type: 'separator'
    }

/**
 * 时间轴右键菜单模块
 * 提供时间轴右键菜单相关的功能，包括菜单项生成和菜单操作
 */
export function useTimelineContextMenu(
  addNewTrack: (type: UnifiedTrackType, afterTrackId?: string) => Promise<void>,
  toggleVisibility: (trackId: string) => Promise<void>,
  toggleMute: (trackId: string) => Promise<void>,
  autoArrangeTrack: (trackId: string) => Promise<void>,
  startRename: (track: { id: string; name: string }) => Promise<void>,
  removeTrack: (trackId: string) => Promise<void>,
  handleTimelineItemRemove: (timelineItemId: string) => Promise<void>,
  createTextAtPosition: (trackId: string, timePosition: number) => Promise<void>,
  tracks: Ref<UnifiedTrackData[]>,
  getClipsForTrack: (trackId: string) => UnifiedTimelineItemData[],
  timelineBody: Ref<HTMLElement | undefined>,
) {
  const unifiedStore = useUnifiedStore()
  const { t } = useAppI18n()

  // 右键菜单相关
  const showContextMenu = ref(false)
  const contextMenuType = ref<'clip' | 'track' | 'empty'>('empty')
  const contextMenuTarget = ref<{
    clipId?: string
    trackId?: string
    element?: HTMLElement
  }>({})

  const contextMenuOptions = ref({
    x: 0,
    y: 0,
    theme: 'mac dark',
    zIndex: 1000,
  })

  // 计算当前菜单项
  const currentMenuItems = computed(() => {
    switch (contextMenuType.value) {
      case 'clip':
        return getClipMenuItems()
      case 'track':
        return getTrackMenuItems()
      case 'empty':
      default:
        return getEmptyMenuItems()
    }
  })

  /**
   * 获取空白区域菜单项
   */
  function getEmptyMenuItems(): MenuItem[] {
    return [
      {
        label: t('timeline.contextMenu.emptyArea.addVideoTrack'),
        icon: getTrackTypeIcon('video'),
        onClick: () => addNewTrack('video'),
      },
      {
        label: t('timeline.contextMenu.emptyArea.addAudioTrack'),
        icon: getTrackTypeIcon('audio'),
        onClick: () => addNewTrack('audio'),
      },
      {
        label: t('timeline.contextMenu.emptyArea.addTextTrack'),
        icon: getTrackTypeIcon('text'),
        onClick: () => addNewTrack('text'),
      },
    ]
  }

  /**
   * 获取片段菜单项
   */
  function getClipMenuItems(): MenuItem[] {
    const clipId = contextMenuTarget.value.clipId
    if (!clipId) return []

    const timelineItem = unifiedStore.getTimelineItem(clipId)
    if (!timelineItem) return []

    const menuItems: MenuItem[] = []

    // 只有 ready 状态的 timelineItem 才有各种右键选项
    // 非 ready 状态（loading 或 error）只有删除选项
    if (timelineItem.timelineStatus === 'ready') {
      // 智能分镜头 - 仅视频类型支持
      if (timelineItem.mediaType === 'video') {
        menuItems.push({
          label: t('timeline.contextMenu.clip.smartSceneDetection'),
          icon: IconComponents.LAYOUT,
          onClick: () => detectSceneBoundaries(),
        })

        // 分隔符
        menuItems.push({ type: 'separator' } as MenuItem)
      }

      // 复制片段 - 所有类型都支持
      menuItems.push({
        label: t('timeline.contextMenu.clip.duplicateClip'),
        icon: IconComponents.COPY,
        onClick: () => duplicateClip(),
      })

      // 分隔符
      menuItems.push({ type: 'separator' } as MenuItem)
    }

    // 删除片段 - 所有状态都支持
    menuItems.push({
      label: t('timeline.contextMenu.clip.deleteClip'),
      icon: IconComponents.DELETE,
      onClick: () => removeClip(),
    })

    return menuItems
  }

  /**
   * 获取轨道菜单项
   */
  function getTrackMenuItems(): MenuItem[] {
    const trackId = contextMenuTarget.value.trackId
    if (!trackId) return []

    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return []

    const hasClips = getClipsForTrack(trackId).length > 0
    const canDelete = tracks.value.length > 1

    const menuItems: MenuItem[] = []

    // 文本轨道专用菜单项
    if (track.type === 'text') {
      menuItems.push({
        label: t('timeline.contextMenu.track.addText'),
        icon: IconComponents.TEXT_LINE,
        onClick: () => {
          const timePosition = getTimePositionFromContextMenu(contextMenuOptions.value)
          createTextAtPosition(trackId, timePosition)
        },
      })

      if (hasClips) {
        menuItems.push({ type: 'separator' } as MenuItem)
      }
    }

    // 通用菜单项
    menuItems.push(
      {
        label: hasClips
          ? t('timeline.contextMenu.track.autoArrangeClips')
          : t('timeline.contextMenu.track.autoArrangeClipsEmpty'),
        icon: IconComponents.LAYOUT,
        onClick: hasClips ? () => autoArrangeTrack(trackId) : () => {},
      },
      {
        label: t('timeline.contextMenu.track.renameTrack'),
        icon: IconComponents.EDIT,
        onClick: () => renameTrack(),
      },
    )

    // 可见性控制 - 音频轨道不显示
    if (track.type !== 'audio') {
      menuItems.push({
        label: track.isVisible
          ? t('timeline.contextMenu.track.hideTrack')
          : t('timeline.contextMenu.track.showTrack'),
        icon: getVisibilityIcon(track.isVisible),
        onClick: () => toggleVisibility(trackId),
      })
    }

    // 静音控制 - 文本轨道不显示
    if (track.type !== 'text') {
      menuItems.push({
        label: track.isMuted
          ? t('timeline.contextMenu.track.unmuteTrack')
          : t('timeline.contextMenu.track.muteTrack'),
        icon: getMuteIcon(track.isMuted),
        onClick: () => toggleMute(trackId),
      })
    }

    // 添加新轨道子菜单
    menuItems.push({ type: 'separator' } as MenuItem, {
      label: t('timeline.contextMenu.track.addNewTrack'),
      icon: IconComponents.ADD,
      children: [
        {
          label: t('timeline.contextMenu.track.addVideoTrack'),
          icon: getTrackTypeIcon('video'),
          onClick: () => addNewTrack('video', trackId),
        },
        {
          label: t('timeline.contextMenu.track.addAudioTrack'),
          icon: getTrackTypeIcon('audio'),
          onClick: () => addNewTrack('audio', trackId),
        },
        {
          label: t('timeline.contextMenu.track.addTextTrack'),
          icon: getTrackTypeIcon('text'),
          onClick: () => addNewTrack('text', trackId),
        },
      ],
    })

    // 删除轨道选项
    if (canDelete) {
      menuItems.push({
        label: t('timeline.contextMenu.track.deleteTrack'),
        icon: IconComponents.DELETE,
        onClick: () => removeTrack(trackId),
      })
    }

    return menuItems
  }

  /**
   * 处理右键菜单
   * @param event 鼠标事件
   */
  function handleContextMenu(event: MouseEvent) {
    event.preventDefault()

    // 更新菜单位置
    contextMenuOptions.value.x = event.clientX
    contextMenuOptions.value.y = event.clientY

    // 判断右键点击的目标类型
    const target = event.target as HTMLElement

    // 查找最近的片段元素
    const clipElement = target.closest('[data-timeline-item-id]') as HTMLElement
    if (clipElement) {
      // 点击在片段上
      const clipId = clipElement.getAttribute('data-timeline-item-id')
      if (clipId) {
        contextMenuType.value = 'clip'
        contextMenuTarget.value = { clipId, element: clipElement }
        showContextMenu.value = true
        return
      }
    }

    // 查找最近的轨道控制元素
    const trackControlElement = target.closest('.track-controls') as HTMLElement
    if (trackControlElement) {
      // 点击在轨道控制区域
      const trackRow = trackControlElement.closest('.track-row') as HTMLElement
      if (trackRow) {
        const trackIndex = Array.from(trackRow.parentElement?.children || []).indexOf(trackRow)
        const track = tracks.value[trackIndex]
        if (track) {
          contextMenuType.value = 'track'
          contextMenuTarget.value = { trackId: track.id, element: trackControlElement }
          showContextMenu.value = true
          return
        }
      }
    }

    // 查找轨道内容区域
    const trackContentElement = target.closest('.track-content') as HTMLElement
    if (trackContentElement) {
      // 点击在轨道内容区域（空白处）
      const trackRow = trackContentElement.closest('.track-row') as HTMLElement
      if (trackRow) {
        const trackIndex = Array.from(trackRow.parentElement?.children || []).indexOf(trackRow)
        const track = tracks.value[trackIndex]
        if (track) {
          contextMenuType.value = 'track'
          contextMenuTarget.value = { trackId: track.id, element: trackContentElement }
          showContextMenu.value = true
          return
        }
      }
    }

    // 默认情况：点击在空白区域
    contextMenuType.value = 'empty'
    contextMenuTarget.value = { element: target }
    showContextMenu.value = true
  }

  /**
   * 处理时间轴项目右键菜单
   * @param event 鼠标事件
   * @param id 时间轴项目ID
   */
  function handleTimelineItemContextMenu(event: MouseEvent, id: string) {
    // 处理时间轴项目右键菜单
    event.preventDefault()
    contextMenuOptions.value.x = event.clientX
    contextMenuOptions.value.y = event.clientY
    contextMenuType.value = 'clip'
    contextMenuTarget.value = { clipId: id }
    showContextMenu.value = true
  }

  /**
   * 删除片段
   */
  async function removeClip() {
    if (contextMenuTarget.value.clipId) {
      await handleTimelineItemRemove(contextMenuTarget.value.clipId)
      showContextMenu.value = false
    }
  }

  /**
   * 复制片段
   */
  async function duplicateClip() {
    if (contextMenuTarget.value.clipId) {
      try {
        await unifiedStore.duplicateTimelineItemWithHistory(contextMenuTarget.value.clipId)
        console.log('✅ 时间轴项目复制成功')
      } catch (error) {
        console.error('❌ 复制时间轴项目时出错:', error)
      }
      showContextMenu.value = false
    }
  }

  /**
   * 智能分镜头检测（使用 createLoading）
   */
  async function detectSceneBoundaries() {
    const clipId = contextMenuTarget.value.clipId
    if (!clipId) return

    const timelineItem = unifiedStore.getTimelineItem(clipId)
    if (!timelineItem) return

    console.log('🎬 开始智能分镜头检测...')

    // 创建 AbortController 用于取消操作
    const abortController = new AbortController()

    // 创建 loading 实例
    const loading = unifiedStore.createLoading({
      title: t('timeline.sceneDetection.title'),
      showProgress: true,
      showDetails: true,
      showTips: true,
      tipText: t('timeline.sceneDetection.tip'),
      showCancel: true,
      cancelText: t('common.cancel'),
      onCancel: () => {
        abortController.abort()
        console.log('⚠️ 用户取消场景检测')
      }
    })

    try {
      // 调用 detectSceneAdv，传入进度回调和取消信号
      const boundaries = await detectSceneAdv(timelineItem, {
        peakDetection: {
          minProminence: 0.03,
          minHeight: 0.08,
          minDistance: 15,
        },
        maxSize: 600,
        signal: abortController.signal,
        onProgress: (current, total, message) => {
          // 计算进度百分比
          const progress = total > 0 ? (current / total) * 100 : 0
          
          // 更新 loading 状态
          loading.update({
            progress: Math.min(100, Math.round(progress)),
            details: message
          })
        },
        enableChart: false,
      })

      // 检查是否被取消
      if (abortController.signal.aborted) {
        loading.close()
        unifiedStore.messageInfo(t('timeline.sceneDetection.cancelled'))
        return
      }

      // 处理检测结果
      if (boundaries.length > 0) {
        console.log('✅ 检测完成，共发现', boundaries.length, '个分割点')
        
        loading.update({
          progress: 100,
          details: t('timeline.sceneDetection.splitting', { count: boundaries.length })
        })

        const splitPoints = boundaries.map((frame) => Number(frame))
        await unifiedStore.splitTimelineItemAtTimeWithHistory(clipId, splitPoints)
        
        loading.close()
        unifiedStore.messageSuccess(
          t('timeline.sceneDetection.success', { count: boundaries.length })
        )
        console.log('✅ 时间轴项目分割成功')
      } else {
        console.log('⚠️ 未检测到场景边界')
        loading.close()
        unifiedStore.messageWarning(t('timeline.sceneDetection.noScenes'))
      }
    } catch (error) {
      loading.close()
      
      // 区分取消和错误
      if (error instanceof Error && error.name === 'AbortError') {
        unifiedStore.messageInfo(t('timeline.sceneDetection.cancelled'))
      } else {
        console.error('❌ 智能分镜头检测失败:', error)
        unifiedStore.messageError(
          t('timeline.sceneDetection.error', {
            message: error instanceof Error ? error.message : String(error)
          })
        )
      }
    }

    showContextMenu.value = false
  }

  /**
   * 重命名轨道
   */
  function renameTrack() {
    if (contextMenuTarget.value.trackId) {
      const track = tracks.value.find((t) => t.id === contextMenuTarget.value.trackId)
      if (track) {
        startRename(track)
      }
      showContextMenu.value = false
    }
  }

  /**
   * 显示添加轨道菜单
   * @param event 鼠标事件（可选）
   */
  function showAddTrackMenu(event?: MouseEvent) {
    // 如果是点击按钮触发，获取按钮位置
    if (event) {
      const button = event.currentTarget as HTMLElement
      const rect = button.getBoundingClientRect()
      contextMenuOptions.value.x = rect.left
      contextMenuOptions.value.y = rect.bottom + 5
    } else {
      // 默认位置
      contextMenuOptions.value.x = 100
      contextMenuOptions.value.y = 100
    }

    contextMenuType.value = 'empty'
    contextMenuTarget.value = {}
    showContextMenu.value = true
  }

  /**
   * 从右键菜单上下文获取时间位置
   * 将右键点击的屏幕坐标转换为时间轴上的帧数位置
   * @returns 时间位置（帧数）
   */
  function getTimePositionFromContextMenu(contextMenuOptions: { x: number }): number {
    // 获取右键点击的位置
    const clickX = contextMenuOptions.x

    // 计算相对于时间轴内容区域的位置
    const timelineBodyRect = timelineBody.value?.getBoundingClientRect()
    if (!timelineBodyRect) {
      console.warn('⚠️ 无法获取时间轴主体边界，使用默认位置')
      return 0
    }

    // 减去轨道控制区域的宽度
    const relativeX = clickX - timelineBodyRect.left - LayoutConstants.TRACK_CONTROL_WIDTH

    // 转换为帧数
    const timeFrames = unifiedStore.pixelToFrame(relativeX, unifiedStore.TimelineContentWidth)

    // 确保时间位置不为负数
    return Math.max(0, Math.round(timeFrames))
  }

  return {
    // 状态
    showContextMenu,
    contextMenuType,
    contextMenuTarget,
    contextMenuOptions,
    currentMenuItems,

    // 方法
    handleContextMenu,
    handleTimelineItemContextMenu,
    removeClip,
    duplicateClip,
    renameTrack,
    showAddTrackMenu,
    detectSceneBoundaries,
  }
}
