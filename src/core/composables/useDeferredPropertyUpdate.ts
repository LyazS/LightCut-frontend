/**
 * 延迟属性更新工具
 * 用于滑块拖动优化：拖动过程中直接修改属性（不记录历史），拖动结束时统一记录历史
 */

import { ref, type Ref } from 'vue'
import type { UnifiedTimelineItemData } from '@/core/timelineitem'
import { TimelineItemQueries } from '@/core/timelineitem/queries'
import {
  createKeyframe,
  findKeyframeAtFrame,
  sortKeyframes,
  getKeyframeButtonState,
} from '@/core/utils/unifiedKeyframeUtils'
import type { AnimateKeyframe } from '@/core/timelineitem/bunnytype'
import type { MediaType } from '@/core/mediaitem'
import type { KeyframeButtonState } from '@/core/timelineitem/animationtypes'

interface DragState {
  isDragging: boolean
  initialValues: Map<string, any> // property -> initial value
  pendingUpdates: Map<string, any> // property -> current value
  createdKeyframe: AnimateKeyframe<MediaType> | null // 关键帧之间拖动时创建的关键帧
  initialButtonState: KeyframeButtonState | null // 拖动开始时的动画状态（用于判断是否需要删除临时关键帧）
}

interface DeferredUpdateOptions {
  selectedTimelineItem: Ref<UnifiedTimelineItemData | null>
  currentFrame: Ref<number>
}

/**
 * 延迟属性更新 Composable
 *
 * 使用场景：滑块拖动优化
 * - 拖动开始（第一次 @input）：记录初始值，必要时创建关键帧
 * - 拖动中（后续 @input）：直接修改属性，不记录历史
 * - 拖动结束（@change）：创建历史记录
 */
export function useDeferredPropertyUpdate(options: DeferredUpdateOptions) {
  const { selectedTimelineItem, currentFrame } = options

  const dragState = ref<DragState>({
    isDragging: false,
    initialValues: new Map(),
    pendingUpdates: new Map(),
    createdKeyframe: null,
    initialButtonState: null,
  })

  /**
   * 开始拖拽 - 由第一次 @input 触发
   * @param properties 属性-初始值对象（如 { width: 100, height: 200 } 或 { rotation: 45 }）
   *
   * 使用示例：
   * - 单个属性：startDrag({ rotation: config.rotation })
   * - 多个属性：startDrag({ width: config.width, height: config.height })
   */
  const startDrag = (properties: Record<string, any>) => {
    const item = selectedTimelineItem.value
    if (!item) return

    const buttonState = getKeyframeButtonState(item, currentFrame.value)
    dragState.value.isDragging = true
    dragState.value.initialButtonState = buttonState

    // 记录所有属性的初始值
    for (const [prop, value] of Object.entries(properties)) {
      dragState.value.initialValues.set(prop, value)
    }

    console.log('🎯 [Deferred Update] 拖拽开始:', {
      properties: Object.keys(properties),
      buttonState,
    })

    // 如果在关键帧之间，立即创建新关键帧（使用传入的初始值）
    if (buttonState === 'between-keyframes') {
      const keyframe = createKeyframe(item, currentFrame.value)
      ;(item.animation as any)!.keyframes.push(keyframe)
      sortKeyframes(item)
      dragState.value.createdKeyframe = keyframe

      console.log('🎯 [Deferred Update] 创建临时关键帧:', {
        keyframePosition: keyframe.cachedFrame,
        propertiesCount: dragState.value.initialValues.size,
      })
    }
  }

  /**
   * 拖拽中更新 - 由后续 @input 触发
   * 直接修改关键帧或 config（无历史记录）
   * @param property 属性名
   * @param value 新值
   */
  const updateDuringDrag = (property: string, value: any) => {
    const item = selectedTimelineItem.value
    if (!item || !dragState.value.isDragging) return

    const buttonState = getKeyframeButtonState(item, currentFrame.value)

    if (buttonState === 'none') {
      // 无动画：直接修改 config
      ;(item.config as any)[property] = value
    } else if (buttonState === 'on-keyframe') {
      // 在关键帧上：修改关键帧的值
      const keyframe = findKeyframeAtFrame(item, currentFrame.value)
      if (keyframe && property in keyframe.properties) {
        ;(keyframe.properties as any)[property] = value
      }
    } else if (buttonState === 'between-keyframes' && dragState.value.createdKeyframe) {
      // 关键帧之间：修改新创建的关键帧
      if (property in dragState.value.createdKeyframe.properties) {
        ;(dragState.value.createdKeyframe.properties as any)[property] = value
      }
    }

    // 记录当前值用于提交
    dragState.value.pendingUpdates.set(property, value)

    console.log('🎯 [Deferred Update] 拖拽中更新:', {
      property,
      value,
      buttonState,
    })
  }

  /**
   * 拖拽结束 - 由 @change 触发
   * 提交历史记录并清理状态
   * @param onCommit 提交回调，接收所有属性的更新对象
   */
  const commitDrag = async (onCommit: (updates: Record<string, any>) => Promise<void>) => {
    console.log('🔍 [Deferred Update] commitDrag 被调用')
    console.log('  - isDragging:', dragState.value.isDragging)
    console.log('  - createdKeyframe:', dragState.value.createdKeyframe)
    console.log('  - initialButtonState:', dragState.value.initialButtonState)
    console.log('  - pendingUpdates:', dragState.value.pendingUpdates)

    if (!dragState.value.isDragging) return

    const item = selectedTimelineItem.value
    if (!item) return

    // 使用保存的初始动画状态（而不是重新获取）
    const buttonState = dragState.value.initialButtonState
    console.log('📊 [Deferred Update] 使用初始动画状态:', buttonState)

    // 保存最终值
    const updates: Record<string, any> = {}
    for (const [property, value] of dragState.value.pendingUpdates) {
      updates[property] = value
    }

    // 🔧 关键修复：在创建历史记录之前，先恢复 config/关键帧 到初始值
    // 这样 UpdatePropertyCommand 创建的 before 快照才会是正确的初始值
    if (buttonState === 'none') {
      // 无动画：恢复 config 到初始值
      for (const [property, initialValue] of dragState.value.initialValues) {
        ;(item.config as any)[property] = initialValue
      }
    } else if (buttonState === 'on-keyframe') {
      // 在关键帧上：恢复关键帧属性到初始值
      const keyframe = findKeyframeAtFrame(item, currentFrame.value)
      if (keyframe) {
        for (const [property, initialValue] of dragState.value.initialValues) {
          if (property in keyframe.properties) {
            ;(keyframe.properties as any)[property] = initialValue
          }
        }
      }
    } else if (buttonState === 'between-keyframes' && dragState.value.createdKeyframe) {
      console.log('🎯 [Deferred Update] 准备删除临时关键帧...')
      // 🔧 关键帧之间：删除临时创建的关键帧，恢复到拖动前的状态
      const keyframes = (item.animation as any).keyframes
      const index = keyframes.indexOf(dragState.value.createdKeyframe)
      console.log('  - 关键帧索引:', index)
      console.log('  - 删除前关键帧数:', keyframes.length)
      if (index !== -1) {
        keyframes.splice(index, 1)
        console.log('🗑️ [Deferred Update] 删除临时关键帧，剩余关键帧数:', keyframes.length)
      } else {
        console.log('❌ [Deferred Update] 未找到临时关键帧！')
      }

      // 验证删除后的状态
      const stateAfterDelete = getKeyframeButtonState(item, currentFrame.value)
      console.log('📊 [Deferred Update] 删除后状态:', stateAfterDelete)
    } else {
      console.log('⚠️ [Deferred Update] 未知状态，createdKeyframe:', dragState.value.createdKeyframe)
    }

    // 重置拖拽状态
    dragState.value.isDragging = false
    dragState.value.createdKeyframe = null
    dragState.value.initialButtonState = null
    dragState.value.initialValues.clear()
    dragState.value.pendingUpdates.clear()

    // 提交历史记录（一次性提交所有更新，创建一条历史记录）
    await onCommit(updates)

    console.log('✅ [Deferred Update] 拖拽结束，已提交历史记录:', updates)
  }

  return {
    dragState,
    startDrag,
    updateDuringDrag,
    commitDrag,
  }
}
