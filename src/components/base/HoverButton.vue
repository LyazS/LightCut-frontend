<template>
  <button :class="buttonClasses" :disabled="disabled" :title="title" @click="handleClick">
    <!-- 图标在前的情况 -->
    <template v-if="props.iconPosition === 'before'">
      <!-- 图标插槽 -->
      <slot name="icon" v-if="$slots.icon" />

      <!-- 默认内容插槽 -->
      <slot />
    </template>

    <!-- 图标在后的情况 -->
    <template v-else>
      <!-- 默认内容插槽 -->
      <slot />

      <!-- 图标插槽 -->
      <slot name="icon" v-if="$slots.icon" />
    </template>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** 按钮变体 */
  variant?: 'default' | 'primary' | 'small' | 'large'
  /** 是否禁用 */
  disabled?: boolean
  /** 悬停提示 */
  title?: string
  /** 额外的CSS类 */
  class?: string
  /** 图标位置 - 'before' 图标在文字前，'after' 图标在文字后 */
  iconPosition?: 'before' | 'after'
}

interface Emits {
  (e: 'click', event: MouseEvent): void
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  disabled: false,
  iconPosition: 'before',
})

const emit = defineEmits<Emits>()

// 计算按钮样式类
const buttonClasses = computed(() => [
  'hover-btn',
  `hover-btn--${props.variant}`,
  props.class,
  {
    'hover-btn--disabled': props.disabled,
  },
])

// 处理点击事件
const handleClick = (event: MouseEvent) => {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<style scoped>
/* 基础按钮样式 - 基于播放控制按钮 */
.hover-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: var(--spacing-xs);
  border-radius: var(--border-radius-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  transition: all var(--transition-fast);
  flex-shrink: 0;
  font-size: var(--font-size-base);
  font-family: inherit;
  white-space: nowrap;
}

.hover-btn:hover:not(.hover-btn--disabled) {
  background-color: var(--color-bg-quaternary);
  color: var(--color-text-primary);
}

.hover-btn:active:not(.hover-btn--disabled) {
  transform: translateY(1px);
}

/* 主要变体 - 更大的内边距 */
.hover-btn--primary {
  padding: var(--spacing-md);
}

/* 大型变体 */
.hover-btn--large {
  padding: var(--spacing-md) var(--spacing-lg);
  font-size: calc(var(--font-size-base) * 1.1);
  min-width: 80px;
}

/* 小尺寸变体 */
.hover-btn--small {
  padding: var(--spacing-xs);
  font-size: var(--font-size-sm);
  min-width: 24px;
  height: 24px;
}

/* 禁用状态 */
.hover-btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 确保图标和文本对齐 */
.hover-btn :deep(svg) {
  flex-shrink: 0;
}
</style>
