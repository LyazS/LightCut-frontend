/**
 * 关键帧动画和位置大小变换统一控制器（新架构适配版）
 * 提供关键帧动画、位置、大小、旋转、透明度等变换属性的统一管理
 */

import { computed, type Ref } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { uiDegreesToWebAVRadians, webAVRadiansToUIDegrees } from '@/core/utils/rotationTransform'
import { useUnifiedKeyframeUI } from '@/core/composables/useUnifiedKeyframeUI'
import type { UnifiedTimelineItemData } from '@/core/timelineitem'
import { TimelineItemQueries } from '@/core/timelineitem/queries'
import { isPlayheadInTimelineItem } from '@/core/utils/timelineSearchUtils'
import { debugKeyframes } from '@/core/utils/unifiedKeyframeUtils'

interface UnifiedKeyframeTransformControlsOptions {
  selectedTimelineItem: Ref<UnifiedTimelineItemData | null>
  currentFrame: Ref<number>
}

/**
 * 关键帧动画和变换控制器（新架构版本）
 */
export function useUnifiedKeyframeTransformControls(
  options: UnifiedKeyframeTransformControlsOptions,
) {
  const { selectedTimelineItem, currentFrame } = options
  const unifiedStore = useUnifiedStore()

  // 统一关键帧UI管理
  const {
    buttonState: unifiedKeyframeButtonState,
    toggleKeyframe: toggleUnifiedKeyframe,
    handlePropertyChange: handleUnifiedPropertyChange,
    updateUnifiedPropertyBatch,
    goToPreviousKeyframe: goToPreviousUnifiedKeyframe,
    goToNextKeyframe: goToNextUnifiedKeyframe,
    hasPreviousKeyframe: hasUnifiedPreviousKeyframe,
    hasNextKeyframe: hasUnifiedNextKeyframe,
    canOperateKeyframes: canOperateUnifiedKeyframes,
  } = useUnifiedKeyframeUI(selectedTimelineItem, currentFrame)

  // 添加播放头检测计算属性（用于变换控制UI状态）
  const canOperateTransforms = computed(() => {
    if (!selectedTimelineItem.value) return false
    return isPlayheadInTimelineItem(selectedTimelineItem.value, currentFrame.value)
  })

  // ==================== 变换属性计算 ====================

  // 变换属性 - 基于TimelineItem的响应式计算属性（类型安全版本）
  const transformX = computed(() => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return 0
    // hasVisualProperties 类型守卫确保了 config 具有视觉属性
    return selectedTimelineItem.value.config.x
  })

  const transformY = computed(() => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return 0
    // hasVisualProperties 类型守卫确保了 config 具有视觉属性
    return selectedTimelineItem.value.config.y
  })

  const scaleX = computed(() => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return 1

    // hasVisualProperties 类型守卫确保了 config 具有视觉属性
    const config = selectedTimelineItem.value.config
    // 从 mediaItem 的 bunny 对象中获取原始尺寸
    const mediaItem = unifiedStore.getMediaItem(selectedTimelineItem.value.mediaItemId)
    const originalWidth = mediaItem?.runtime.bunny?.originalWidth ?? config.width
    return config.width / originalWidth
  })

  const scaleY = computed(() => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return 1

    // hasVisualProperties 类型守卫确保了 config 具有视觉属性
    const config = selectedTimelineItem.value.config
    // 从 mediaItem 的 bunny 对象中获取原始尺寸
    const mediaItem = unifiedStore.getMediaItem(selectedTimelineItem.value.mediaItemId)
    const originalHeight = mediaItem?.runtime.bunny?.originalHeight ?? config.height
    return config.height / originalHeight
  })

  const rotation = computed(() => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return 0
    // hasVisualProperties 类型守卫确保了 config 具有视觉属性
    const radians = selectedTimelineItem.value.config.rotation
    return webAVRadiansToUIDegrees(radians)
  })

  const opacity = computed(() => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return 1
    // hasVisualProperties 类型守卫确保了 config 具有视觉属性
    return selectedTimelineItem.value.config.opacity
  })


  // 等比缩放相关（每个clip独立状态）
  const proportionalScale = computed({
    get: () => {
      if (
        !selectedTimelineItem.value ||
        !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
      )
        return true
      // hasVisualProperties 类型守卫确保了 config 具有视觉属性
      return selectedTimelineItem.value.config.proportionalScale
    },
    set: (value) => {
      if (
        !selectedTimelineItem.value ||
        !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
      )
        return
      // hasVisualProperties 类型守卫确保了 config 具有视觉属性
      selectedTimelineItem.value.config.proportionalScale = value
    },
  })

  // 等比缩放相关
  const uniformScale = computed(() => scaleX.value) // 使用X缩放值作为统一缩放值

  // 元素原始尺寸获取
  const elementWidth = computed(() => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return 0
    // 从 mediaItem 的 bunny 对象中获取原始尺寸
    const mediaItem = unifiedStore.getMediaItem(selectedTimelineItem.value.mediaItemId)
    return mediaItem?.runtime.bunny?.originalWidth ?? 0
  })

  const elementHeight = computed(() => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return 0
    // 从 mediaItem 的 bunny 对象中获取原始尺寸
    const mediaItem = unifiedStore.getMediaItem(selectedTimelineItem.value.mediaItemId)
    return mediaItem?.runtime.bunny?.originalHeight ?? 0
  })

  // ==================== 关键帧控制方法 ====================

  /**
   * 获取统一关键帧按钮的提示文本
   */
  const getUnifiedKeyframeTooltip = () => {
    // 如果播放头不在clip时间范围内，显示相应提示
    if (!canOperateUnifiedKeyframes.value) {
      return '播放头不在当前clip时间范围内，无法操作关键帧'
    }

    switch (unifiedKeyframeButtonState.value) {
      case 'none':
        return '点击创建关键帧动画'
      case 'on-keyframe':
        return '当前在关键帧位置，点击删除关键帧'
      case 'between-keyframes':
        return '点击在当前位置创建关键帧'
      default:
        return '关键帧控制'
    }
  }

  /**
   * 统一关键帧调试信息
   */
  const debugUnifiedKeyframes = async () => {
    if (!selectedTimelineItem.value) {
      console.log('🎬 [Unified Debug] 没有选中的时间轴项目')
      return
    }

    try {
      debugKeyframes(selectedTimelineItem.value)
    } catch (error) {
      console.error('🎬 [Unified Debug] 调试失败:', error)
    }
  }

  // ==================== 变换更新方法 ====================

  /**
   * 更新变换属性 - 使用带历史记录的方法
   */
  const updateTransform = async (transform?: {
    x?: number
    y?: number
    width?: number
    height?: number
    rotation?: number
    opacity?: number
  }) => {
    if (!selectedTimelineItem.value) return

    // 如果没有提供transform参数，使用当前的响应式值（类型安全版本）
    const finalTransform = transform || {
      x: transformX.value,
      y: transformY.value,
      width: TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
        ? selectedTimelineItem.value.config.width
        : 0,
      height: TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
        ? selectedTimelineItem.value.config.height
        : 0,
      rotation: rotation.value,
      opacity: opacity.value,
    }

    // 统一关键帧系统处理 - 根据当前状态自动处理关键帧创建/更新
    // 注意：updateUnifiedProperty 已经包含了实时渲染更新，所以不需要再调用 updateTimelineItemTransformWithHistory

    // 🎯 特殊处理：如果同时设置了width和height，使用批量更新避免重复位置计算
    if (finalTransform.width !== undefined && finalTransform.height !== undefined) {
      await updateUnifiedPropertyBatch({
        width: finalTransform.width,
        height: finalTransform.height,
      })
    } else {
      // 单独处理尺寸属性
      if (finalTransform.width !== undefined) {
        await updateUnifiedProperty('width', finalTransform.width)
      }
      if (finalTransform.height !== undefined) {
        await updateUnifiedProperty('height', finalTransform.height)
      }
    }

    // 处理其他属性
    if (finalTransform.x !== undefined) {
      await updateUnifiedProperty('x', finalTransform.x)
    }
    if (finalTransform.y !== undefined) {
      await updateUnifiedProperty('y', finalTransform.y)
    }
    if (finalTransform.rotation !== undefined) {
      await updateUnifiedProperty('rotation', finalTransform.rotation)
    }
    if (finalTransform.opacity !== undefined) {
      await updateUnifiedProperty('opacity', finalTransform.opacity)
    }


    console.log('✅ 统一关键帧变换属性更新完成')
  }

  /**
   * 更新属性值（统一关键帧版本）
   * 根据当前状态自动处理关键帧创建，同时确保实时渲染更新
   */
  const updateUnifiedProperty = async (property: string, value: any) => {
    if (!selectedTimelineItem.value) return

    try {
      // 使用统一关键帧处理逻辑（已经包含了正确的WebAV更新流程）
      await handleUnifiedPropertyChange(property, value)

      console.log('🎬 [Unified Property] Property updated via unified keyframe system:', {
        property,
        value,
        buttonState: unifiedKeyframeButtonState.value,
      })
    } catch (error) {
      console.error('🎬 [Unified Property] Failed to update property:', error)
    }
  }

  // ==================== 缩放控制方法 ====================

  /**
   * 切换等比缩放
   */
  const toggleProportionalScale = () => {
    // 先切换状态
    proportionalScale.value = !proportionalScale.value

    // 如果刚刚开启等比缩放，使用当前X缩放值作为统一缩放值，同时更新Y缩放
    if (
      proportionalScale.value &&
      selectedTimelineItem.value &&
      TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    ) {
      // hasVisualProperties 类型守卫确保了 config 具有视觉属性
      const config = selectedTimelineItem.value.config
      // 从 mediaItem 的 bunny 对象中获取原始尺寸
      const mediaItem = unifiedStore.getMediaItem(selectedTimelineItem.value.mediaItemId)
      const originalWidth = mediaItem?.runtime.bunny?.originalWidth ?? config.width
      const originalHeight = mediaItem?.runtime.bunny?.originalHeight ?? config.height
      const newSize = {
        width: originalWidth * scaleX.value,
        height: originalHeight * scaleX.value, // 使用X缩放值保持等比
      }
      updateTransform({ width: newSize.width, height: newSize.height })
    }
  }

  /**
   * 更新统一缩放
   */
  const updateUniformScale = (newScale: number) => {
    if (
      proportionalScale.value &&
      selectedTimelineItem.value &&
      TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    ) {
      // hasVisualProperties 类型守卫确保了 config 具有视觉属性
      const config = selectedTimelineItem.value.config
      // 从 mediaItem 的 bunny 对象中获取原始尺寸
      const mediaItem = unifiedStore.getMediaItem(selectedTimelineItem.value.mediaItemId)
      const originalWidth = mediaItem?.runtime.bunny?.originalWidth ?? config.width
      const originalHeight = mediaItem?.runtime.bunny?.originalHeight ?? config.height
      const newSize = {
        width: originalWidth * newScale,
        height: originalHeight * newScale,
      }
      updateTransform({ width: newSize.width, height: newSize.height })
    }
  }

  /**
   * 设置X缩放绝对值的方法
   */
  const setScaleX = (value: number) => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return

    // hasVisualProperties 类型守卫确保了 config 具有视觉属性
    const config = selectedTimelineItem.value.config
    // 从 mediaItem 的 bunny 对象中获取原始尺寸
    const mediaItem = unifiedStore.getMediaItem(selectedTimelineItem.value.mediaItemId)
    const originalWidth = mediaItem?.runtime.bunny?.originalWidth ?? config.width
    const newScaleX = Math.max(0.01, Math.min(5, value))
    const newSize = {
      width: originalWidth * newScaleX,
      height: config.height, // 保持Y尺寸不变
    }
    updateTransform({ width: newSize.width, height: newSize.height })
  }

  /**
   * 设置Y缩放绝对值的方法
   */
  const setScaleY = (value: number) => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return

    // hasVisualProperties 类型守卫确保了 config 具有视觉属性
    const config = selectedTimelineItem.value.config
    // 从 mediaItem 的 bunny 对象中获取原始尺寸
    const mediaItem = unifiedStore.getMediaItem(selectedTimelineItem.value.mediaItemId)
    const originalHeight = mediaItem?.runtime.bunny?.originalHeight ?? config.height
    const newScaleY = Math.max(0.01, Math.min(5, value))
    const newSize = {
      width: config.width, // 保持X尺寸不变
      height: originalHeight * newScaleY,
    }
    updateTransform({ width: newSize.width, height: newSize.height })
  }

  /**
   * 设置旋转绝对值的方法（输入角度，转换为弧度）
   */
  const setRotation = (value: number) => {
    const newRotationRadians = uiDegreesToWebAVRadians(value)
    updateTransform({ rotation: newRotationRadians })
  }

  /**
   * 设置透明度绝对值的方法
   */
  const setOpacity = (value: number) => {
    const newOpacity = Math.max(0, Math.min(1, value))
    updateTransform({ opacity: newOpacity })
  }

  // ==================== 对齐控制方法 ====================

  /**
   * 实现对齐功能（基于项目坐标系：中心为原点）
   */
  const alignHorizontal = (alignment: 'left' | 'center' | 'right') => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return

    const config = selectedTimelineItem.value.config
    const canvasWidth = unifiedStore.videoResolution.width
    const elementWidth = config.width

    try {
      let newProjectX = 0
      switch (alignment) {
        case 'left':
          // 左对齐：元素左边缘贴画布左边缘
          newProjectX = -canvasWidth / 2 + elementWidth / 2
          break
        case 'center':
          // 居中：元素中心对齐画布中心
          newProjectX = 0
          break
        case 'right':
          // 右对齐：元素右边缘贴画布右边缘
          newProjectX = canvasWidth / 2 - elementWidth / 2
          break
      }

      updateTransform({ x: Math.round(newProjectX) })

      console.log('✅ 水平对齐完成:', alignment, '项目坐标X:', Math.round(newProjectX))
    } catch (error) {
      console.error('水平对齐失败:', error)
    }
  }

  const alignVertical = (alignment: 'top' | 'middle' | 'bottom') => {
    if (
      !selectedTimelineItem.value ||
      !TimelineItemQueries.hasVisualProperties(selectedTimelineItem.value)
    )
      return

    const config = selectedTimelineItem.value.config
    const canvasHeight = unifiedStore.videoResolution.height
    const elementHeight = config.height

    try {
      let newProjectY = 0
      switch (alignment) {
        case 'top':
          // 顶对齐：元素上边缘贴画布上边缘
          newProjectY = -canvasHeight / 2 + elementHeight / 2
          break
        case 'middle':
          // 居中：元素中心对齐画布中心
          newProjectY = 0
          break
        case 'bottom':
          // 底对齐：元素下边缘贴画布下边缘
          newProjectY = canvasHeight / 2 - elementHeight / 2
          break
      }

      updateTransform({ y: Math.round(newProjectY) })

      console.log('✅ 垂直对齐完成:', alignment, '项目坐标Y:', Math.round(newProjectY))
    } catch (error) {
      console.error('垂直对齐失败:', error)
    }
  }

  return {
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
    updateUnifiedProperty,
    updateUnifiedPropertyBatch,

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
  }
}
