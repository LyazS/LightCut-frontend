<template>
  <UniversalModal
    :show="show"
    :title="t('textToImage.title')"
    @close="handleClose"
    @confirm="handleSubmit"
    @cancel="handleClose"
    :confirm-disabled="!form.text.trim() || isProcessing"
    :loading="isProcessing"
    :confirm-text="isProcessing ? t('textToImage.generating') : t('textToImage.generate')"
  >
    <div class="text-to-image-form">
      <!-- 处理器选择 -->
      <div class="form-group">
        <label>生成方式</label>
        <div class="radio-group">
          <label class="radio-option">
            <input type="radio" v-model="form.processor" value="text_to_image" />
            <span>本地文生图</span>
          </label>
          <label class="radio-option">
            <input type="radio" v-model="form.processor" value="remote_image" />
            <span>远程随机图片</span>
          </label>
          <label class="radio-option">
            <input type="radio" v-model="form.processor" value="bizyair_image" />
            <span>BizyAir 图片生成</span>
          </label>
          <label class="radio-option">
            <input type="radio" v-model="form.processor" value="bizyair_video" />
            <span>BizyAir 视频生成</span>
          </label>
        </div>
      </div>

      <!-- 测试模式选择（仅开发环境显示） -->
      <div class="form-group" v-if="isDevelopment">
        <label>🧪 测试模式</label>
        <select v-model="form.testMode" class="test-mode-select">
          <option value="normal">✅ 正常提交</option>
          
          <!-- 原有的测试选项 -->
          <option value="unsupported_type">❌ 不支持的任务类型</option>
          <option value="missing_text">❌ 缺少text字段</option>
          <option value="empty_text">❌ 空text字段</option>
          
          <!-- 新增：错误注入测试选项 -->
          <optgroup label="🔥 错误注入测试">
            <option value="error:network_timeout">⏱️ 网络超时</option>
            <option value="error:network_error">🌐 网络错误</option>
            <option value="error:resource_insufficient">💾 资源不足</option>
            <option value="error:api_error">🔌 API错误</option>
            <option value="error:validation_error">✏️ 验证错误</option>
            <option value="error:system_error">⚠️ 系统错误</option>
            <option value="error:timeout">⏰ 处理超时</option>
            <option value="error:memory_insufficient">🧠 内存不足</option>
            <option value="error:disk_full">💿 磁盘已满</option>
            <option value="error:gpu_unavailable">🎮 GPU不可用</option>
            <option value="error:random_error">🎲 随机错误 (50%概率)</option>
          </optgroup>
          
          <!-- 新增：媒体类型测试选项 -->
          <optgroup label="🎬 媒体类型测试">
            <option value="media:image">🖼️ 图片（默认）</option>
            <option value="media:video">🎥 视频</option>
            <option value="media:audio">🎵 音频</option>
          </optgroup>
        </select>
        <div class="test-hint">
          {{ getTestDescription(form.testMode) }}
        </div>
      </div>

      <!-- 文本描述 (本地文生图和 BizyAir 都需要) -->
      <div class="form-group" v-if="form.processor === 'text_to_image' || form.processor === 'bizyair_image' || form.processor === 'bizyair_video'">
        <label>
          {{ form.processor === 'bizyair_image' ? '图片描述' : form.processor === 'bizyair_video' ? '图片描述' : t('textToImage.description') }}
          {{ t('textToImage.required') }}
        </label>
        <textarea
          v-model="form.text"
          :placeholder="form.processor === 'bizyair_image'
            ? '请输入图片描述（支持中英文，最多5000字）...'
            : form.processor === 'bizyair_video'
            ? '描述视频第一帧的画面内容（支持中英文，最多5000字）...'
            : t('textToImage.descriptionPlaceholder')"
          :maxlength="form.processor === 'bizyair_image' || form.processor === 'bizyair_video' ? 5000 : 1000"
          rows="4"
        />
        <div class="char-count">
          {{ form.text.length }}/{{ form.processor === 'bizyair_image' || form.processor === 'bizyair_video' ? 5000 : 1000 }}
        </div>
      </div>

      <!-- 视频动作描述 (仅 BizyAir 视频需要) -->
      <div class="form-group" v-if="form.processor === 'bizyair_video'">
        <label>视频动作描述（可选）</label>
        <textarea
          v-model="form.motionDescription"
          placeholder="描述视频中的动作和运动（可选，最多1000字）..."
          maxlength="1000"
          rows="3"
        />
        <div class="char-count">{{ form.motionDescription.length }}/1000</div>
      </div>

      <!-- 尺寸选择 (仅本地文生图需要) -->
      <div class="form-group" v-if="form.processor === 'text_to_image'">
        <label>{{ t('textToImage.size') }}</label>
        <select v-model="form.size">
          <option value="800x450">{{ t('textToImage.size_16_9') }}</option>
          <option value="1024x1024">{{ t('textToImage.size_1_1') }}</option>
          <option value="450x800">{{ t('textToImage.size_9_16') }}</option>
        </select>
      </div>

      <!-- BizyAir 图片信息提示 -->
      <div class="info-box" v-if="form.processor === 'bizyair_image'">
        <p>🎨 使用 Qwen 模型快速生成赛博朋克风格图片</p>
        <p>📐 固定尺寸：1024 × 960 像素</p>
        <p>⚡ 预计耗时：4-6 秒</p>
      </div>

      <!-- BizyAir 视频信息提示 -->
      <div class="info-box" v-if="form.processor === 'bizyair_video'">
        <p>🎬 使用 wan2.2 模型生成视频（图生视频）</p>
        <p>📐 固定尺寸：1024 × 1024 像素</p>
        <p>🎞️ 帧数：81 帧</p>
        <p>⚡ 预计耗时：60-90 秒</p>
      </div>

      <!-- 预估成本 -->
      <div class="estimation-info">
        {{ t('textToImage.estimatedCost') }}: {{ estimatedCost }} {{ t('textToImage.credits') }}
      </div>
    </div>
  </UniversalModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import UniversalModal from './UniversalModal.vue'
import { useAppI18n } from '@/core/composables/useI18n'

const { t } = useAppI18n()

interface Props {
  show: boolean
  isProcessing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isProcessing: false,
})

interface Emits {
  (e: 'close'): void
  (e: 'submit', config: {
    processor: string
    text?: string
    motionDescription?: string  // 视频动作描述
    width?: number
    height?: number
    testMode?: string
    debugError?: string  // 错误代码
    mediaType?: string   // 新增：媒体类型
  }): void
}

const emit = defineEmits<Emits>()

// 检测是否为开发环境
const isDevelopment = import.meta.env.DEV

const form = ref({
  processor: 'text_to_image',
  text: '',
  motionDescription: '', // 视频动作描述
  size: '800x450',
  testMode: 'normal', // 测试模式
})

const estimatedCost = computed(() => {
  if (form.value.processor === 'remote_image') {
    return 1 // 远程图片成本固定为 1
  }
  if (form.value.processor === 'bizyair_image') {
    return 2 // BizyAir 图片固定 2 积分（0.02元）
  }
  if (form.value.processor === 'bizyair_video') {
    return 50 // BizyAir 视频固定 50 积分（0.5元）
  }
  // 本地文生图动态计算
  const [width, height] = form.value.size.split('x').map(Number)
  return Math.round(((width * height) / (800 * 450)) * 5)
})

// 获取测试模式描述
const getTestDescription = (testMode: string): string => {
  const descriptions: Record<string, string> = {
    normal: '正常提交任务，验证成功流程',
    unsupported_type: '发送不支持的任务类型，预期返回 UNSUPPORTED_TASK_TYPE',
    missing_text: '发送缺少text字段的配置，预期返回 INVALID_CONFIG',
    empty_text: '发送空text字段，预期返回 INVALID_CONFIG',
    
    // 错误注入测试描述
    'error:network_timeout': '触发网络超时错误，测试前端超时处理',
    'error:network_error': '触发网络连接失败错误，测试网络异常处理',
    'error:resource_insufficient': '触发资源不足错误，测试资源限制提示',
    'error:api_error': '触发API服务异常，测试第三方服务错误处理',
    'error:validation_error': '触发参数验证失败，测试输入验证提示',
    'error:system_error': '触发系统内部错误，测试系统级异常处理',
    'error:timeout': '触发任务处理超时，测试超时重试机制',
    'error:memory_insufficient': '触发内存不足错误，测试资源分配失败',
    'error:disk_full': '触发磁盘空间不足，测试存储失败处理',
    'error:gpu_unavailable': '触发GPU不可用错误，测试硬件资源异常',
    'error:random_error': '触发随机错误（50%概率失败，50%概率成功），测试不确定性错误处理',
    
    // 媒体类型测试描述
    'media:image': '测试图片类型（默认），从 mocklib API 获取随机图片',
    'media:video': '测试视频类型，返回固定的 MP4 视频文件',
    'media:audio': '测试音频类型，返回固定的 MP3 音频文件',
  }
  return descriptions[testMode] || ''
}

const handleClose = () => {
  if (!props.isProcessing) {
    emit('close')
  }
}

const handleSubmit = () => {
  if (props.isProcessing) return

  // 检查是否为错误注入测试
  const isErrorTest = form.value.testMode.startsWith('error:')
  const errorCode = isErrorTest ? form.value.testMode.replace('error:', '') : undefined

  // 检查是否为媒体类型测试
  const isMediaTest = form.value.testMode.startsWith('media:')
  const mediaType = isMediaTest ? form.value.testMode.replace('media:', '') : undefined

  // BizyAir 图片生成
  if (form.value.processor === 'bizyair_image') {
    if (form.value.text.trim() || form.value.testMode !== 'normal') {
      emit('submit', {
        processor: 'bizyair_image',
        text: form.value.text.trim(),
        testMode: form.value.testMode,
        debugError: errorCode,
        mediaType: mediaType,
      })
    }
    return
  }

  // BizyAir 视频生成
  if (form.value.processor === 'bizyair_video') {
    if (form.value.text.trim() || form.value.testMode !== 'normal') {
      emit('submit', {
        processor: 'bizyair_video',
        text: form.value.text.trim(),
        motionDescription: form.value.motionDescription.trim(),
        testMode: form.value.testMode,
        debugError: errorCode,
        mediaType: mediaType,
      })
    }
    return
  }

  if (form.value.processor === 'remote_image') {
    // 远程图片不需要文本和尺寸
    emit('submit', {
      processor: form.value.processor,
      testMode: form.value.testMode,
      debugError: errorCode, // 传递错误代码
      mediaType: mediaType,  // 传递媒体类型
    })
  } else if (form.value.text.trim() || form.value.testMode !== 'normal') {
    // 本地文生图需要文本和尺寸
    // 注意：测试模式下允许空文本
    const [width, height] = form.value.size.split('x').map(Number)
    emit('submit', {
      processor: form.value.processor,
      text: form.value.text.trim(),
      width,
      height,
      testMode: form.value.testMode,
      debugError: errorCode, // 传递错误代码
      mediaType: mediaType,  // 传递媒体类型
    })
  }
}
</script>

<style scoped>
.text-to-image-form {
  padding: 0;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--color-text-primary);
  font-weight: 500;
}

.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.75rem;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--border-radius-medium);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  box-sizing: border-box;
}

.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--color-accent-primary);
}

.char-count {
  text-align: right;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.radio-group {
  display: flex;
  gap: 1rem;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.5rem 1rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--border-radius-medium);
  transition: all 0.2s;
}

.radio-option:hover {
  border-color: var(--color-accent-primary);
}

.radio-option input[type='radio'] {
  cursor: pointer;
}

.estimation-info {
  background: var(--color-bg-tertiary);
  padding: 1rem;
  border-radius: var(--border-radius-medium);
  text-align: center;
  color: var(--color-text-primary);
}

/* 测试模式样式 */
.test-mode-select {
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-accent-primary);
}

.test-hint {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid var(--color-accent-primary);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

/* BizyAir 信息框样式 */
.info-box {
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid var(--color-accent-primary);
  border-radius: 4px;
  padding: 0.75rem;
  margin-bottom: 1rem;
}

.info-box p {
  margin: 0.25rem 0;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  line-height: 1.5;
}

.info-box p:first-child {
  font-weight: 500;
  color: var(--color-accent-primary);
}
</style>
