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
import { exportTimelineItem } from '@/core/utils/projectExporter'

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

    // 导出片段 - 仅支持视频和图片
    if (timelineItem.mediaType === 'video' || timelineItem.mediaType === 'image') {
      menuItems.push({
        label: t('timeline.contextMenu.clip.exportClip'),
        icon: IconComponents.DOWNLOAD,
        onClick: () => exportClip(),
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

    // 删除片段 - 所有类型都支持
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

  /**
   * 导出时间轴片段
   */
  async function exportClip() {
    const clipId = contextMenuTarget.value.clipId
    if (!clipId) return

    const timelineItem = unifiedStore.getTimelineItem(clipId)
    if (!timelineItem) return

    showContextMenu.value = false

    try {
      console.log('🚀 开始导出时间轴片段:', timelineItem.id)

      // 显示进度提示
      unifiedStore.messageInfo(t('timeline.exportStarted', { id: timelineItem.id }))

      // 调用导出方法
      const blob = await exportTimelineItem({
        timelineItem,
        getMediaItem: (id: string) => unifiedStore.getMediaItem(id),
        onProgress: (progress: number) => {
          console.log(`📊 导出进度: ${progress.toFixed(2)}%`)
        },
      })

      // 获取媒体项目名称用于文件命名
      const mediaItem = unifiedStore.getMediaItem(timelineItem.mediaItemId)
      const baseName = mediaItem?.name || 'timeline-clip'

      // 创建下载链接
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName}_clip.${getFileExtension(timelineItem.mediaType)}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      unifiedStore.messageSuccess(t('timeline.exportSuccess', { id: timelineItem.id }))
      console.log('✅ 时间轴片段导出成功')
    } catch (error) {
      console.error('❌ 导出时间轴片段失败:', error)
      unifiedStore.messageError(
        t('timeline.exportFailed', {
          id: timelineItem.id,
          error: error instanceof Error ? error.message : '未知错误',
        }),
      )
    }
  }

  /**
   * 获取文件扩展名
   */
  function getFileExtension(mediaType: string): string {
    switch (mediaType) {
      case 'video':
        return 'mp4'
      case 'image':
        return 'png'
      default:
        return 'bin'
    }
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
    exportClip,
  }
}
