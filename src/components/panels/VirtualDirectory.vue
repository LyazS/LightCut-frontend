<template>
  <div class="virtual-directory-library">
    <!-- 顶部：面包屑导航 -->
    <div class="breadcrumb-section">
      <LibraryBreadcrumb />
    </div>

    <!-- 下方内容区域 -->
    <div class="content-section">
      <!-- 左侧：垂直标签页（悬浮） -->
      <LibraryVerticalTabs />

      <!-- 右侧：媒体网格（永远留出44px空间） -->
      <div class="media-grid-section">
        <LibraryMediaGrid />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import LibraryVerticalTabs from './LibraryVerticalTabs.vue'
import LibraryBreadcrumb from './LibraryBreadcrumb.vue'
import LibraryMediaGrid from './LibraryMediaGrid.vue'
</script>

<style scoped>
.virtual-directory-library {
  width: 100%;
  height: 100%;
  background-color: var(--color-bg-secondary);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 顶部面包屑区域样式 */
.breadcrumb-section {
  flex-shrink: 0;
  padding: 0;
  border-bottom: 1px solid var(--color-border);
}

/* 下方内容区域样式 */
.content-section {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  position: relative; /* 为悬浮的标签页提供定位上下文 */
}

/* 右侧媒体网格区域样式 */
.media-grid-section {
  flex: 1;
  margin-left: 44px; /* 永远为折叠宽度，展开时标签页会覆盖在上方 */
  overflow: hidden;
}
</style>
