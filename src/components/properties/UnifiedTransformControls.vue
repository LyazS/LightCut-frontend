<template>
  <div class="transform-controls">
    <!-- 位置大小 -->
    <div class="property-section">
      <div class="section-header">
        <h4>{{ t('properties.transform.positionSize') }}</h4>
      </div>

      <!-- 位置：XY在同一行 -->
      <div class="property-item">
        <label>{{ t('properties.transform.position') }}</label>
        <div class="position-controls">
          <div class="position-input-group">
            <span class="position-label">{{ t('properties.transform.positionX') }}</span>
            <NumberInput
              :model-value="transformX"
              @change="(value) => $emit('update-transform', { x: value })"
              :disabled="!canOperateTransforms"
              :min="positionLimits.minX"
              :max="positionLimits.maxX"
              :step="1"
              :precision="0"
              :placeholder="t('properties.transform.centerFor0')"
            />
          </div>
          <div class="position-input-group">
            <span class="position-label">{{ t('properties.transform.positionY') }}</span>
            <NumberInput
              :model-value="transformY"
              @change="(value) => $emit('update-transform', { y: value })"
              :disabled="!canOperateTransforms"
              :min="positionLimits.minY"
              :max="positionLimits.maxY"
              :step="1"
              :precision="0"
              :placeholder="t('properties.transform.centerFor0')"
            />
          </div>
        </div>
      </div>
      <!-- 水平对齐 -->
      <div class="property-item">
        <label>{{ t('properties.transform.alignHorizontal') }}</label>
        <div class="alignment-controls">
          <button
            @click="$emit('align-horizontal', 'left')"
            :disabled="!canOperateTransforms"
            class="align-btn"
            :title="t('properties.transform.left')"
          >
            <component :is="IconComponents.ALIGN_ITEM_LEFT" size="16px" />
          </button>
          <button
            @click="$emit('align-horizontal', 'center')"
            :disabled="!canOperateTransforms"
            class="align-btn"
            :title="t('properties.transform.center')"
          >
            <component :is="IconComponents.ALIGN_ITEM_H_CENTER" size="16px" />
          </button>
          <button
            @click="$emit('align-horizontal', 'right')"
            :disabled="!canOperateTransforms"
            class="align-btn"
            :title="t('properties.transform.right')"
          >
            <component :is="IconComponents.ALIGN_ITEM_RIGHT" size="16px" />
          </button>
        </div>
      </div>

      <!-- 垂直对齐 -->
      <div class="property-item">
        <label>{{ t('properties.transform.alignVertical') }}</label>
        <div class="alignment-controls">
          <button
            @click="$emit('align-vertical', 'top')"
            :disabled="!canOperateTransforms"
            class="align-btn"
            :title="t('properties.transform.top')"
          >
            <component :is="IconComponents.ALIGN_ITEM_TOP" size="16px" />
          </button>
          <button
            @click="$emit('align-vertical', 'middle')"
            :disabled="!canOperateTransforms"
            class="align-btn"
            :title="t('properties.transform.middle')"
          >
            <component :is="IconComponents.ALIGN_ITEM_V_CENTER" size="16px" />
          </button>
          <button
            @click="$emit('align-vertical', 'bottom')"
            :disabled="!canOperateTransforms"
            class="align-btn"
            :title="t('properties.transform.bottom')"
          >
            <component :is="IconComponents.ALIGN_ITEM_BOTTOM" size="16px" />
          </button>
        </div>
      </div>
      <!-- 等比缩放选项 -->
      <div class="property-item">
        <label>{{ t('properties.transform.proportionalScale') }}</label>
        <input
          :checked="proportionalScale"
          @change="$emit('toggle-proportional-scale')"
          :disabled="!canOperateTransforms"
          type="checkbox"
          class="checkbox-input"
        />
      </div>

      <!-- 等比缩放时的统一缩放控制 -->
      <div v-if="proportionalScale" class="property-item">
        <label>{{ t('properties.transform.scale') }}</label>
        <div class="scale-controls">
          <SliderInput
            :model-value="uniformScale"
            @input="(value) => $emit('update-uniform-scale', value)"
            :disabled="!canOperateTransforms"
            :min="0.01"
            :max="5"
            :step="0.01"
          />
          <NumberInput
            :model-value="uniformScale"
            @change="(value) => $emit('update-uniform-scale', value)"
            :disabled="!canOperateTransforms"
            :min="0.01"
            :max="5"
            :step="0.01"
            :precision="2"
            :show-controls="false"
            input-class="scale-input"
          />
        </div>
      </div>

      <!-- 非等比缩放时的独立XY缩放控制 -->
      <template v-else>
        <div class="property-item">
          <label>{{ t('properties.transform.scaleX') }}</label>
          <div class="scale-controls">
            <SliderInput
              :model-value="scaleX"
              @input="(value) => $emit('set-scale-x', value)"
              :disabled="!canOperateTransforms"
              :min="0.01"
              :max="5"
              :step="0.01"
            />
            <NumberInput
              :model-value="scaleX"
              @change="(value) => $emit('set-scale-x', value)"
              :disabled="!canOperateTransforms"
              :min="0.01"
              :max="5"
              :step="0.01"
              :precision="2"
              :show-controls="false"
              input-class="scale-input"
            />
          </div>
        </div>
        <div class="property-item">
          <label>{{ t('properties.transform.scaleY') }}</label>
          <div class="scale-controls">
            <SliderInput
              :model-value="scaleY"
              @input="(value) => $emit('set-scale-y', value)"
              :disabled="!canOperateTransforms"
              :min="0.01"
              :max="5"
              :step="0.01"
            />
            <NumberInput
              :model-value="scaleY"
              @change="(value) => $emit('set-scale-y', value)"
              :disabled="!canOperateTransforms"
              :min="0.01"
              :max="5"
              :step="0.01"
              :precision="2"
              :show-controls="false"
              input-class="scale-input"
            />
          </div>
        </div>
      </template>
      <!-- 缩放预设按钮 -->
      <div class="property-item">
        <label>{{ t('properties.transform.scalePresets') }}</label>
        <div class="scale-preset-controls">
          <button @click="handleFitToCanvas" :disabled="!canOperateTransforms" class="preset-btn">
            {{ t('properties.transform.fitToCanvas') }}
          </button>
          <button @click="handleFillCanvas" :disabled="!canOperateTransforms" class="preset-btn">
            {{ t('properties.transform.fillCanvas') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 变换属性 -->
    <div class="property-section">
      <h4>{{ t('properties.transform.transform') }}</h4>

      <div class="property-item">
        <label>{{ t('properties.transform.rotation') }}</label>
        <div class="rotation-controls">
          <SliderInput
            :model-value="rotation"
            @input="(value) => $emit('set-rotation', value)"
            :disabled="!canOperateTransforms"
            :min="-180"
            :max="180"
            :step="0.1"
            slider-class="rotation-slider"
          />
          <NumberInput
            :model-value="rotation"
            @change="(value) => $emit('set-rotation', value)"
            :disabled="!canOperateTransforms"
            :step="1"
            :precision="1"
            :show-controls="false"
            input-class="scale-input"
          />
        </div>
      </div>

      <div class="property-item">
        <label>{{ t('properties.transform.opacity') }}</label>
        <div class="opacity-controls">
          <SliderInput
            :model-value="opacity"
            @input="(value) => $emit('set-opacity', value)"
            :disabled="!canOperateTransforms"
            :min="0"
            :max="1"
            :step="0.01"
            slider-class="opacity-slider"
          />
          <NumberInput
            :model-value="opacity"
            @change="(value) => $emit('set-opacity', value)"
            :disabled="!canOperateTransforms"
            :min="0"
            :max="1"
            :step="0.01"
            :precision="2"
            :show-controls="false"
            input-class="scale-input"
          />
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'
import { IconComponents } from '@/constants/iconComponents'
import NumberInput from '@/components/base/NumberInput.vue'
import SliderInput from '@/components/base/SliderInput.vue'

const { t } = useAppI18n()
const unifiedStore = useUnifiedStore()

interface Props {
  // 变换属性
  transformX: number
  transformY: number
  scaleX: number
  scaleY: number
  rotation: number
  opacity: number
 
  // 缩放相关
  proportionalScale: boolean
  uniformScale: number

  // 元素原始尺寸（用于缩放预设）
  elementWidth: number
  elementHeight: number

  // 操作状态
  canOperateTransforms: boolean

  // 位置限制
  positionLimits: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
}

interface Emits {
  (e: 'update-transform', transform: { x?: number; y?: number }): void
  (e: 'toggle-proportional-scale'): void
  (e: 'update-uniform-scale', value: number): void
  (e: 'set-scale-x', value: number): void
  (e: 'set-scale-y', value: number): void
  (e: 'set-rotation', value: number): void
  (e: 'set-opacity', value: number): void
  (e: 'align-horizontal', alignment: 'left' | 'center' | 'right'): void
  (e: 'align-vertical', alignment: 'top' | 'middle' | 'bottom'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 处理适应画布按钮点击
const handleFitToCanvas = () => {
  const { elementWidth, elementHeight } = props

  if (elementWidth <= 0 || elementHeight <= 0) {
    console.warn('无法计算缩放：元素尺寸无效', { elementWidth, elementHeight })
    return
  }

  // 获取画布尺寸
  const canvasWidth = unifiedStore.videoResolution.width
  const canvasHeight = unifiedStore.videoResolution.height

  // 计算适应画布的缩放比例（最小比例，确保元素完全显示在画布内）
  const scale = Math.min(canvasWidth / elementWidth, canvasHeight / elementHeight)

  console.log(
    `适应画布：元素尺寸 ${elementWidth}x${elementHeight}, 画布尺寸 ${canvasWidth}x${canvasHeight}, 缩放比例 ${scale}`,
  )

  emit('update-uniform-scale', scale)
}

// 处理填满画布按钮点击
const handleFillCanvas = () => {
  const { elementWidth, elementHeight } = props

  if (elementWidth <= 0 || elementHeight <= 0) {
    console.warn('无法计算缩放：元素尺寸无效', { elementWidth, elementHeight })
    return
  }

  // 获取画布尺寸
  const canvasWidth = unifiedStore.videoResolution.width
  const canvasHeight = unifiedStore.videoResolution.height

  // 计算填满画布的缩放比例（最大比例，确保画布被完全覆盖）
  const scale = Math.max(canvasWidth / elementWidth, canvasHeight / elementHeight)

  console.log(
    `填满画布：元素尺寸 ${elementWidth}x${elementHeight}, 画布尺寸 ${canvasWidth}x${canvasHeight}, 缩放比例 ${scale}`,
  )

  emit('update-uniform-scale', scale)
}
</script>

<style scoped>
.transform-controls {
  width: 100%;
}

.position-controls {
  display: flex;
  gap: var(--spacing-xs);
  flex: 1;
}

.position-input-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex: 1;
}

.position-label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  min-width: 12px;
}

.checkbox-input {
  width: 16px;
  height: 16px;
  accent-color: var(--color-text-primary);
  cursor: pointer;
}

.scale-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex: 1;
}

.scale-preset-controls {
  display: flex;
  gap: var(--spacing-xs);
  flex: 1;
}

.alignment-controls {
  display: flex;
  gap: var(--spacing-xs);
}

.align-btn {
  background: var(--color-bg-active);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-medium);
  color: var(--color-text-secondary);
  padding: var(--spacing-xs);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex: 1;
  min-width: 28px;
  height: 24px;
}

.preset-btn {
  background: var(--color-bg-active);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-medium);
  color: var(--color-text-secondary);
  padding: var(--spacing-xs) var(--spacing-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: all var(--transition-fast);
  flex: 1;
  min-height: 24px;
}

.preset-btn:hover {
  background: var(--color-border-secondary);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.preset-btn:active {
  background: var(--color-border-hover);
  transform: translateY(1px);
}

.align-btn:hover {
  background: var(--color-border-secondary);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.align-btn:active {
  background: var(--color-border-hover);
  transform: translateY(1px);
}

.align-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  border-color: var(--color-border-secondary);
  box-shadow: none;
}

.align-btn:disabled:hover {
  transform: none;
  box-shadow: none;
}

.align-btn svg {
  width: 14px;
  height: 14px;
}

.rotation-controls,
.opacity-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex: 1;
}

/* 禁用状态样式 */
.transform-controls input:disabled,
.transform-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  border-color: var(--color-border-secondary);
  box-shadow: none;
}

.transform-controls input:disabled:hover,
.transform-controls button:disabled:hover {
  transform: none;
  box-shadow: none;
}

.preset-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  border-color: var(--color-border-secondary);
  box-shadow: none;
}

.preset-btn:disabled:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-secondary);
  transform: none;
  box-shadow: none;
}

/* 区域标题头部布局 */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.section-header h4 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  font-weight: 600;
}

</style>
