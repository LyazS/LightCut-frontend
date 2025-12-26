<template>
  <div class="text-clip-properties">
    <!-- 基本信息 -->
    <div class="property-section">
      <h4>{{ t('properties.basic.basicInfo') }}</h4>
      <div class="property-item">
        <label>{{ t('properties.basic.textContent') }}</label>
        <textarea
          :value="localText"
          @blur="updateTextContent"
          @keyup.ctrl.enter="updateTextContent"
          class="text-content-input"
          :placeholder="t('properties.placeholders.enterText')"
          rows="3"
        />
      </div>
      <div class="property-item">
        <label>{{ t('properties.basic.duration') }}</label>
        <TimecodeInput
          :model-value="timelineDurationFrames"
          @update:model-value="updateTargetDurationFrames"
          @error="handleTimecodeError"
          :placeholder="t('properties.timecodes.timecodeFormat')"
        />
      </div>
    </div>

    <!-- 文本样式 -->
    <div class="property-section">
      <h4>{{ t('properties.effects.textStyle') }}</h4>

      <!-- 字体设置 -->
      <div class="property-item">
        <label>{{ t('properties.basic.fontFamily') }}</label>
        <div class="font-controls">
          <select
            :value="localStyle.fontFamily"
            @change="handleFontFamilyChange"
            class="font-family-select"
          >
            <option value="Arial, sans-serif">{{ t('properties.fonts.fontFamilyArial') }}</option>
            <option value="'Microsoft YaHei', sans-serif">
              {{ t('properties.fonts.fontFamilyMicrosoftYaHei') }}
            </option>
            <option value="'SimHei', sans-serif">
              {{ t('properties.fonts.fontFamilySimHei') }}
            </option>
            <option value="'SimSun', serif">{{ t('properties.fonts.fontFamilySimSun') }}</option>
            <option value="'KaiTi', serif">{{ t('properties.fonts.fontFamilyKaiTi') }}</option>
            <option value="'Times New Roman', serif">
              {{ t('properties.fonts.fontFamilyTimesNewRoman') }}
            </option>
            <option value="'Courier New', monospace">
              {{ t('properties.fonts.fontFamilyCourierNew') }}
            </option>
          </select>
        </div>
      </div>

      <!-- 字体大小 -->
      <div class="property-item">
        <label>{{ t('properties.basic.fontSize') }}</label>
        <div class="font-size-controls">
          <SliderInput
            :model-value="localStyle.fontSize"
            @input="updateFontSize"
            :min="12"
            :max="200"
            :step="1"
            slider-class="font-size-slider"
          />
          <NumberInput
            :model-value="localStyle.fontSize"
            @change="updateFontSize"
            :min="12"
            :max="200"
            :step="1"
            :precision="0"
            :show-controls="false"
            :placeholder="t('properties.placeholders.fontSize')"
            :input-style="{ maxWidth: '60px', textAlign: 'center' }"
          />
        </div>
      </div>

      <!-- 字体样式 -->
      <div class="property-item">
        <label>{{ t('properties.basic.fontStyle') }}</label>
        <div class="font-style-controls">
          <select
            :value="localStyle.fontWeight"
            @change="handleFontWeightChange"
            class="font-weight-select"
          >
            <option value="normal">{{ t('properties.effects.normal') }}</option>
            <option value="bold">{{ t('properties.effects.bold') }}</option>
            <option value="lighter">{{ t('properties.effects.lighter') }}</option>
          </select>
          <select
            :value="localStyle.fontStyle"
            @change="handleFontStyleChange"
            class="font-style-select"
          >
            <option value="normal">{{ t('properties.fonts.fontStyleNormal') }}</option>
            <option value="italic">{{ t('properties.fonts.fontStyleItalic') }}</option>
          </select>
        </div>
      </div>

      <!-- 文字颜色 -->
      <div class="property-item">
        <label>{{ t('properties.effects.textColor') }}</label>
        <div class="color-controls">
          <input
            type="color"
            :value="localStyle.color"
            @change="handleColorChange"
            class="color-picker"
          />
        </div>
      </div>

      <!-- 背景颜色 -->
      <div class="property-item">
        <label>{{ t('properties.effects.backgroundColor') }}</label>
        <div class="background-color-controls">
          <input
            type="color"
            :value="localStyle.backgroundColor || '#000000'"
            @change="handleBackgroundColorChange"
            class="color-picker"
            :disabled="!backgroundColorEnabled"
          />
          <label class="checkbox-wrapper">
            <input
              type="checkbox"
              :checked="backgroundColorEnabled"
              @change="toggleBackgroundColor"
              class="background-color-checkbox"
            />
          </label>
        </div>
      </div>

      <!-- 文本对齐 -->
      <div class="property-item">
        <label>{{ t('properties.effects.textAlign') }}</label>
        <div class="text-align-controls">
          <button
            v-for="align in textAlignOptions"
            :key="align.value"
            @click="updateTextAlign"
            class="align-btn"
            :class="{ active: localStyle.textAlign === align.value }"
            :title="
              t(
                `properties.effects.textAlign${align.value.charAt(0).toUpperCase() + align.value.slice(1)}`,
              )
            "
            :data-align="align.value"
          >
            <component
              :is="
                align.value === 'left'
                  ? IconComponents.ALIGN_LEFT
                  : align.value === 'center'
                    ? IconComponents.ALIGN_CENTER
                    : IconComponents.ALIGN_RIGHT
              "
              size="16px"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- 文本效果 -->
    <div class="property-section">
      <h4>{{ t('properties.effects.textEffects') }}</h4>

      <!-- 阴影效果 -->
      <div class="property-item">
        <label>{{ t('properties.effects.shadow') }}</label>
        <div class="shadow-controls">
          <label class="checkbox-wrapper">
            <input
              type="checkbox"
              :checked="shadowEnabled"
              @change="toggleShadow"
              class="effect-checkbox"
            />
          </label>
          <div v-if="shadowEnabled" class="shadow-settings">
            <div class="shadow-setting-row">
              <label class="setting-label">{{ t('properties.effects.effectColor') }}</label>
              <input
                type="color"
                :value="shadowColor"
                @change="handleShadowColorChange"
                class="color-picker small"
              />
            </div>
            <div class="shadow-setting-row">
              <label class="setting-label">{{ t('properties.effects.blur') }}</label>
              <SliderInput
                :model-value="shadowBlur"
                @input="updateShadowBlur"
                :min="0"
                :max="20"
                :step="1"
                slider-class="effect-slider"
              />
              <NumberInput
                :model-value="shadowBlur"
                @change="updateShadowBlur"
                :min="0"
                :max="20"
                :step="1"
                :precision="0"
                :show-controls="false"
                :placeholder="t('properties.placeholders.blur')"
                :input-style="{ maxWidth: '50px', textAlign: 'center' }"
              />
            </div>
            <div class="shadow-setting-row">
              <label class="setting-label">{{ t('properties.effects.shadowOffsetX') }}</label>
              <SliderInput
                :model-value="shadowOffsetX"
                @input="updateShadowOffsetX"
                :min="-20"
                :max="20"
                :step="1"
                slider-class="effect-slider"
              />
              <NumberInput
                :model-value="shadowOffsetX"
                @change="updateShadowOffsetX"
                :min="-20"
                :max="20"
                :step="1"
                :precision="0"
                :show-controls="false"
                :placeholder="t('properties.placeholders.offsetX')"
                :input-style="{ maxWidth: '50px', textAlign: 'center' }"
              />
            </div>
            <div class="shadow-setting-row">
              <label class="setting-label">{{ t('properties.effects.shadowOffsetY') }}</label>
              <SliderInput
                :model-value="shadowOffsetY"
                @input="updateShadowOffsetY"
                :min="-20"
                :max="20"
                :step="1"
                slider-class="effect-slider"
              />
              <NumberInput
                :model-value="shadowOffsetY"
                @change="updateShadowOffsetY"
                :min="-20"
                :max="20"
                :step="1"
                :precision="0"
                :show-controls="false"
                :placeholder="t('properties.placeholders.offsetY')"
                :input-style="{ maxWidth: '50px', textAlign: 'center' }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 描边效果 -->
      <div class="property-item">
        <label>{{ t('properties.effects.stroke') }}</label>
        <div class="stroke-controls">
          <label class="checkbox-wrapper">
            <input
              type="checkbox"
              :checked="strokeEnabled"
              @change="toggleStroke"
              class="effect-checkbox"
            />
          </label>
          <div v-if="strokeEnabled" class="stroke-settings">
            <div class="stroke-setting-row">
              <label class="setting-label">{{ t('properties.effects.effectColor') }}</label>
              <input
                type="color"
                :value="strokeColor"
                @change="handleStrokeColorChange"
                class="color-picker small"
              />
            </div>
            <div class="stroke-setting-row">
              <label class="setting-label">{{ t('properties.effects.width') }}</label>
              <SliderInput
                :model-value="strokeWidth"
                @input="updateStrokeWidth"
                :min="0"
                :max="10"
                :step="0.5"
                slider-class="effect-slider"
              />
              <NumberInput
                :model-value="strokeWidth"
                @change="updateStrokeWidth"
                :min="0"
                :max="10"
                :step="0.5"
                :precision="1"
                :show-controls="false"
                :placeholder="t('properties.placeholders.width')"
                :input-style="{ maxWidth: '50px', textAlign: 'center' }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 发光效果 -->
      <div class="property-item">
        <label>{{ t('properties.effects.glow') }}</label>
        <div class="glow-controls">
          <label class="checkbox-wrapper">
            <input
              type="checkbox"
              :checked="glowEnabled"
              @change="toggleGlow"
              class="effect-checkbox"
            />
          </label>
          <div v-if="glowEnabled" class="glow-settings">
            <div class="glow-setting-row">
              <label class="setting-label">{{ t('properties.effects.effectColor') }}</label>
              <input
                type="color"
                :value="glowColor"
                @change="handleGlowColorChange"
                class="color-picker small"
              />
            </div>
            <div class="glow-setting-row">
              <label class="setting-label">{{ t('properties.effects.blur') }}</label>
              <SliderInput
                :model-value="glowBlur"
                @input="updateGlowBlur"
                :min="1"
                :max="30"
                :step="1"
                slider-class="effect-slider"
              />
              <NumberInput
                :model-value="glowBlur"
                @change="updateGlowBlur"
                :min="1"
                :max="30"
                :step="1"
                :precision="0"
                :show-controls="false"
                :placeholder="t('properties.placeholders.blur')"
                :input-style="{ maxWidth: '50px', textAlign: 'center' }"
              />
            </div>
            <div class="glow-setting-row">
              <label class="setting-label">{{ t('properties.effects.spread') }}</label>
              <SliderInput
                :model-value="glowSpread"
                @input="updateGlowSpread"
                :min="0"
                :max="20"
                :step="1"
                slider-class="effect-slider"
              />
              <NumberInput
                :model-value="glowSpread"
                @change="updateGlowSpread"
                :min="0"
                :max="20"
                :step="1"
                :precision="0"
                :show-controls="false"
                :placeholder="t('properties.placeholders.spread')"
                :input-style="{ maxWidth: '50px', textAlign: 'center' }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 关键帧控制 -->
    <UnifiedKeyframeControls
      :keyframe-button-state="unifiedKeyframeButtonState"
      :can-operate-keyframes="canOperateUnifiedKeyframes"
      :has-previous-keyframe="hasUnifiedPreviousKeyframe"
      :has-next-keyframe="hasUnifiedNextKeyframe"
      :keyframe-tooltip="getUnifiedKeyframeTooltip()"
      :show-debug-button="true"
      @toggle-keyframe="toggleUnifiedKeyframe"
      @go-to-previous="goToPreviousUnifiedKeyframe"
      @go-to-next="goToNextUnifiedKeyframe"
      @debug-keyframes="debugUnifiedKeyframes"
    />

    <!-- 变换控制 -->
    <UnifiedTransformControls
      :transform-x="transformX"
      :transform-y="transformY"
      :scale-x="scaleX"
      :scale-y="scaleY"
      :rotation="rotation"
      :opacity="opacity"
      :z-index="zIndex"
      :proportional-scale="proportionalScale"
      :uniform-scale="uniformScale"
      :element-width="elementWidth"
      :element-height="elementHeight"
      :can-operate-transforms="canOperateTransforms"
      :position-limits="{
        minX: -unifiedStore.videoResolution.width,
        maxX: unifiedStore.videoResolution.width,
        minY: -unifiedStore.videoResolution.height,
        maxY: unifiedStore.videoResolution.height,
      }"
      @update-transform="updateTransform"
      @toggle-proportional-scale="toggleProportionalScale"
      @update-uniform-scale="updateUniformScale"
      @set-scale-x="setScaleX"
      @set-scale-y="setScaleY"
      @set-rotation="setRotation"
      @set-opacity="setOpacity"
      @align-horizontal="alignHorizontal"
      @align-vertical="alignVertical"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppI18n } from '@/core/composables/useI18n'
import { useUnifiedStore } from '@/core/unifiedStore'
import { isTextTimelineItem } from '@/core/timelineitem/queries'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { TextStyleConfig } from '@/core/timelineitem/texttype'
import { framesToTimecode, timecodeToFrames } from '@/core/utils/timeUtils'
import { useUnifiedKeyframeTransformControls } from '@/core/composables'
import { IconComponents } from '@/constants/iconComponents'
import { adjustKeyframesForDurationChange } from '@/core/utils/unifiedKeyframeUtils'
import { syncTimeRange } from '@/core/utils/timeRangeUtils'
import NumberInput from '@/components/base/NumberInput.vue'
import SliderInput from '@/components/base/SliderInput.vue'
import TimecodeInput from '@/components/base/TimecodeInput.vue'
import UnifiedKeyframeControls from './UnifiedKeyframeControls.vue'
import UnifiedTransformControls from './UnifiedTransformControls.vue'

interface Props {
  selectedTimelineItem: UnifiedTimelineItemData | null
  currentFrame: number
}

const props = defineProps<Props>()

const { t } = useAppI18n()
const unifiedStore = useUnifiedStore()

// 计算属性：获取当前选中文本片段的样式（类似 localText）
const localStyle = computed<TextStyleConfig>(() => {
  if (props.selectedTimelineItem && isTextTimelineItem(props.selectedTimelineItem)) {
    return { ...props.selectedTimelineItem.config.style }
  }
  // 返回默认样式
  return {
    fontSize: 48,
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 1.2,
    backgroundColor: '#000000',
  }
})

// 计算属性：背景颜色启用状态
const backgroundColorEnabled = computed(() => {
  return !!localStyle.value.backgroundColor
})

// 计算属性：阴影效果状态
const shadowEnabled = computed(() => {
  return !!localStyle.value.textShadow
})

const shadowColor = computed(() => {
  if (localStyle.value.textShadow) {
    const shadowMatch = localStyle.value.textShadow.match(
      /#[0-9a-fA-F]{6}|rgba?\([^)]+\)|[a-zA-Z]+$/,
    )
    return shadowMatch ? shadowMatch[0] : '#000000'
  }
  return '#000000'
})

const shadowOffsetX = computed(() => {
  if (localStyle.value.textShadow) {
    const shadowMatch = localStyle.value.textShadow.match(/(-?\d+)px/)
    return shadowMatch ? parseInt(shadowMatch[1]) : 2
  }
  return 2
})

const shadowOffsetY = computed(() => {
  if (localStyle.value.textShadow) {
    const shadowMatch = localStyle.value.textShadow.match(/(-?\d+)px\s+(-?\d+)px/)
    return shadowMatch ? parseInt(shadowMatch[2]) : 2
  }
  return 2
})

const shadowBlur = computed(() => {
  if (localStyle.value.textShadow) {
    // 匹配第三个px值（模糊值），格式：offsetX offsetY blur color
    const shadowMatch = localStyle.value.textShadow.match(/^(-?\d+)px\s+(-?\d+)px\s+(\d+)px/)
    return shadowMatch ? parseInt(shadowMatch[3]) : 4
  }
  return 4
})

// 计算属性：描边效果状态
const strokeEnabled = computed(() => {
  return !!localStyle.value.textStroke
})

const strokeColor = computed(() => {
  return localStyle.value.textStroke?.color || '#000000'
})

const strokeWidth = computed(() => {
  return localStyle.value.textStroke?.width || 1
})

// 计算属性：发光效果状态
const glowEnabled = computed(() => {
  return !!localStyle.value.textGlow
})

const glowColor = computed(() => {
  return localStyle.value.textGlow?.color || '#ffffff'
})

const glowBlur = computed(() => {
  return localStyle.value.textGlow?.blur || 10
})

const glowSpread = computed(() => {
  return localStyle.value.textGlow?.spread || 0
})

// 文本对齐选项
const textAlignOptions = [
  {
    value: 'left' as const,
    label: '左对齐',
  },
  {
    value: 'center' as const,
    label: '居中对齐',
  },
  {
    value: 'right' as const,
    label: '右对齐',
  },
]

// 关键帧动画和变换控制器
const {
  // 关键帧状态
  unifiedKeyframeButtonState,
  canOperateUnifiedKeyframes,
  hasUnifiedPreviousKeyframe,
  hasUnifiedNextKeyframe,

  // 变换操作状态
  canOperateTransforms,

  // 变换属性
  transformX,
  transformY,
  scaleX,
  scaleY,
  rotation,
  opacity,
  zIndex,
  proportionalScale,
  uniformScale,
  elementWidth,
  elementHeight,

  // 关键帧控制方法
  toggleUnifiedKeyframe,
  goToPreviousUnifiedKeyframe,
  goToNextUnifiedKeyframe,
  getUnifiedKeyframeTooltip,
  debugUnifiedKeyframes,

  // 变换更新方法
  updateTransform,

  // 缩放控制方法
  toggleProportionalScale,
  updateUniformScale,
  setScaleX,
  setScaleY,

  // 旋转和透明度控制方法
  setRotation,
  setOpacity,

  // 对齐控制方法
  alignHorizontal,
  alignVertical,
} = useUnifiedKeyframeTransformControls({
  selectedTimelineItem: computed(() => props.selectedTimelineItem),
  currentFrame: computed(() => props.currentFrame),
})

// 时间轴时长（帧数）
const timelineDurationFrames = computed(() => {
  if (!props.selectedTimelineItem) return 0
  const timeRange = props.selectedTimelineItem.timeRange
  return Math.round(timeRange.timelineEndTime - timeRange.timelineStartTime)
})


// 计算属性：获取当前选中文本片段的文本内容
const localText = computed(() => {
  if (props.selectedTimelineItem && isTextTimelineItem(props.selectedTimelineItem)) {
    return props.selectedTimelineItem.config.text
  }
  return ''
})

// 更新文本内容（类似于updateTargetDurationFromTimecode）
const updateTextContent = async (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  const textValue = target.value.trim()

  if (
    !props.selectedTimelineItem ||
    !isTextTimelineItem(props.selectedTimelineItem) ||
    !textValue
  ) {
    return
  }

  try {
    console.log('🔄 [UnifiedTextClipProperties] 更新文本内容:', textValue.substring(0, 20) + '...')

    // 使用历史记录操作更新文本内容
    await unifiedStore.updateTextContentWithHistory(
      props.selectedTimelineItem.id,
      textValue,
      {}, // 样式更新为空对象，只更新文本内容
    )

    console.log('✅ [UnifiedTextClipProperties] 文本内容更新成功')
  } catch (error) {
    console.error('❌ [UnifiedTextClipProperties] 更新文本内容失败:', error)
    unifiedStore.messageError(t('properties.errors.textContentUpdateFailed'))
  }
}

// 更新文本样式（接受样式字典参数）
const updateTextStyle = async (styleUpdates: Partial<TextStyleConfig> = {}) => {
  if (!props.selectedTimelineItem || !isTextTimelineItem(props.selectedTimelineItem)) {
    return
  }

  try {
    // 直接使用传入的样式更新
    const styleToUpdate = { ...styleUpdates }

    console.log('🎨 [UnifiedTextClipProperties] 更新文本样式:', styleToUpdate)

    // 使用历史记录操作更新文本样式
    await unifiedStore.updateTextStyleWithHistory(props.selectedTimelineItem.id, styleToUpdate)

    console.log('✅ [UnifiedTextClipProperties] 文本样式更新成功')
  } catch (error) {
    console.error('❌ [UnifiedTextClipProperties] 更新文本样式失败:', error)
    unifiedStore.messageError(t('properties.errors.textStyleUpdateFailed'))
  }
}
// 更新字体大小
const updateFontSize = (size: number) => {
  updateTextStyle({ fontSize: Math.max(12, Math.min(200, size)) })
}
// 更新文本对齐
const updateTextAlign = (event: Event) => {
  const align = (event.target as HTMLButtonElement).dataset.align as 'left' | 'center' | 'right'
  if (align) {
    updateTextStyle({ textAlign: align })
  }
}

// 切换背景颜色启用状态（接受 event）
const toggleBackgroundColor = (event?: Event) => {
  const newEnabled = !backgroundColorEnabled.value
  if (newEnabled) {
    // 如果启用，设置背景颜色
    updateTextStyle({ backgroundColor: localStyle.value.backgroundColor || '#000000' })
  } else {
    // 如果禁用，移除背景颜色
    updateTextStyle({ backgroundColor: undefined })
  }
}

// 字体系列变化处理（接受 event）
const handleFontFamilyChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const newFontFamily = target.value
  updateTextStyle({ fontFamily: newFontFamily })
}

// 字体粗重变化处理（接受 event）
const handleFontWeightChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const newFontWeight = target.value
  updateTextStyle({ fontWeight: newFontWeight })
}

// 字体样式变化处理（接受 event）
const handleFontStyleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const newFontStyle = target.value as 'normal' | 'italic'
  updateTextStyle({ fontStyle: newFontStyle })
}

// 文字颜色变化处理（接受 event）
const handleColorChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const newColor = target.value
  updateTextStyle({ color: newColor })
}

// 背景颜色变化处理（接受 event）
const handleBackgroundColorChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const newBackgroundColor = target.value
  updateTextStyle({ backgroundColor: newBackgroundColor })
}

// 阴影颜色变化处理（接受 event）
const handleShadowColorChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  updateShadowColor(target.value)
}

// 描边颜色变化处理（接受 event）
const handleStrokeColorChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  updateStrokeColor(target.value)
}

// 发光颜色变化处理（接受 event）
const handleGlowColorChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  updateGlowColor(target.value)
}

// ==================== 文本效果方法 ====================

// 阴影效果方法
const toggleShadow = (event?: Event) => {
  const currentEnabled = shadowEnabled.value
  if (currentEnabled) {
    // 如果当前启用，则禁用
    updateTextStyle({ textShadow: undefined })
  } else {
    // 如果当前禁用，则启用（使用默认参数）
    updateTextStyle({ textShadow: '2px 2px 4px #000000' })
  }
}

const updateShadowBlur = (blur: number) => {
  const clampedBlur = Math.max(0, Math.min(20, blur))

  if (shadowEnabled.value) {
    // 从当前 localStyle 获取其他参数
    const currentOffsetX = shadowOffsetX.value
    const currentOffsetY = shadowOffsetY.value
    const currentColor = shadowColor.value

    updateTextStyle({
      textShadow: `${currentOffsetX}px ${currentOffsetY}px ${clampedBlur}px ${currentColor}`,
    })
  }
}

const updateShadowOffsetX = (offsetX: number) => {
  const clampedOffsetX = Math.max(-20, Math.min(20, offsetX))

  if (shadowEnabled.value) {
    const currentOffsetY = shadowOffsetY.value
    const currentBlur = shadowBlur.value
    const currentColor = shadowColor.value

    updateTextStyle({
      textShadow: `${clampedOffsetX}px ${currentOffsetY}px ${currentBlur}px ${currentColor}`,
    })
  }
}

const updateShadowOffsetY = (offsetY: number) => {
  const clampedOffsetY = Math.max(-20, Math.min(20, offsetY))

  if (shadowEnabled.value) {
    const currentOffsetX = shadowOffsetX.value
    const currentBlur = shadowBlur.value
    const currentColor = shadowColor.value

    updateTextStyle({
      textShadow: `${currentOffsetX}px ${clampedOffsetY}px ${currentBlur}px ${currentColor}`,
    })
  }
}

const updateShadowColor = (color: string) => {
  if (shadowEnabled.value) {
    const currentOffsetX = shadowOffsetX.value
    const currentOffsetY = shadowOffsetY.value
    const currentBlur = shadowBlur.value

    updateTextStyle({
      textShadow: `${currentOffsetX}px ${currentOffsetY}px ${currentBlur}px ${color}`,
    })
  }
}

// 描边效果方法
const toggleStroke = (event?: Event) => {
  const currentEnabled = strokeEnabled.value
  if (currentEnabled) {
    // 如果当前启用，则禁用
    updateTextStyle({ textStroke: undefined })
  } else {
    // 如果当前禁用，则启用（使用默认参数）
    updateTextStyle({ textStroke: { width: 1, color: '#000000' } })
  }
}

const updateStrokeWidth = (width: number) => {
  const clampedWidth = Math.max(0, Math.min(10, width))

  if (strokeEnabled.value) {
    const currentColor = strokeColor.value

    updateTextStyle({
      textStroke: { width: clampedWidth, color: currentColor },
    })
  }
}

const updateStrokeColor = (color: string) => {
  if (strokeEnabled.value) {
    const currentWidth = strokeWidth.value

    updateTextStyle({
      textStroke: { width: currentWidth, color: color },
    })
  }
}

// 发光效果方法
const toggleGlow = (event?: Event) => {
  const currentEnabled = glowEnabled.value
  if (currentEnabled) {
    // 如果当前启用，则禁用
    updateTextStyle({ textGlow: undefined })
  } else {
    // 如果当前禁用，则启用（使用默认参数）
    updateTextStyle({ textGlow: { color: '#ffffff', blur: 10, spread: 0 } })
  }
}

const updateGlowBlur = (blur: number) => {
  const clampedBlur = Math.max(1, Math.min(30, blur))

  if (glowEnabled.value) {
    const currentColor = glowColor.value
    const currentSpread = glowSpread.value

    updateTextStyle({
      textGlow: { color: currentColor, blur: clampedBlur, spread: currentSpread },
    })
  }
}

const updateGlowSpread = (spread: number) => {
  const clampedSpread = Math.max(0, Math.min(20, spread))

  if (glowEnabled.value) {
    const currentColor = glowColor.value
    const currentBlur = glowBlur.value

    updateTextStyle({
      textGlow: { color: currentColor, blur: currentBlur, spread: clampedSpread },
    })
  }
}

const updateGlowColor = (color: string) => {
  if (glowEnabled.value) {
    const currentBlur = glowBlur.value
    const currentSpread = glowSpread.value

    updateTextStyle({
      textGlow: { color: color, blur: currentBlur, spread: currentSpread },
    })
  }
}

// 处理时间码错误
const handleTimecodeError = (errorMessage: string) => {
  unifiedStore.messageError(errorMessage)
}

// 更新目标时长（帧数版本）
const updateTargetDurationFrames = async (newDurationFrames: number) => {
  if (!props.selectedTimelineItem) {
    return
  }

  const alignedDurationFrames = Math.max(1, newDurationFrames) // 最少1帧
  const sprite = props.selectedTimelineItem.runtime.sprite!
  const timeRange = props.selectedTimelineItem.timeRange
  const oldDurationFrames = timeRange.timelineEndTime - timeRange.timelineStartTime // 计算旧时长
  const newTimelineEndTime = timeRange.timelineStartTime + alignedDurationFrames // 帧数相加，不需要转换

  // 🎯 关键帧位置调整：在更新timeRange之前调整关键帧位置
  if (
    props.selectedTimelineItem.animation &&
    props.selectedTimelineItem.animation.keyframes.length > 0
  ) {
    adjustKeyframesForDurationChange(
      props.selectedTimelineItem,
      oldDurationFrames,
      alignedDurationFrames,
    )
    console.log('🎬 [UnifiedTextClipProperties] Keyframes adjusted for duration change:', {
      oldDuration: oldDurationFrames,
      newDuration: alignedDurationFrames,
    })
  }

  // 更新sprite时间范围（文本使用ImageTimeRange格式）
  sprite.setTimeRange({
    timelineStartTime: timeRange.timelineStartTime,
    timelineEndTime: newTimelineEndTime,
  })

  // 更新timelineItem的timeRange（使用专用工具函数）
  if (props.selectedTimelineItem) {
    syncTimeRange(props.selectedTimelineItem)
  }

  // 如果有动画，需要重新设置WebAV动画时长
  if (
    props.selectedTimelineItem.animation &&
    props.selectedTimelineItem.animation.keyframes.length > 0
  ) {
    // 动画时长更新已迁移到 Bunny 组件，无需手动更新
    console.log(
      '🎬 [UnifiedTextClipProperties] Animation duration updated after clip duration change',
    )
  }

  console.log('✅ [UnifiedTextClipProperties] 帧数时长更新成功:', {
    inputFrames: newDurationFrames,
    alignedFrames: alignedDurationFrames,
    timecode: framesToTimecode(alignedDurationFrames),
  })
}
</script>

<style scoped>
.text-clip-properties {
  width: 100%;
}

/* 文本内容输入框 */
.text-content-input {
  width: 100%;
  min-height: 60px;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  resize: vertical;
  transition: border-color 0.2s ease;
}

.text-content-input:focus {
  outline: none;
  border-color: var(--color-border-focus);
  background: var(--color-bg-primary);
}

.text-content-input::placeholder {
  color: var(--color-text-hint);
  font-style: italic;
}


/* 字体控制样式 */
.font-controls {
  display: flex;
  align-items: center;
  flex: 1;
}

.font-family-select {
  width: 100%;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.font-family-select:focus {
  outline: none;
  border-color: var(--color-border-focus);
}

/* 字体大小控制 */
.font-size-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
}

/* 字体样式控制 */
.font-style-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
}

.font-weight-select,
.font-style-select {
  flex: 1;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.font-weight-select:focus,
.font-style-select:focus {
  outline: none;
  border-color: var(--color-border-focus);
}

/* 颜色控制样式 */
.color-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
}

.color-picker {
  width: 40px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--border-radius-small);
  cursor: pointer;
  background: transparent;
  transition: border-color 0.2s ease;
}

.color-picker:focus {
  outline: none;
  border-color: var(--color-border-focus);
}

/* 背景颜色控制样式 */
.background-color-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  cursor: pointer;
}

.background-color-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.color-picker:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 文本对齐控制 */
.text-align-controls {
  display: flex;
  gap: var(--spacing-xs);
}

.align-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--border-radius-small);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.align-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-focus);
  color: var(--color-text-primary);
}

.align-btn.active {
  background: var(--color-accent-primary);
  border-color: var(--color-accent-primary);
  color: var(--color-bg-primary);
}

.align-btn.active:hover {
  background: var(--color-accent-secondary);
  border-color: var(--color-accent-secondary);
}

/* 文本效果样式 */
.shadow-controls,
.stroke-controls,
.glow-controls {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  flex: 1;
}

.shadow-settings,
.stroke-settings,
.glow-settings {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  background: var(--color-bg-tertiary);
  border-radius: var(--border-radius-small);
  border: 1px solid var(--color-border-secondary);
}

.shadow-setting-row,
.stroke-setting-row,
.glow-setting-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.setting-label {
  min-width: 40px;
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: right;
}

.effect-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.color-picker.small {
  width: 32px;
  height: 24px;
}

.effect-slider {
  flex: 1;
  min-width: 80px;
}
</style>
