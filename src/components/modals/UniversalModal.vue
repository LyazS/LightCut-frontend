<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="show"
        class="modal-overlay"
        :class="overlayClass"
        :style="overlayStyle"
        @click="handleOverlayClick"
      >
        <div class="modal-container" :class="containerClass" :style="containerStyle" @click.stop>
          <!-- 头部区域 -->
          <div v-if="showHeader" class="modal-header" :class="headerClass">
            <slot name="header">
              <h3 v-if="title" class="modal-title">{{ title }}</h3>
              <div v-if="showClose" class="modal-header-actions">
                <slot name="closeIcon">
                  <button
                    class="modal-close-btn"
                    :class="closeBtnClass"
                    @click="handleClose"
                  >
                    <component :is="IconComponents.CLOSE" size="16px" />
                  </button>
                </slot>
              </div>
            </slot>
          </div>

          <!-- 内容区域 -->
          <div class="modal-content" :class="contentClass">
            <slot>
              <div class="modal-body">
                <slot name="body"></slot>
              </div>
            </slot>
          </div>

          <!-- 底部区域 -->
          <div v-if="showFooter" class="modal-footer" :class="footerClass">
            <slot name="footer">
              <div class="modal-actions">
                <slot name="actions">
                  <HoverButton
                    v-if="showCancel"
                    variant="large"
                    @click="handleCancel"
                    :disabled="loading"
                  >
                    {{ props.cancelText }}
                  </HoverButton>
                  <HoverButton
                    v-if="showConfirm"
                    variant="large"
                    @click="handleConfirm"
                    :disabled="confirmDisabled || loading"
                    :loading="loading"
                  >
                    {{ props.confirmText }}
                  </HoverButton>
                </slot>
              </div>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { IconComponents } from '@/constants/iconComponents'
import HoverButton from '@/components/base/HoverButton.vue'

interface Props {
  show: boolean
  title?: string
  width?: string | number
  maxWidth?: string | number
  maxHeight?: string | number
  closable?: boolean
  maskClosable?: boolean
  escClosable?: boolean
  showClose?: boolean
  showHeader?: boolean
  showFooter?: boolean
  showCancel?: boolean
  showConfirm?: boolean
  centered?: boolean
  className?: string
  zIndex?: number
  loading?: boolean
  confirmDisabled?: boolean
  confirmText?: string
  cancelText?: string
  customClass?: string
  customStyle?: Record<string, any>
}

const props = withDefaults(defineProps<Props>(), {
  width: '500px',
  maxWidth: '90%',
  maxHeight: '90vh',
  closable: true,
  maskClosable: true,
  escClosable: true,
  showClose: true,
  showHeader: true,
  showFooter: true,
  showCancel: true,
  showConfirm: true,
  centered: true,
  zIndex: 1000,
  loading: false,
  confirmDisabled: false,
  confirmText: '',
  cancelText: '',
  customClass: '',
  customStyle: () => ({}),
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  close: []
  open: []
  confirm: []
  cancel: []
}>()

// 计算属性
const overlayClass = computed(() => ['modal-overlay', props.customClass])

const overlayStyle = computed(() => ({
  zIndex: props.zIndex,
}))

const containerClass = computed(() => [
  'modal-container',
  {
    'modal-centered': props.centered,
  },
  props.className,
])

const containerStyle = computed(() => {
  const style: Record<string, any> = {
    width: typeof props.width === 'number' ? `${props.width}px` : props.width,
    maxWidth: typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth,
    maxHeight: typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight,
    ...props.customStyle,
  }
  return style
})

const headerClass = computed(() => 'modal-header')
const contentClass = computed(() => 'modal-content')
const footerClass = computed(() => 'modal-footer')
const closeBtnClass = computed(() => 'modal-close-btn')

// 键盘事件处理
const handleKeydown = (event: KeyboardEvent) => {
  if (
    event.key === 'Escape' &&
    props.escClosable &&
    props.closable &&
    props.show &&
    !props.loading
  ) {
    handleClose()
  }
}

// 事件处理函数
const handleOverlayClick = () => {
  if (props.maskClosable && props.closable && !props.loading) {
    handleClose()
  }
}

const handleClose = () => {
  if (props.closable && !props.loading) {
    emit('update:show', false)
    emit('close')
  }
}

const handleCancel = () => {
  if (!props.loading) {
    emit('cancel')
    handleClose()
  }
}

const handleConfirm = () => {
  emit('confirm')
}

// 监听显示状态变化
watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      nextTick(() => {
        emit('open')
        // 防止背景滚动
        document.body.style.overflow = 'hidden'
      })
    } else {
      document.body.style.overflow = ''
    }
  },
)

// 生命周期
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
/* 遮罩层样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

/* 容器样式 */
.modal-container {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--border-radius-xlarge);
  width: 500px;
  max-width: 90%;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}

.modal-container.modal-centered {
  margin: auto;
}

/* 头部样式 */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xxl) var(--spacing-xxl) var(--spacing-xl);
  border-bottom: 1px solid var(--color-border-primary);
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 18px;
  font-weight: 600;
}

.modal-header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.modal-close-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: var(--spacing-xs);
  border-radius: var(--border-radius-medium);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* 内容区域样式 */
.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xxl);
}

.modal-body {
  min-height: 0;
}

/* 底部样式 */
.modal-footer {
  flex-shrink: 0;
  padding: var(--spacing-xl) var(--spacing-xxl);
  border-top: 1px solid var(--color-border-primary);
  background: var(--color-bg-tertiary);
}

.modal-actions {
  display: flex;
  gap: var(--spacing-lg);
  justify-content: flex-end;
}

/* 过渡动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-to,
.modal-fade-leave-from {
  opacity: 1;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .modal-container {
    width: 95%;
    max-width: 95%;
    margin: var(--spacing-lg);
  }

  .modal-header {
    padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-md);
  }

  .modal-content {
    padding: var(--spacing-lg);
  }

  .modal-footer {
    padding: var(--spacing-md) var(--spacing-lg);
  }

  .modal-actions {
    flex-direction: column;
  }
}

/* 可访问性 */
.modal-overlay:focus {
  outline: none;
}

.modal-container:focus {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
}

/* 滚动条样式 */
.modal-content::-webkit-scrollbar {
  width: 6px;
}

.modal-content::-webkit-scrollbar-track {
  background: var(--color-bg-primary);
  border-radius: 3px;
}

.modal-content::-webkit-scrollbar-thumb {
  background: var(--color-border-primary);
  border-radius: 3px;
}

.modal-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary);
}
</style>
