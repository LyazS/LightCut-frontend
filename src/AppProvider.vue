<script setup lang="ts">
import { watch } from 'vue'
import { NMessageProvider } from 'naive-ui'
import { useAppI18n } from '@/core/composables/useI18n'
import { useMessage } from 'naive-ui'
import { useUnifiedStore } from '@/core/unifiedStore'
const { updatePageTitle, locale, t } = useAppI18n()
const unifiedStore = useUnifiedStore()

unifiedStore.initApi({
  message: useMessage(),
  t,
})
// 监听语言变化，更新页面标题
watch(locale, () => {
  updatePageTitle()
})
</script>

<template>
  <NMessageProvider>
    <div id="app">
      <router-view />
    </div>
  </NMessageProvider>
</template>

<style>
/* 引入通用样式 */
@import './styles/common.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 编辑器以拖拽和框选为主，文本输入控件除外。 */
#app,
#app * {
  -webkit-user-select: none;
  user-select: none;
}

#app input,
#app textarea,
#app [contenteditable]:not([contenteditable='false']) {
  -webkit-user-select: text;
  user-select: text;
}

/* 聊天记录应支持复制，包括 Markdown、工具调用和交互卡片文本。 */
#app .chat-messages-container,
#app .chat-messages-container * {
  -webkit-user-select: text;
  user-select: text;
}

#app {
  width: 100vw;
  height: 100vh;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  overflow: hidden;
}

body {
  margin: 0;
  padding: 0;
}

/* 全局应用自定义滚动条样式 */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-bg-active) var(--color-bg-primary);
}

*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

*::-webkit-scrollbar-track {
  background: var(--color-bg-primary);
  border-radius: var(--border-radius-medium);
}

*::-webkit-scrollbar-thumb {
  background: var(--color-bg-active);
  border-radius: var(--border-radius-medium);
  border: 1px solid var(--color-bg-tertiary);
}

*::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-secondary);
}

*::-webkit-scrollbar-corner {
  background: var(--color-bg-primary);
}
</style>
