<template>
  <template v-if="!showHistory">
    <!-- 聊天面板 -->
    <ChatMessageList />
    <ChatInput />
  </template>
  <template v-else>
    <!-- 历史记录面板 -->
    <ChatHistoryPanel @close="emit('update:showHistory', false)" />
  </template>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import ChatHistoryPanel from './ChatHistoryPanel.vue'

// 定义 props
defineProps<{
  showHistory: boolean
}>()

// 定义事件
const emit = defineEmits<{
  'update:showHistory': [value: boolean]
}>()
</script>

<style scoped>
/* Agent 面板样式 */
</style>