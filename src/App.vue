<script setup lang="ts">
import {
  NConfigProvider,
  NNotificationProvider,
  NMessageProvider,
  NDialogProvider,
  darkTheme,
} from 'naive-ui'
import AppProvider from './AppProvider.vue'
</script>

<template>
  <div id="app">
    <n-config-provider :theme="darkTheme">
      <n-message-provider>
        <n-notification-provider>
          <n-dialog-provider>
            <AppProvider />
          </n-dialog-provider>
        </n-notification-provider>
      </n-message-provider>
    </n-config-provider>
  </div>
</template>
