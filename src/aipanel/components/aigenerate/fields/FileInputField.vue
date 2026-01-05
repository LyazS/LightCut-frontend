<template>
  <div class="file-input-field">
    <label class="field-label">
      {{ config.label[locale] }}
    </label>
    
    <div
      class="drop-zone"
      :class="dropZoneClasses"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <!-- 无文件状态 -->
      <div v-if="!fileData" class="drop-zone-empty">
        <component :is="IconComponents.UPLOAD" size="32px" />
        <p class="drop-hint">
          {{ getPlaceholder() }}
        </p>
        <p v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </p>
      </div>
      
      <!-- 有文件状态 - 使用 n-tooltip 包裹整个区域 -->
      <n-tooltip
        v-else
        :show-arrow="true"
        placement="right"
        :delay="300"
        trigger="hover"
      >
        <template #trigger>
          <div class="drop-zone-filled">
            <div class="file-preview">
              <!-- 显示缩略图（仅视频和图片） -->
              <img
                v-if="previewUrl && fileData.mediaType !== 'audio'"
                :src="previewUrl"
                alt="Preview"
                @error="handleThumbnailError"
              />
              <!-- 音频或无缩略图时显示图标 -->
              <component v-else :is="getFileIcon()" size="48px" />
              
              <!-- 移除按钮悬浮在右上角 -->
              <button class="remove-button" @click.stop="handleRemove">
                <component :is="IconComponents.CLOSE" size="16px" />
              </button>
            </div>
          </div>
        </template>
        
        <!-- Tooltip 内容 -->
        <div class="tooltip-content">
          <div class="tooltip-title">
            {{ getSourceIcon() }} {{ fileData.name }}
          </div>
          
          <div class="tooltip-detail">
            <div class="tooltip-detail-line">
              类型：{{ getMediaTypeLabel() }}
            </div>
            <div v-if="fileData.duration" class="tooltip-detail-line">
              时长：{{ formatDuration(fileData.duration) }}
            </div>
            <div v-if="fileData.resolution" class="tooltip-detail-line">
              分辨率：{{ fileData.resolution.width }}x{{ fileData.resolution.height }}
            </div>
            <div v-if="fileData.timeRange" class="tooltip-detail-line">
              片段范围：{{ formatTimeRange() }}
            </div>
          </div>
          
          <div class="tooltip-hint">
            💡 来源：{{ fileData.source === 'media-item' ? '素材区' : '时间轴' }}
          </div>
        </div>
      </n-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { NTooltip } from 'naive-ui'
import type { FileInputConfig } from '@/core/datasource/providers/ai-generation/types'
import { IconComponents } from '@/constants/iconComponents'
import { useUnifiedStore } from '@/core/unifiedStore'
import { DropTargetType, type AIGenerationPanelDropTargetInfo } from '@/core/types/drag'
import { framesToTimecode } from '@/core/utils/timeUtils'

interface FileData {
  name: string
  mediaType: 'video' | 'image' | 'audio'
  mediaItemId?: string
  timelineItemId?: string
  path?: string
  duration?: number
  resolution?: {
    width: number
    height: number
  }
  timeRange?: {
    clipStartTime: number
    clipEndTime: number
    timelineStartTime: number
    timelineEndTime: number
  }
  source: 'media-item' | 'timeline-item'
}

interface Props {
  config: FileInputConfig
  modelValue: any
  locale: 'zh' | 'en'
}

interface Emits {
  (e: 'update:modelValue', value: any): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const unifiedStore = useUnifiedStore()

const dragState = ref<'idle' | 'accept' | 'reject'>('idle')
const fileData = ref<FileData | null>(null)
const errorMessage = ref<string | null>(null)

// 缩略图 URL（组件内部状态，不属于 FileData）
const thumbnailUrl = ref<string | null>(null)

// 缩略图URL（计算属性）
const previewUrl = computed(() => {
  // 音频类型不显示缩略图
  if (fileData.value?.mediaType === 'audio') {
    return null
  }
  return thumbnailUrl.value
})

// 拖拽区域样式类
const dropZoneClasses = computed(() => ({
  'drag-accept': dragState.value === 'accept',
  'drag-reject': dragState.value === 'reject',
  'has-file': !!fileData.value,
}))

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
        // 时间轴视频：生成新缩略图（保持现有逻辑）
        const { generateThumbnailForUnifiedMediaItemBunny } = await import(
          '@/core/bunnyUtils/thumbGenerator'
        )
        
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

// 加载缩略图
const loadThumbnail = async (data: FileData) => {
  // 清理所有旧的blob URL（统一逻辑）
  if (thumbnailUrl.value?.startsWith('blob:')) {
    console.log('加载新缩略图前清理旧的 Blob URL:', thumbnailUrl.value)
    URL.revokeObjectURL(thumbnailUrl.value)
  }
  
  thumbnailUrl.value = null
  thumbnailUrl.value = await generateUnifiedThumbnail(data)
}

// 处理拖拽悬停
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  
  const targetInfo: AIGenerationPanelDropTargetInfo = {
    targetType: DropTargetType.AI_GENERATION_PANEL,
    fieldConfig: props.config,
  }
  
  const canDrop = unifiedStore.handleDragOver(event, targetInfo)
  dragState.value = canDrop ? 'accept' : 'reject'
  
  if (canDrop) {
    errorMessage.value = null
  }
}

// 处理拖拽离开
const handleDragLeave = (event: DragEvent) => {
  const currentTarget = event.currentTarget as Element
  const relatedTarget = event.relatedTarget as Node
  
  if (currentTarget && !currentTarget.contains(relatedTarget)) {
    dragState.value = 'idle'
  }
}

// 处理拖拽放置
const handleDrop = async (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  dragState.value = 'idle'
  
  const targetInfo: AIGenerationPanelDropTargetInfo = {
    targetType: DropTargetType.AI_GENERATION_PANEL,
    fieldConfig: props.config,
  }
  
  const result = await unifiedStore.handleDrop(event, targetInfo)
  
  if (result.success && result.data) {
    fileData.value = result.data
    emit('update:modelValue', result.data)
    errorMessage.value = null
    
    // 根据 fileData 加载缩略图
    await loadThumbnail(result.data)
    
    unifiedStore.messageSuccess(`已添加文件: ${result.data.name}`)
  } else {
    errorMessage.value = '文件拖拽失败，请重试'
    unifiedStore.messageError('文件拖拽失败，请重试')
  }
}

// 处理移除文件
const handleRemove = () => {
  // 清理所有blob URL（统一逻辑）
  if (thumbnailUrl.value?.startsWith('blob:')) {
    console.log('移除文件时清理 Blob URL:', thumbnailUrl.value)
    URL.revokeObjectURL(thumbnailUrl.value)
  }
  
  fileData.value = null
  thumbnailUrl.value = null
  emit('update:modelValue', null)
}

// 处理缩略图加载错误
const handleThumbnailError = () => {
  console.error('缩略图加载失败，将显示文件类型图标')
  thumbnailUrl.value = null
}

// 获取占位符文本
const getPlaceholder = () => {
  if (props.config.placeholder) {
    return props.config.placeholder[props.locale]
  }
  return '拖拽素材或时间轴片段到此处'
}

// 格式化时长
const formatDuration = (frames: number): string => {
  return framesToTimecode(frames)
}

// 格式化时间范围
const formatTimeRange = (): string => {
  if (!fileData.value?.timeRange) return ''
  const { clipStartTime, clipEndTime } = fileData.value.timeRange
  return `${framesToTimecode(clipStartTime)} - ${framesToTimecode(clipEndTime)}`
}

// 获取媒体类型标签
const getMediaTypeLabel = (): string => {
  if (!fileData.value) return ''
  const typeMap = {
    video: '视频',
    image: '图片',
    audio: '音频',
  }
  return typeMap[fileData.value.mediaType] || '未知'
}

// 获取来源图标
const getSourceIcon = (): string => {
  if (!fileData.value) return '📦'
  return fileData.value.source === 'media-item' ? '📦' : '🎬'
}

// 获取文件图标
const getFileIcon = () => {
  if (!fileData.value) return IconComponents.IMAGE_LARGE
  const iconMap = {
    video: IconComponents.VIDEO,
    image: IconComponents.IMAGE_LARGE,
    audio: IconComponents.MUSIC,
  }
  return iconMap[fileData.value.mediaType] || IconComponents.IMAGE_LARGE
}

// 监听 modelValue 变化
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== fileData.value) {
      fileData.value = newValue
      if (newValue) {
        loadThumbnail(newValue)
      } else {
        thumbnailUrl.value = null
      }
    }
  },
  { immediate: true }
)

// 组件卸载时清理资源
onUnmounted(() => {
  // 清理所有blob URL（统一逻辑）
  if (thumbnailUrl.value?.startsWith('blob:')) {
    console.log('组件卸载时清理 Blob URL:', thumbnailUrl.value)
    URL.revokeObjectURL(thumbnailUrl.value)
  }
})
</script>

<style scoped>
/* 基础样式 */
.file-input-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.field-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.drop-zone {
  min-height: 120px;
  border: 2px dashed var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  background: var(--color-bg-quaternary);
  transition: all 0.2s ease;
  cursor: pointer;
}

.drop-zone.drag-accept {
  border-color: var(--color-accent-primary);
  background: var(--color-accent-bg);
}

.drop-zone.drag-reject {
  border-color: var(--color-error);
  background: var(--color-error-bg);
}

.drop-zone-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 120px;
  padding: var(--spacing-lg);
  color: var(--color-text-hint);
}

.drop-hint {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-sm);
  text-align: center;
}

.error-message {
  margin-top: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--color-error);
  text-align: center;
}

/* 已选文件状态 - 简化布局，只显示缩略图 */
.drop-zone-filled {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md);
  min-height: 120px;
}

/* 缩略图容器 - 相对定位以容纳移除按钮 */
.file-preview {
  width: 80px;
  height: 80px;
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

/* 移除按钮 - 悬浮在右上角 */
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

/* 悬停时显示移除按钮 */
.file-preview:hover .remove-button {
  opacity: 1;
}

.remove-button:hover {
  background: var(--color-error);
  transform: scale(1.1);
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
</style>