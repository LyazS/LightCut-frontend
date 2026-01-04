<template>
  <div class="property-section">
    <h4>{{ t('properties.keyframes.keyframeAnimation') }}</h4>

    <!-- 关键帧控制按钮组 - 一行显示 -->
    <div class="keyframe-controls-row">
      <!-- 上一个关键帧 -->
      <HoverButton
        @click="$emit('go-to-previous')"
        :disabled="!hasPreviousKeyframe || !canOperateKeyframes"
        class="keyframe-nav-btn"
        :title="t('properties.keyframes.previousKeyframe')"
      >
        <template #icon>
          <component :is="IconComponents.PREV_KEYFRAME" size="16px" />
        </template>
        <span>{{ t('properties.keyframes.goToPrevious') }}</span>
      </HoverButton>

      <!-- 主关键帧按钮 -->
      <HoverButton
        :class="`unified-keyframe-toggle ${keyframeButtonState === 'none' ? 'state-none' : ''} ${keyframeButtonState === 'on-keyframe' ? 'state-on-keyframe' : ''} ${keyframeButtonState === 'between-keyframes' ? 'state-between-keyframes' : ''}`"
        @click="$emit('toggle-keyframe')"
        :disabled="!canOperateKeyframes"
        :title="keyframeTooltip"
      >
        <template #icon>
          <component :is="IconComponents.KEYFRAME" size="16px" />
        </template>
        <span>{{ t('properties.keyframes.keyframes') }}</span>
      </HoverButton>

      <!-- 下一个关键帧 -->
      <HoverButton
        @click="$emit('go-to-next')"
        :disabled="!hasNextKeyframe || !canOperateKeyframes"
        class="keyframe-nav-btn"
        :title="t('properties.keyframes.nextKeyframe')"
        icon-position="after"
      >
        <span>{{ t('properties.keyframes.goToNext') }}</span>
        <template #icon>
          <component :is="IconComponents.NEXT_KEYFRAME" size="16px" />
        </template>
      </HoverButton>

      <!-- 调试按钮 - 开发时使用 -->
      <!-- <HoverButton
        v-if="showDebugButton"
        @click="$emit('debug-keyframes')"
        class="debug-btn"
        :title="t('properties.keyframes.debugKeyframes')"
      >
        <span>{{ t('properties.keyframes.debugKeyframes') }}</span>
      </HoverButton> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppI18n } from '@/core/composables/useI18n'
import { IconComponents } from '@/constants/iconComponents'
import HoverButton from '@/components/base/HoverButton.vue'

const { t } = useAppI18n()

interface Props {
  keyframeButtonState: 'none' | 'on-keyframe' | 'between-keyframes'
  canOperateKeyframes: boolean
  hasPreviousKeyframe: boolean
  hasNextKeyframe: boolean
  keyframeTooltip: string
  showDebugButton?: boolean
}

interface Emits {
  (e: 'toggle-keyframe'): void
  (e: 'go-to-previous'): void
  (e: 'go-to-next'): void
  (e: 'debug-keyframes'): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped>
.keyframe-controls-row {
  display: flex;
  gap: 6px;
  align-items: stretch;
  justify-content: space-between;
  flex-wrap: nowrap;
}

/* 主关键帧按钮 */
.keyframe-controls-row .unified-keyframe-toggle {
  flex: 1 1 auto;
  min-width: 90px;
  max-width: 120px;
  font-size: 14px;
  height: 36px;
}

.unified-keyframe-toggle {
  display: flex;
  align-items: center;
  gap: 0px;
  padding: 0px 12px;
  border: none;
  border-radius: 4px;
  background: var(--color-bg-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-primary);
  height: 36px;
  position: relative;
}

.unified-keyframe-toggle:hover:not(.hover-btn--disabled) {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-hover);
  transform: translateY(-1px);
}

/* 状态样式 */
.unified-keyframe-toggle.state-none {
  color: var(--color-text-primary);
}

.unified-keyframe-toggle.state-none:hover {
  border-color: var(--color-border-hover);
  background: var(--color-bg-tertiary);
}

.unified-keyframe-toggle.state-on-keyframe {
  color: var(--color-text-primary);
  background: rgba(64, 158, 255, 0.2);
  border-color: #409eff;
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.4);
}

.unified-keyframe-toggle.state-on-keyframe svg {
  color: #409eff;
}

.unified-keyframe-toggle.state-on-keyframe:hover {
  background: rgba(64, 158, 255, 0.3);
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.6);
}

.unified-keyframe-toggle.state-between-keyframes {
  color: #ffd700;
  background: rgba(255, 215, 0, 0.15);
  border-color: #ffd700;
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.3);
}

.unified-keyframe-toggle.state-between-keyframes:hover {
  background: rgba(255, 215, 0, 0.25);
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
}

/* 禁用状态样式 */
.unified-keyframe-toggle.hover-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  border-color: var(--color-border-secondary);
  box-shadow: none;
}

.unified-keyframe-toggle.hover-btn--disabled:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-secondary);
  transform: none;
  box-shadow: none;
}

/* 导航和调试按钮 */
.keyframe-controls-row .keyframe-nav-btn,
.keyframe-controls-row .debug-btn {
  flex: 0 0 auto;
  padding: 8px 10px;
  font-size: 11px;
  min-width: 55px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: var(--color-bg-secondary);
  border: none;
  border-radius: 4px;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.keyframe-controls-row .keyframe-nav-btn:hover:not(.hover-btn--disabled),
.keyframe-controls-row .debug-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-hover);
  transform: translateY(-1px);
}

.keyframe-controls-row .keyframe-nav-btn.hover-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
}

.keyframe-controls-row .keyframe-nav-btn span,
.keyframe-controls-row .debug-btn span,
.keyframe-controls-row .unified-keyframe-toggle span {
  font-size: 10px;
  white-space: nowrap;
}

/* 响应式调整 */
@media (max-width: 400px) {
  .keyframe-controls-row {
    flex-wrap: wrap;
    gap: 4px;
  }

  .keyframe-controls-row .unified-keyframe-toggle {
    flex: 1 1 100%;
    margin-bottom: 4px;
  }

  .keyframe-controls-row .keyframe-nav-btn,
  .keyframe-controls-row .debug-btn {
    flex: 1 1 calc(33.333% - 3px);
    min-width: 0;
  }
}
</style>
