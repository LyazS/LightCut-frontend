import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import removeConsole from 'vite-plugin-remove-console'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    removeConsole(), // 移除所有console打印
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    minify: 'terser', // 使用terser进行代码压缩
    terserOptions: {
      compress: {
        drop_console: true, // 移除console
        drop_debugger: true, // 移除debugger
      },
    },
    chunkSizeWarningLimit: 1000, // 提高chunk大小警告限制到1000KB
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // 将大型依赖分离到单独的chunk
          if (id.includes('node_modules')) {
            // Vue 核心库
            if (id.includes('vue') || id.includes('pinia') || id.includes('@vue')) {
              return 'vue-vendor'
            }
            // 路由
            if (id.includes('vue-router')) {
              return 'vue-vendor'
            }
            // UI 组件库
            if (id.includes('naive-ui')) {
              return 'ui-vendor'
            }
            // 媒体处理库
            if (id.includes('mediabunny') || id.includes('@mediabunny')) {
              return 'media-vendor'
            }
            // 工具库
            if (id.includes('lodash') || id.includes('axios') || id.includes('dexie')) {
              return 'utils-vendor'
            }
            // 国际化
            if (id.includes('vue-i18n')) {
              return 'i18n-vendor'
            }
            // Markdown 相关
            if (id.includes('markdown-it') || id.includes('github-markdown-css')) {
              return 'markdown-vendor'
            }
            // OSS 存储
            if (id.includes('ali-oss')) {
              return 'oss-vendor'
            }
            // 图标库
            if (id.includes('remixicon') || id.includes('@remixicon')) {
              return 'icon-vendor'
            }
            // 上下文菜单
            if (id.includes('@imengyu')) {
              return 'context-vendor'
            }
            // 其他工具
            if (id.includes('nanoid') || id.includes('p-limit')) {
              return 'misc-vendor'
            }
            // 其他 node_modules
            return 'vendor'
          }
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['worker_threads'], // 排除Node.js模块
  },
})
