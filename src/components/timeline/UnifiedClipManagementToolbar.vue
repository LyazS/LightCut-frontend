<template>
  <!-- 工具栏 -->
  <div class="clip-management-toolbar">
    <!-- 历史管理工具栏 -->
    <div class="toolbar-section">
      <HoverButton
        @click="undo"
        :disabled="!unifiedStore.canUndo"
        :title="t('toolbar.history.undoTooltip')"
      >
        <template #icon>
          <component :is="IconComponents.UNDO" size="14px" />
        </template>
        {{ t('toolbar.history.undo') }}
      </HoverButton>
      <HoverButton
        @click="redo"
        :disabled="!unifiedStore.canRedo"
        :title="t('toolbar.history.redoTooltip')"
      >
        <template #icon>
          <component :is="IconComponents.REDO" size="14px" />
        </template>
        {{ t('toolbar.history.redo') }}
      </HoverButton>
    </div>

    <div v-if="timelineItems.length > 0" class="toolbar-section">
      <HoverButton
        v-if="unifiedStore.selectedTimelineItemId"
        :disabled="isSplitButtonDisabled"
        @click="splitSelectedClip"
        :title="t('toolbar.clip.splitTooltip')"
      >
        <template #icon>
          <component :is="IconComponents.SPLIT" size="14px" />
        </template>
        {{ t('toolbar.clip.split') }}
      </HoverButton>
      <HoverButton
        v-if="unifiedStore.selectedTimelineItemId"
        @click="deleteSelectedClip"
        :title="t('toolbar.clip.deleteTooltip')"
      >
        <template #icon>
          <component :is="IconComponents.DELETE" size="14px" color="#ef4444" />
        </template>
        {{ t('toolbar.clip.delete') }}
      </HoverButton>
      <span v-if="overlappingCount > 0" class="overlap-warning">
        {{ t('toolbar.clip.overlapping', { count: overlappingCount }) }}
      </span>
    </div>

    <!-- 调试按钮放在最右边 -->
    <div class="toolbar-section debug-section">
      <!-- 吸附开关按钮 -->
      <HoverButton
        @click="toggleSnap"
        :active="snapEnabled"
        :title="snapEnabled ? t('toolbar.snap.enabledTooltip') : t('toolbar.snap.disabledTooltip')"
      >
        <template #icon>
          <component :is="getSnapIcon(snapEnabled)" size="14px" />
        </template>
        {{ t('toolbar.snap.snap') }}
      </HoverButton>

      <!-- <HoverButton @click="debugTimeline" title="在控制台打印时间轴配置信息">
         <template #icon>
            <RemixIcon name="tools-line" size="1x" />
          </template>
        调试
      </HoverButton>
      <HoverButton @click="debugHistory" title="在控制台打印历史操作记录信息">
        <template #icon>
          <RemixIcon name="history-line" size="1x" />
        </template>
        历史
      </HoverButton> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { useAppI18n } from '@/core/composables/useI18n'
import { formatFileSize, framesToSeconds } from '@/core/utils/timeUtils'
import { countOverlappingItems } from '@/core/utils/timeOverlapUtils'
import HoverButton from '@/components/base/HoverButton.vue'
import { IconComponents, getSnapIcon } from '@/constants/iconComponents'

const unifiedStore = useUnifiedStore()
const { t } = useAppI18n()

const timelineItems = computed(() => unifiedStore.timelineItems)

// 吸附功能状态
const snapEnabled = computed(() => unifiedStore.snapConfig.enabled)

// 切换吸附功能
function toggleSnap() {
  unifiedStore.updateSnapConfig({ enabled: !snapEnabled.value })
  console.log(
    `🧲 ${t('toolbar.feedback.snapToggled', { status: snapEnabled.value ? '已关闭' : '已开启' })}`,
  )
}

// 计算重叠时间轴项目数量（只计算同轨道内的重叠）
const overlappingCount = computed(() => {
  // 使用统一的重叠检测工具
  return countOverlappingItems(unifiedStore.timelineItems)
})

// 检查选中的项目是否支持裁剪（视频和音频支持，图片和文本不支持）
const selectedItemSupportsSplit = computed(() => {
  if (!unifiedStore.selectedTimelineItemId) return false
  const item = unifiedStore.getTimelineItem(unifiedStore.selectedTimelineItemId)
  if (!item) return false

  // 视频和音频支持裁剪，图片和文本不支持
  return item.mediaType === 'video' || item.mediaType === 'audio'
})

// 检查选中的项目是否处于ready状态
const isSelectedItemReady = computed(() => {
  if (!unifiedStore.selectedTimelineItemId) return false
  const item = unifiedStore.getTimelineItem(unifiedStore.selectedTimelineItemId)
  if (!item) return false

  const mediaItem = unifiedStore.getMediaItem(item.mediaItemId)
  if (!mediaItem) return false

  // 只有ready状态的媒体项才能进行裁剪
  return mediaItem.mediaStatus === 'ready'
})

// 裁剪按钮是否禁用
const isSplitButtonDisabled = computed(() => {
  return !selectedItemSupportsSplit.value || !isSelectedItemReady.value
})

async function splitSelectedClip() {
  if (unifiedStore.selectedTimelineItemId) {
    const item = unifiedStore.getTimelineItem(unifiedStore.selectedTimelineItemId)
    const mediaItem = item ? unifiedStore.getMediaItem(item.mediaItemId) : null
    console.log(
      `🔪 开始裁剪时间轴项目: ${mediaItem?.name || '未知'} (ID: ${unifiedStore.selectedTimelineItemId})`,
    )
    console.log(
      `📍 裁剪时间位置: ${unifiedStore.currentFrame}帧 (${unifiedStore.formattedCurrentTime})`,
    )

    // 使用带历史记录的分割方法（传入帧数）
    await unifiedStore.splitTimelineItemAtTimeWithHistory(
      unifiedStore.selectedTimelineItemId,
      unifiedStore.currentFrame,
    )
    console.log('✅ 时间轴项目分割成功')
  }
}

async function deleteSelectedClip() {
  if (unifiedStore.selectedTimelineItemId) {
    const item = unifiedStore.getTimelineItem(unifiedStore.selectedTimelineItemId)
    const mediaItem = item ? unifiedStore.getMediaItem(item.mediaItemId) : null
    console.log(
      `🗑️ 删除时间轴项目: ${mediaItem?.name || '未知'} (ID: ${unifiedStore.selectedTimelineItemId})`,
    )

    try {
      // 使用带历史记录的删除方法
      await unifiedStore.removeTimelineItemWithHistory(unifiedStore.selectedTimelineItemId)
      console.log('✅ 时间轴项目删除成功')
    } catch (error) {
      console.error('❌ 删除时间轴项目失败:', error)
      // 如果历史记录删除失败，回退到直接删除
      unifiedStore.removeTimelineItem(unifiedStore.selectedTimelineItemId)
    }
  }
}

// ==================== 历史管理方法 ====================

/**
 * 撤销上一个操作
 */
async function undo() {
  try {
    const success = await unifiedStore.undo()
    if (success) {
      console.log('↩️', t('toolbar.debug.undoSuccess'))
    } else {
      console.log('⚠️', t('toolbar.debug.undoFailed'))
    }
  } catch (error) {
    console.error('❌ 撤销操作失败:', error)
  }
}

/**
 * 重做下一个操作
 */
async function redo() {
  try {
    const success = await unifiedStore.redo()
    if (success) {
      console.log('↪️', t('toolbar.debug.redoSuccess'))
    } else {
      console.log('⚠️', t('toolbar.debug.redoFailed'))
    }
  } catch (error) {
    console.error('❌ 重做操作失败:', error)
  }
}

function debugTimeline() {
  console.group('🎬 时间轴配置调试信息 - 按轨道输出')

  // 基本配置
  console.group('📊 基本配置')
  console.log('总时长 (帧):', unifiedStore.totalDurationFrames)
  console.log('内容结束时间 (帧):', unifiedStore.contentEndTimeFrames)
  console.log(
    `当前播放时间 ${framesToSeconds(unifiedStore.currentFrame)}秒 (${unifiedStore.currentFrame}帧)`,
  )
  console.log('播放状态:', unifiedStore.isPlaying ? '播放中' : '已暂停')
  console.log('播放速度:', unifiedStore.playbackRate + 'x')
  console.groupEnd()

  // 轨道信息统计
  console.group('🎵 轨道统计信息')
  console.log('轨道总数:', unifiedStore.tracks.length)
  const trackStats = unifiedStore.tracks.map((track) => ({
    name: track.name,
    type: track.type,
    itemCount: unifiedStore.getTimelineItemsByTrack(track.id).length,
    isVisible: track.isVisible,
    isMuted: track.isMuted,
  }))
  console.table(trackStats)
  console.groupEnd()

  // 按轨道输出详细信息
  console.group('🎭 按轨道详细信息 (' + unifiedStore.tracks.length + ' 个轨道)')

  unifiedStore.tracks.forEach((track, trackIndex) => {
    const trackItems = unifiedStore.getTimelineItemsByTrack(track.id)
    const trackTypeIcon =
      {
        video: '🎥',
        audio: '🎵',
        text: '📝',
        subtitle: '💬',
        effect: '✨',
      }[track.type] || '❓'

    console.group(`${trackTypeIcon} 轨道 ${trackIndex + 1}: ${track.name} (${track.type})`)

    // 轨道基本信息
    console.group('📋 轨道属性')
    console.log('轨道ID:', track.id)
    console.log('轨道类型:', track.type)
    console.log('轨道高度:', track.height + 'px')
    console.log('可见状态:', track.isVisible ? '👁️ 可见' : '🙈 隐藏')
    console.log('静音状态:', track.isMuted ? '🔇 静音' : '🔊 正常')
    console.log('项目数量:', trackItems.length + ' 个')
    console.groupEnd()

    // 轨道上的时间轴项目
    if (trackItems.length > 0) {
      console.group(`🎞️ 轨道项目详情 (${trackItems.length} 个)`)

      // 按时间排序显示
      const sortedItems = [...trackItems].sort(
        (a, b) => a.timeRange.timelineStartTime - b.timeRange.timelineStartTime,
      )

      sortedItems.forEach((item, itemIndex) => {
        const mediaItem = unifiedStore.getMediaItem(item.mediaItemId)
        const timeRange = item.timeRange
        const duration = timeRange.timelineEndTime - timeRange.timelineStartTime
        const mediaTypeIcon =
          {
            video: '🎬',
            audio: '🎵',
            image: '🖼️',
            text: '📝',
            unknown: '❓',
          }[item.mediaType] || '❓'

        console.group(`${mediaTypeIcon} 项目 ${itemIndex + 1}: ${mediaItem?.name || 'Unknown'}`)
        console.log('项目ID:', item.id)
        console.log('素材ID:', item.mediaItemId)
        console.log('媒体类型:', item.mediaType)
        console.log('状态:', item.timelineStatus)
        console.log(
          '时间轴开始:',
          `${timeRange.timelineStartTime}帧 (${framesToSeconds(timeRange.timelineStartTime)}秒)`,
        )
        console.log(
          '时间轴结束:',
          `${timeRange.timelineEndTime}帧 (${framesToSeconds(timeRange.timelineEndTime)}秒)`,
        )
        console.log('持续时长:', `${duration}帧 (${framesToSeconds(duration)}秒)`)

        // 显示素材信息
        if (mediaItem) {
          const mediaDuration = mediaItem.duration || 0
          console.log('素材时长:', `${mediaDuration}帧 (${framesToSeconds(mediaDuration)}秒)`)
          console.log('素材状态:', mediaItem.mediaStatus)
          if (mediaItem.source.type === 'user-selected' && mediaItem.source.selectedFile) {
            console.log('文件大小:', formatFileSize(mediaItem.source.selectedFile.size))
            console.log('文件类型:', mediaItem.source.selectedFile.type)
          }
        }

        // 显示配置信息（如果有的话）
        if (item.config && Object.keys(item.config).length > 0) {
          console.log('配置信息:', item.config)
        }

        console.groupEnd()
      })
      console.groupEnd()
    } else {
      console.log('📭 该轨道暂无项目')
    }

    console.groupEnd()
  })
  console.groupEnd()

  // 素材库信息（简化版）
  console.group('📁 素材库信息 (' + unifiedStore.mediaItems.length + ' 个)')
  const mediaStats = {
    total: unifiedStore.mediaItems.length,
    ready: unifiedStore.getReadyMediaItems().length,
    processing: unifiedStore.getProcessingMediaItems().length,
    error: unifiedStore.getErrorMediaItems().length,
    byType: {} as Record<string, number>,
  }

  // 按类型统计
  unifiedStore.mediaItems.forEach((item) => {
    const mediaType = item.mediaType as string
    mediaStats.byType[mediaType] = (mediaStats.byType[mediaType] || 0) + 1
  })

  console.log('📊 素材统计:', mediaStats)
  console.groupEnd()

  // 完整的时间轴项目信息（保留原有功能）
  console.group('🎞️ 完整时间轴项目列表 (' + timelineItems.value.length + ' 个)')
  timelineItems.value.forEach((item, index) => {
    const mediaItem = unifiedStore.getMediaItem(item.mediaItemId)
    const track = unifiedStore.getTrack(item.trackId || '')
    const timeRange = item.timeRange
    const duration = timeRange.timelineEndTime - timeRange.timelineStartTime

    console.group(`项目 ${index + 1}: ${mediaItem?.name || 'Unknown'}`)
    console.log('ID:', item.id)
    console.log('素材ID:', item.mediaItemId)
    console.log('轨道ID:', item.trackId)
    console.log('轨道名称:', track?.name || '未知轨道')
    console.log('媒体类型:', item.mediaType)
    console.log('状态:', item.timelineStatus)
    console.log('时间轴开始 (帧):', timeRange.timelineStartTime)
    console.log('时间轴结束 (帧):', timeRange.timelineEndTime)
    console.log('持续时长 (帧):', duration)
    console.log('时间轴开始 (秒):', framesToSeconds(timeRange.timelineStartTime))
    console.log('时间轴结束 (秒):', framesToSeconds(timeRange.timelineEndTime))
    console.log('持续时长 (秒):', framesToSeconds(duration))

    // 显示配置信息
    if (item.config && Object.keys(item.config).length > 0) {
      console.log('配置信息:', item.config)
    }

    console.groupEnd()
  })
  console.groupEnd()

  console.groupEnd()
}

function debugHistory() {
  console.group('📚 历史操作记录调试信息')

  // 使用 unifiedStore 提供的历史摘要方法
  const historySummary = unifiedStore.getHistorySummary()

  // 输出摘要信息
  console.log('📊 历史记录摘要:', historySummary)

  console.groupEnd()
}
</script>

<style scoped>
.clip-management-toolbar {
  background-color: #333;
  padding: 6px 12px;
  border-bottom: 1px solid #444;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 30px;
  border-radius: 4px 4px 0 0;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.debug-section {
  margin-left: auto;
}

.toolbar-label {
  font-size: 12px;
  color: #ccc;
  font-weight: 500;
}

.toolbar-btn {
  background-color: #555;
  color: #ccc;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: background-color 0.2s;
}

.toolbar-btn:hover {
  background-color: #666;
  color: white;
}

.toolbar-btn.debug-btn {
  background-color: #6c757d;
  border: 1px dashed #adb5bd;
}

.toolbar-btn.debug-btn:hover {
  background-color: #5a6268;
  border-color: #6c757d;
}

.toolbar-btn.split-btn {
  background-color: #555;
  color: #ccc;
}

.toolbar-btn.split-btn:hover {
  background-color: #666;
  color: white;
}

.toolbar-btn.delete-btn {
  background-color: #dc3545;
  color: white;
}

.toolbar-btn.delete-btn:hover {
  background-color: #c82333;
  color: white;
}

.toolbar-btn.undo-btn {
  background-color: #555;
  color: #ccc;
}

.toolbar-btn.undo-btn:hover {
  background-color: #666;
  color: white;
}

.toolbar-btn.redo-btn {
  background-color: #555;
  color: #ccc;
}

.toolbar-btn.redo-btn:hover {
  background-color: #666;
  color: white;
}

.toolbar-btn:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
}

.toolbar-btn:disabled:hover {
  background-color: #6c757d;
}

.toolbar-btn svg {
  width: 14px;
  height: 14px;
}

.overlap-warning {
  color: #ff6b6b;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.split-hint {
  color: #ffd700;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
