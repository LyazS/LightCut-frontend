<template>
  <Transition name="modal-fade" appear>
    <div v-if="visible" class="loading-modal-overlay">
      <div class="loading-modal">
        <!-- 加载图标 -->
        <div class="loading-icon">
          <component :is="IconComponents.LOADING" size="48px" class="loading-spinner" />
        </div>

        <!-- 加载标题 -->
        <h2 v-if="showTitle && title" class="loading-title">{{ title }}</h2>

        <!-- 当前阶段 -->
        <p v-if="showStage && stage" class="loading-stage">{{ currentStage }}</p>

        <!-- 进度条 -->
        <div v-if="showProgress && progress !== undefined" class="progress-container">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: Math.max(0, Math.min(100, progress)) + '%' }"
            ></div>
          </div>
          <span class="progress-text">{{ Math.round(progress) }}%</span>
        </div>

        <!-- 详细信息 -->
        <div v-if="showDetails && details" class="loading-details">
          <p class="details-text">{{ details }}</p>
        </div>

        <!-- 提示信息 -->
        <div v-if="showTips && tipText" class="loading-tips">
          <p class="tip-text">{{ tipText }}</p>
        </div>

        <!-- 取消按钮（可选） -->
        <button v-if="showCancel && cancelText" class="cancel-button" @click="handleCancel">
          {{ cancelText }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IconComponents } from '@/constants/iconComponents'

// Props
interface Props {
  /** 是否显示加载弹窗 */
  visible: boolean
  /** 加载标题 */
  title?: string
  /** 当前加载阶段 */
  stage?: string
  /** 加载进度 (0-100) */
  progress?: number
  /** 详细信息 */
  details?: string
  /** 提示文本 */
  tipText?: string
  /** 是否显示标题 */
  showTitle?: boolean
  /** 是否显示阶段 */
  showStage?: boolean
  /** 是否显示进度条 */
  showProgress?: boolean
  /** 是否显示详细信息 */
  showDetails?: boolean
  /** 是否显示提示信息 */
  showTips?: boolean
  /** 是否显示取消按钮 */
  showCancel?: boolean
  /** 取消按钮文本 */
  cancelText?: string
}

const props = defineProps<Props>()

// Emits
interface Emits {
  (e: 'cancel'): void
}

const emit = defineEmits<Emits>()

// 计算属性
const currentStage = computed(() => {
  return props.stage
})

// 处理取消操作
const handleCancel = () => {
  emit('cancel')
}
</script>

<style scoped>
.loading-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

/* Vue Transition 动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .loading-modal,
.modal-fade-leave-active .loading-modal {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .loading-modal,
.modal-fade-leave-to .loading-modal {
  transform: scale(0.9);
  opacity: 0;
}

.loading-modal {
  background: var(--color-bg-primary, #1e1e1e);
  border-radius: 12px;
  padding: 32px;
  min-width: 320px;
  max-width: 480px;
  text-align: center;
  color: var(--color-text-primary);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border: 1px solid var(--color-border-secondary, rgba(255, 255, 255, 0.1));
}

.loading-icon {
  margin-bottom: 20px;
}

.loading-spinner {
  color: var(--color-accent-primary, #4caf50);
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.loading-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--color-text-primary);
}

.loading-stage {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin-bottom: 20px;
  min-height: 1.5em;
}

.progress-container {
  margin-bottom: 20px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--color-accent-primary, #4caf50),
    var(--color-accent-secondary, #2196f3)
  );
  border-radius: 4px;
  transition: width 0.1s ease-out;
  position: relative;
  overflow: hidden;
  min-width: 2px;
}

.progress-fill::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

.progress-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.loading-details {
  margin-bottom: 16px;
  min-height: 1.2em;
}

.details-text {
  font-size: 14px;
  color: var(--color-text-muted);
  font-style: italic;
}

.loading-tips {
  border-top: 1px solid var(--color-border-secondary, rgba(255, 255, 255, 0.1));
  padding-top: 16px;
  margin-bottom: 16px;
}

.tip-text {
  font-size: 13px;
  color: var(--color-text-muted);
  opacity: 0.8;
}

.cancel-button {
  background: transparent;
  border: 1px solid var(--color-border-primary, rgba(255, 255, 255, 0.2));
  color: var(--color-text-secondary);
  padding: 8px 24px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-button:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--color-text-secondary);
  color: var(--color-text-primary);
}

.cancel-button:active {
  transform: scale(0.98);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .loading-modal {
    min-width: 280px;
    max-width: 90%;
    padding: 24px;
  }

  .loading-title {
    font-size: 18px;
  }

  .loading-stage {
    font-size: 14px;
  }
}

/* 深色主题适配 */
@media (prefers-color-scheme: dark) {
  .loading-modal {
    background: var(--color-bg-primary, #1e1e1e);
    border-color: var(--color-border-secondary, rgba(255, 255, 255, 0.1));
  }
}

/* 高对比度模式 */
@media (prefers-contrast: high) {
  .loading-modal-overlay {
    background: rgba(0, 0, 0, 0.9);
  }

  .loading-modal {
    border: 2px solid var(--color-border-primary);
  }

  .progress-bar {
    border: 1px solid var(--color-border-primary);
  }
}

/* 减少动画模式 */
@media (prefers-reduced-motion: reduce) {
  .loading-spinner,
  .progress-fill {
    animation: none;
  }

  .modal-fade-enter-active,
  .modal-fade-leave-active {
    transition: none;
  }

  .modal-fade-enter-from .loading-modal,
  .modal-fade-leave-to .loading-modal {
    transform: none;
  }
}
</style>
