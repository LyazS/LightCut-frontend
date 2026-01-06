<template>
  <div class="multi-file-input-field">
    <label class="field-label">
      {{ config.label[locale] }}
      <span v-if="maxFiles > 1" class="file-count"> ({{ fileList.length }}/{{ maxFiles }}) </span>
    </label>

    <div :class="containerClasses">
      <div
        v-for="slot in slots"
        :key="slot.index"
        :class="getSlotClasses(slot)"
        @dragover="handleSlotDragOver($event, slot.index)"
        @dragleave="handleSlotDragLeave($event, slot.index)"
        @drop="handleSlotDrop($event, slot.index)"
      >
        <!-- 空槽位 - 显示上传提示 -->
        <div v-if="slot.status === FileItemStatus.EMPTY" class="empty-slot">
          <component :is="IconComponents.UPLOAD" size="32px" />
          <p class="drop-hint">{{ getSlotPlaceholder(slot.index) }}</p>
        </div>

        <!-- 已填充槽位 - 显示文件缩略图 -->
        <n-tooltip
          v-else-if="slot.status === FileItemStatus.FILLED && slot.fileData"
          :show-arrow="true"
          placement="right"
          :delay="300"
          trigger="hover"
        >
          <template #trigger>
            <div class="filled-slot">
              <!-- 拖拽替换提示遮罩 -->
              <div v-if="slot.isDragOver" class="replace-overlay">
                {{ t('aiPanel.fileInput.replace') }}
              </div>

              <div class="file-preview">
                <!-- 缩略图 -->
                <img
                  v-if="getThumbnailUrl(slot.index) && slot.fileData.mediaType !== 'audio'"
                  :src="getThumbnailUrl(slot.index)"
                  :alt="slot.fileData.name"
                  :draggable="false"
                  @error="handleThumbnailError(slot.index)"
                />
                <!-- 文件图标 -->
                <component v-else :is="getFileIcon(slot.fileData)" size="48px" />

                <!-- 移除按钮 -->
                <button class="remove-button" @click.stop="removeFileAtIndex(slot.index)">
                  <component :is="IconComponents.CLOSE" size="16px" />
                </button>
              </div>
            </div>
          </template>

          <!-- Tooltip内容 -->
          <div class="tooltip-content">
            <div class="tooltip-title">
              {{ getSourceIcon(slot.fileData) }} {{ slot.fileData.name }}
            </div>

            <div class="tooltip-detail">
              <div class="tooltip-detail-line">
                {{ t('aiPanel.fileInput.type') }}：{{ getMediaTypeLabel(slot.fileData) }}
              </div>
              <div v-if="slot.fileData.duration" class="tooltip-detail-line">
                {{ t('aiPanel.fileInput.duration') }}：{{ formatDuration(slot.fileData.duration) }}
              </div>
              <div v-if="slot.fileData.resolution" class="tooltip-detail-line">
                {{ t('aiPanel.fileInput.resolution') }}：{{ slot.fileData.resolution.width }}x{{
                  slot.fileData.resolution.height
                }}
              </div>
              <div v-if="slot.fileData.timeRange" class="tooltip-detail-line">
                {{ t('aiPanel.fileInput.clipRange') }}：{{ formatTimeRange(slot.fileData) }}
              </div>
            </div>

            <div class="tooltip-hint">
              💡 {{ t('aiPanel.fileInput.source') }}：{{
                slot.fileData.source === 'media-item'
                  ? t('aiPanel.fileInput.mediaLibrary')
                  : t('aiPanel.fileInput.timeline')
              }}
            </div>
          </div>
        </n-tooltip>
      </div>
    </div>

    <!-- 错误信息 -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { NTooltip } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import type {
  FileInputConfig,
  FileData,
  MultiFileData,
  FileSlot,
} from '@/core/datasource/providers/ai-generation/types'
import { FileItemStatus } from '@/core/datasource/providers/ai-generation/types'
import { IconComponents } from '@/constants/iconComponents'
import { useUnifiedStore } from '@/core/unifiedStore'
import { DropTargetType, type AIGenerationPanelDropTargetInfo } from '@/core/types/drag'
import { framesToTimecode } from '@/core/utils/timeUtils'
import { generateThumbnailForUnifiedMediaItemBunny } from '@/core/bunnyUtils/thumbGenerator'
import { ThumbnailMode } from '@/constants/ThumbnailConstants'

const { t } = useI18n()

interface Props {
  config: FileInputConfig
  modelValue: MultiFileData
  locale: 'zh' | 'en'
}

interface Emits {
  (e: 'update:modelValue', value: MultiFileData): void
  (e: 'file-added', file: FileData, index: number): void
  (e: 'file-removed', file: FileData, index: number): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const unifiedStore = useUnifiedStore()

// 状态管理
const fileList = ref<MultiFileData>([])
const dragOverIndex = ref<number | null>(null)
const errorMessage = ref<string | null>(null)
const thumbnailUrls = ref<Map<number, string | null>>(new Map())

// 最大文件数量
const maxFiles = computed(() => props.config.maxFiles || 1)

// 是否可以接受更多文件
const canAcceptMoreFiles = computed(() => fileList.value.length < maxFiles.value)

// 计算应该显示的槽位数量（渐进式UI）
const visibleSlots = computed(() => {
  const currentFileCount = fileList.value.length
  // 如果还没达到最大数量，显示一个额外的空槽位
  return Math.min(currentFileCount + 1, maxFiles.value)
})

// 生成槽位数据
const slots = computed((): FileSlot[] => {
  const result: FileSlot[] = []

  for (let i = 0; i < visibleSlots.value; i++) {
    const fileData = fileList.value[i] || null
    result.push({
      index: i,
      status: fileData ? FileItemStatus.FILLED : FileItemStatus.EMPTY,
      fileData,
      isDragOver: dragOverIndex.value === i,
      canAcceptDrop: true, // 所有槽位都可以接受拖拽（空槽位添加，已填充槽位替换）
    })
  }

  return result
})

// 容器样式类
const containerClasses = computed(() => ({
  'multi-file-container': true,
}))

// 获取槽位样式类
const getSlotClasses = (slot: FileSlot) => ({
  'file-slot': true,
  empty: slot.status === FileItemStatus.EMPTY,
  filled: slot.status === FileItemStatus.FILLED,
  'drag-over-accept': slot.isDragOver && slot.canAcceptDrop,
  'drag-over-reject': slot.isDragOver && !slot.canAcceptDrop,
})

// HTTP URL转blob URL的辅助函数
const convertHttpUrlToBlob = async (httpUrl: string): Promise<string> => {
  try {
    const response = await fetch(httpUrl)
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('转换HTTP URL到blob URL失败:', error)
    throw error
  }
}

// 统一的缩略图生成函数
const generateUnifiedThumbnail = async (data: FileData): Promise<string | null> => {
  try {
    if (data.mediaType === 'audio') {
      return null // 音频不需要缩略图
    }

    const mediaItem = unifiedStore.getMediaItem(data.mediaItemId!)
    if (!mediaItem) {
      console.error('找不到 mediaItem:', data.mediaItemId)
      return null
    }

    if (data.source === 'media-item') {
      // 素材区：从HTTP URL生成新的blob URL
      const originalUrl = mediaItem.runtime.bunny?.thumbnailUrl
      if (originalUrl) {
        return await convertHttpUrlToBlob(originalUrl)
      }
    } else if (data.source === 'timeline-item') {
      if (data.mediaType === 'video') {
        // 时间轴视频：生成新缩略图
        const timelineItem = unifiedStore.getTimelineItem(data.timelineItemId!)
        if (!timelineItem) {
          console.error('找不到 timelineItem:', data.timelineItemId)
          return null
        }

        const { clipStartTime, clipEndTime } = timelineItem.timeRange
        const thumbnailTimePosition = Math.floor((clipStartTime + clipEndTime) / 2)
        const timePositionUs = thumbnailTimePosition / 30

        const result = await generateThumbnailForUnifiedMediaItemBunny(
          mediaItem,
          timePositionUs,
          80,
          80,
          ThumbnailMode.FILL,
        )
        return result || null
      } else if (data.mediaType === 'image') {
        // 时间轴图片：从HTTP URL生成新的blob URL
        const originalUrl = mediaItem.runtime.bunny?.thumbnailUrl
        if (originalUrl) {
          return await convertHttpUrlToBlob(originalUrl)
        }
      }
    }

    return null
  } catch (error) {
    console.error('生成统一缩略图失败:', error)
    return null
  }
}

// 加载指定索引的缩略图
const loadThumbnailAtIndex = async (fileData: FileData, index: number) => {
  // 清理旧的缩略图
  const oldUrl = thumbnailUrls.value.get(index)
  if (oldUrl?.startsWith('blob:')) {
    console.log('加载新缩略图前清理旧的 Blob URL:', oldUrl)
    URL.revokeObjectURL(oldUrl)
  }

  // 生成新缩略图
  const thumbnailUrl = await generateUnifiedThumbnail(fileData)
  thumbnailUrls.value.set(index, thumbnailUrl)
}

// 清理指定索引的缩略图
const cleanupThumbnailAtIndex = (index: number) => {
  const url = thumbnailUrls.value.get(index)
  if (url?.startsWith('blob:')) {
    console.log('清理索引 ' + index + ' 的 Blob URL:', url)
    URL.revokeObjectURL(url)
  }
  thumbnailUrls.value.delete(index)
}

// 获取缩略图URL
const getThumbnailUrl = (index: number): string | undefined => {
  return thumbnailUrls.value.get(index) || undefined
}

// 处理槽位拖拽悬停
const handleSlotDragOver = (event: DragEvent, slotIndex: number) => {
  event.preventDefault()
  event.stopPropagation()

  // 检查拖拽数据兼容性
  const targetInfo: AIGenerationPanelDropTargetInfo = {
    targetType: DropTargetType.AI_GENERATION_PANEL,
    fieldConfig: props.config,
    targetIndex: slotIndex,
    currentFiles: fileList.value,
  }

  const canDrop = unifiedStore.handleDragOver(event, targetInfo)
  dragOverIndex.value = canDrop ? slotIndex : null

  if (canDrop) {
    errorMessage.value = null
  }
}

// 处理槽位拖拽离开
const handleSlotDragLeave = (event: DragEvent, slotIndex: number) => {
  const currentTarget = event.currentTarget as Element
  const relatedTarget = event.relatedTarget as Node

  if (currentTarget && !currentTarget.contains(relatedTarget)) {
    if (dragOverIndex.value === slotIndex) {
      dragOverIndex.value = null
    }
  }
}

// 处理槽位拖拽放置
const handleSlotDrop = async (event: DragEvent, slotIndex: number) => {
  event.preventDefault()
  event.stopPropagation()

  const targetInfo: AIGenerationPanelDropTargetInfo = {
    targetType: DropTargetType.AI_GENERATION_PANEL,
    fieldConfig: props.config,
    targetIndex: slotIndex,
    currentFiles: fileList.value,
  }

  const result = await unifiedStore.handleDrop(event, targetInfo)

  dragOverIndex.value = null

  if (result.success && result.data) {
    addFileAtIndex(result.data, slotIndex)
    errorMessage.value = null
    unifiedStore.messageSuccess(t('aiPanel.fileInput.fileAdded', { name: result.data.name }))
  } else {
    errorMessage.value = result.error || t('aiPanel.fileInput.dragFailed')
    unifiedStore.messageError(errorMessage.value)
  }
}

// 在指定位置添加或替换文件
const addFileAtIndex = (fileData: FileData, index: number) => {
  const newList = [...fileList.value]
  const oldFile = newList[index]

  // 如果是替换操作，先清理旧的缩略图
  if (oldFile) {
    cleanupThumbnailAtIndex(index)
  }

  newList[index] = fileData

  updateFileList(newList)
  emit('file-added', fileData, index)

  // 加载新缩略图
  loadThumbnailAtIndex(fileData, index)
}

// 移除指定位置的文件
const removeFileAtIndex = (index: number) => {
  const fileData = fileList.value[index]
  if (!fileData) return

  const newList = [...fileList.value]
  newList.splice(index, 1)

  // 清理缩略图资源
  cleanupThumbnailAtIndex(index)

  // 重新索引后续的缩略图
  const oldUrls = new Map(thumbnailUrls.value)
  thumbnailUrls.value.clear()

  for (let i = 0; i < newList.length; i++) {
    const oldIndex = i < index ? i : i + 1
    const url = oldUrls.get(oldIndex)
    if (url) {
      thumbnailUrls.value.set(i, url)
    }
  }

  updateFileList(newList)
  emit('file-removed', fileData, index)
}

// 更新文件列表
const updateFileList = (newList: MultiFileData) => {
  fileList.value = newList
  emit('update:modelValue', newList)
}

// 处理缩略图加载错误
const handleThumbnailError = (index: number) => {
  console.error('缩略图加载失败，索引:', index)
  thumbnailUrls.value.set(index, null)
}

// 获取占位符文本
const getSlotPlaceholder = (index: number): string => {
  if (props.config.placeholder) {
    return props.config.placeholder[props.locale]
  }
  if (maxFiles.value === 1) {
    return t('aiPanel.fileInput.dragPlaceholder')
  }
  return t('aiPanel.fileInput.dragPlaceholder') + ` (${index + 1}/${maxFiles.value})`
}

// 格式化时长
const formatDuration = (frames: number): string => {
  return framesToTimecode(frames)
}

// 格式化时间范围
const formatTimeRange = (fileData: FileData): string => {
  if (!fileData.timeRange) return ''
  const { clipStartTime, clipEndTime } = fileData.timeRange
  return `${framesToTimecode(clipStartTime)} - ${framesToTimecode(clipEndTime)}`
}

// 获取媒体类型标签
const getMediaTypeLabel = (fileData: FileData): string => {
  const typeMap = {
    video: t('aiPanel.fileInput.video'),
    image: t('aiPanel.fileInput.image'),
    audio: t('aiPanel.fileInput.audio'),
  }
  return typeMap[fileData.mediaType] || t('aiPanel.fileInput.unknown')
}

// 获取来源图标
const getSourceIcon = (fileData: FileData): string => {
  return fileData.source === 'media-item' ? '📦' : '🎬'
}

// 获取文件图标
const getFileIcon = (fileData: FileData) => {
  const iconMap = {
    video: IconComponents.VIDEO,
    image: IconComponents.IMAGE_LARGE,
    audio: IconComponents.MUSIC,
  }
  return iconMap[fileData.mediaType] || IconComponents.IMAGE_LARGE
}

// 监听 modelValue 变化
watch(
  () => props.modelValue,
  (newValue) => {
    if (JSON.stringify(newValue) !== JSON.stringify(fileList.value)) {
      fileList.value = newValue || []

      // 清理所有旧的缩略图
      thumbnailUrls.value.forEach((url) => {
        if (url?.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
      thumbnailUrls.value.clear()

      // 加载新的缩略图
      fileList.value.forEach((file, index) => {
        loadThumbnailAtIndex(file, index)
      })
    }
  },
  { immediate: true, deep: true },
)

// 组件卸载时清理资源
onUnmounted(() => {
  // 清理所有blob URL
  thumbnailUrls.value.forEach((url) => {
    if (url?.startsWith('blob:')) {
      console.log('组件卸载时清理 Blob URL:', url)
      URL.revokeObjectURL(url)
    }
  })
  thumbnailUrls.value.clear()
})
</script>

<style scoped>
/* 基础样式 */
.multi-file-input-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.field-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.file-count {
  color: var(--color-text-hint);
  font-weight: normal;
  margin-left: var(--spacing-xs);
}

/* Flexbox 自适应网格布局 */
.multi-file-container {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  align-items: flex-start;
  min-width: 120px;
}

/* 文件槽位 */
.file-slot {
  width: 120px;
  height: 120px;
  position: relative;
  flex-shrink: 0;
  transition: all 0.2s ease;
  cursor: pointer;
}

/* 空槽位样式 */
.file-slot.empty {
  border: 2px dashed var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  background: var(--color-bg-quaternary);
}

/* 已填充槽位样式 */
.file-slot.filled {
  border: 2px solid transparent;
  border-radius: var(--border-radius-small);
  overflow: hidden;
}

/* 拖拽状态样式 */
.file-slot.drag-over-accept {
  border-color: var(--color-accent-primary);
  background: var(--color-accent-bg);
}

/* 已填充槽位的拖拽悬停样式（替换模式） */
.file-slot.filled.drag-over-accept {
  border-color: var(--color-warning);
  box-shadow: 0 0 0 2px var(--color-warning-bg);
}

.file-slot.drag-over-reject {
  border-color: var(--color-error);
  background: var(--color-error-bg);
}

/* 空槽位内容 */
.empty-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: var(--spacing-sm);
  color: var(--color-text-hint);
}

.drop-hint {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-xs);
  text-align: center;
  line-height: 1.3;
}

/* 已填充槽位内容 */
.filled-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0;
  position: relative;
}

/* 拖拽替换提示遮罩 */
.replace-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 193, 7, 0.85);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  z-index: 5;
  border-radius: var(--border-radius-small);
  pointer-events: none;
  letter-spacing: 1px;
}

/* 缩略图容器 */
.file-preview {
  width: 100%;
  height: 100%;
  border-radius: var(--border-radius-small);
  overflow: hidden;
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

.file-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 移除按钮 */
.remove-button {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: var(--border-radius-small);
  cursor: pointer;
  color: white;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  z-index: 10;
}

.file-preview:hover .remove-button {
  opacity: 1;
}

.remove-button:hover {
  background: var(--color-error);
  transform: scale(1.1);
}

/* 错误信息 */
.error-message {
  margin-top: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--color-error);
}

/* Tooltip 内容样式 */
.tooltip-content {
  padding: 8px 12px;
  max-width: 300px;
  font-size: 13px;
  line-height: 1.6;
}

.tooltip-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--n-text-color);
  font-size: 14px;
}

.tooltip-detail {
  color: var(--n-text-color-2);
  font-size: 12px;
  margin-top: 4px;
}

.tooltip-detail-line {
  line-height: 1.5;
}

.tooltip-hint {
  color: var(--n-info-color);
  font-size: 12px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--n-divider-color);
}

/* 响应式设计 */
@media (max-width: 480px) {
  .multi-file-container {
    justify-content: center;
  }
}
</style>
