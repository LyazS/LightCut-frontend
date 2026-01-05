<script setup lang="ts">
import { NConfigProvider, NMessageProvider, darkTheme } from 'naive-ui'
import AppProvider from './AppProvider.vue'
</script>

<template>
  <div id="app">
    <n-config-provider :theme="darkTheme">
      <n-message-provider>
        <AppProvider />
      </n-message-provider>
    </n-config-provider>
  </div>
</template>
