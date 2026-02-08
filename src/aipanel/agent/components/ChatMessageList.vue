<template>
  <div class="chat-messages-container" ref="messagesContainer">
    <AIChatMessage :message="welcomeMessage" />
    <component
      :is="getMessageComponent(message.type)"
      v-for="message in messages"
      :key="message.id"
      :message="message"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, provide, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import UserChatMessage from './UserChatMessage.vue'
import AIChatMessage from './AIChatMessage.vue'
import { SESSION_MANAGER } from '@/aipanel/agent/services'
import { ChatMessageType, ChatMessageAssistantContentType } from '@/aipanel/agent/types'
import type { ChatMessageAssistant } from '@/aipanel/agent/types'
import { useAppI18n } from '@/core/composables/useI18n'

// 根据消息类型返回对应的组件
const getMessageComponent = (type: ChatMessageType) => {
  return type === ChatMessageType.USER ? UserChatMessage : AIChatMessage
}

// 创建共享的markdown-it实例
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})

// 提供markdown渲染函数给子组件
const renderMarkdown = (content: string) => {
  return md.render(content)
}

provide('renderMarkdown', renderMarkdown)

// 直接从 SessionManager 获取消息列表
const messages = computed(() => SESSION_MANAGER.messages.value)

// 使用国际化
const { t } = useAppI18n()

// 默认欢迎消息
const welcomeMessage = computed<ChatMessageAssistant>(() => ({
  id: 'welcome-1',
  type: ChatMessageType.ASSISTANT,
  content: [
    {
      type: ChatMessageAssistantContentType.TEXT,
      content: t('common.chat.welcomeMessage'),
    },
  ],
  timestamp: new Date().toISOString(),
}))

const messagesContainer = ref<HTMLElement>()

// 滚动到最新消息
const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 监听消息变化，自动滚动到底部
watch(
  messages,
  () => {
    scrollToBottom()
  },
  { deep: true },
)

// 初始化时滚动到底部
scrollToBottom()
</script>

<style scoped>
.chat-messages-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* 滚动条样式 */
.chat-messages-container::-webkit-scrollbar {
  width: 6px;
}

.chat-messages-container::-webkit-scrollbar-track {
  background: var(--color-bg-primary);
  border-radius: 3px;
}

.chat-messages-container::-webkit-scrollbar-thumb {
  background: var(--color-border-secondary);
  border-radius: 3px;
}

.chat-messages-container::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-primary);
}
</style>
