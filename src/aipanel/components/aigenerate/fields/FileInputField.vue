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
      
      <!-- 有文件状态 -->
      <div v-else class="drop-zone-filled">
        <div class="file-preview">
          <img v-if="previewUrl" :src="previewUrl" alt="Preview" />
          <component v-else :is="getFileIcon()" size="48px" />
        </div>
        <div class="file-info">
          <p class="file-name">{{ fileData.name }}</p>
          <p class="file-meta">{{ formatFileInfo() }}</p>
        </div>
        <button class="remove-button" @click="handleRemove">
          <component :is="IconComponents.CLOSE" size="16px" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FileInputConfig } from '@/core/datasource/providers/ai-generation/types'
import { IconComponents } from '@/constants/iconComponents'
import { useUnifiedStore } from '@/core/unifiedStore'
import { DropTargetType, type AIGenerationPanelDropTargetInfo } from '@/core/types/drag'

interface FileData {
  name: string
  mediaType: 'video' | 'image' | 'audio'
  mediaItemId?: string // 来自素材库
  timelineItemId?: string // 来自时间轴
  path?: string // 文件路径
  duration?: number
  timeRange?: {
    clipStartTime: number
    clipEndTime: number
    timelineStartTime: number
    timelineEndTime: number
  }
}

interface Props {
  config: FileInputConfig
  modelValue: any // 当前字段值
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
const previewUrl = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

// 拖拽区域样式类
const dropZoneClasses = computed(() => ({
  'drag-accept': dragState.value === 'accept',
  'drag-reject': dragState.value === 'reject',
  'has-file': !!fileData.value,
}))

// 处理拖拽悬停
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  
  // 创建目标信息
  const targetInfo: AIGenerationPanelDropTargetInfo = {
    targetType: DropTargetType.AI_GENERATION_PANEL,
    fieldConfig: props.config,
  }
  
  // 调用统一拖拽管理器检查是否可以放置
  const canDrop = unifiedStore.handleDragOver(event, targetInfo)
  
  // 更新UI状态
  dragState.value = canDrop ? 'accept' : 'reject'
  
  // 清除错误消息
  if (canDrop) {
    errorMessage.value = null
  }
}

// 处理拖拽离开
const handleDragLeave = (event: DragEvent) => {
  // 检查是否真的离开了元素（避免子元素触发）
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
  
  // 创建目标信息
  const targetInfo: AIGenerationPanelDropTargetInfo = {
    targetType: DropTargetType.AI_GENERATION_PANEL,
    fieldConfig: props.config,
  }
  
  // 调用统一拖拽管理器处理放置
  const result = await unifiedStore.handleDrop(event, targetInfo)
  
  if (result.success && result.data) {
    // 更新组件状态
    fileData.value = result.data
    emit('update:modelValue', result.data)
    errorMessage.value = null
    
    // 显示成功消息
    unifiedStore.messageSuccess(`已添加文件: ${result.data.name}`)
    
    console.log('✅ 文件拖拽成功:', result.data)
  } else {
    // 显示错误消息
    errorMessage.value = '文件拖拽失败，请重试'
    unifiedStore.messageError('文件拖拽失败，请重试')
    
    console.error('❌ 文件拖拽失败')
  }
}

// 处理移除文件
const handleRemove = () => {
  fileData.value = null
  previewUrl.value = null
  emit('update:modelValue', null)
}

// 获取占位符文本
const getPlaceholder = () => {
  if (props.config.placeholder) {
    return props.config.placeholder[props.locale]
  }
  return '拖拽素材或时间轴片段到此处'
}

// 格式化文件信息
const formatFileInfo = () => {
  if (!fileData.value) return ''
  const parts: string[] = [fileData.value.mediaType]
  if (fileData.value.duration) {
    parts.push(`${(fileData.value.duration / 30).toFixed(2)}s`)
  }
  return parts.join(' • ')
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
</script>

<style scoped>
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

.drop-zone-filled {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
}

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
}

.file-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-hint);
  margin-top: var(--spacing-xs);
}

.remove-button {
  padding: var(--spacing-xs);
  background: var(--color-bg-secondary);
  border: none;
  border-radius: var(--border-radius-small);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-button:hover {
  background: var(--color-error-bg);
  color: var(--color-error);
}
</style>