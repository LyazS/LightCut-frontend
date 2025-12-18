<template>
  <div class="project-management">
    <!-- 顶部导航栏 -->
    <header class="header">
      <div class="header-content">
        <div class="logo-section">
          <h1 class="app-title">{{ t('app.title') }}</h1>
          <span class="app-subtitle">{{ t('app.subtitle') }}</span>
        </div>
        <div class="header-actions">
          <HoverButton
            v-if="hasWorkspaceAccess && workspaceInfo"
            variant="primary"
            @click="createNewProject"
            :disabled="isLoading"
          >
            <template #icon>
              <component :is="IconComponents.ADD" size="16px" />
            </template>
            {{ t('project.new') }}
          </HoverButton>
          <LanguageSelector />
          <HoverButton
            @click="handleUserClick"
            :title="isUserLogin ? t('user.userInfo') : t('user.login')"
          >
            <template #icon>
              <component
                :is="getUserStatusIcon(isUserLogin)"
                size="16px"
                :style="{ color: isUserLogin ? undefined : '#ff4444' }"
              />
            </template>
          </HoverButton>
          <HoverButton v-if="workspaceInfo" @click="changeWorkspace" :title="t('workspace.change')">
            <template #icon>
              <component :is="IconComponents.HomeOfficeFill" size="16px" />
            </template>
            <span>{{ workspaceInfo.name }}</span>
          </HoverButton>
        </div>
      </div>
    </header>

    <!-- 主要内容区域 -->
    <main class="main-content">
      <div class="content-container">
        <!-- 权限检测和设置区域 -->
        <section v-if="!hasWorkspaceAccess" class="workspace-setup">
          <div
            class="setup-card"
            :class="{ 'clickable-card': isApiSupported && !permissionError }"
            @click="isApiSupported && !permissionError && !isLoading ? setupWorkspace() : null"
          >
            <div class="setup-icon">
              <component :is="IconComponents.FOLDER_LINE" size="48px" />
            </div>
            <h2>{{ t('workspace.setup.title') }}</h2>
            <p>{{ t('workspace.setup.description') }}</p>

            <div v-if="!isApiSupported" class="error-message">
              <component :is="IconComponents.WARNING" size="16px" />
              <span>{{ t('workspace.error.unsupported') }}</span>
            </div>

            <!-- 权限丢失提示 -->
            <div v-else-if="permissionError" class="error-message">
              <component :is="IconComponents.ERROR" size="16px" />
              <span>{{ t('workspace.error.permission') }}</span>
            </div>
          </div>
        </section>

        <!-- 项目列表区域 -->
        <section v-if="hasWorkspaceAccess" class="recent-projects">
          <div class="section-header">
            <h2>{{ t('project.list.title') }}</h2>
            <div class="header-actions">
              <HoverButton
                @click="loadProjects"
                :disabled="isLoading"
                :title="t('project.list.refresh')"
              >
                <template #icon>
                  <component
                    :is="IconComponents.REFRESH"
                    size="20px"
                    :class="{ spinning: isLoading }"
                  />
                </template>
              </HoverButton>
              <div class="view-options">
                <HoverButton
                  v-if="viewMode !== 'grid'"
                  @click="viewMode = 'grid'"
                  :title="t('project.view.grid')"
                >
                  <template #icon>
                    <component :is="IconComponents.GRID" size="20px" />
                  </template>
                </HoverButton>
                <HoverButton
                  v-if="viewMode !== 'list'"
                  @click="viewMode = 'list'"
                  :title="t('project.view.list')"
                >
                  <template #icon>
                    <component :is="IconComponents.LIST_CHECK" size="20px" />
                  </template>
                </HoverButton>
              </div>
            </div>
          </div>

          <div v-if="isLoading && projects.length === 0" class="loading-state">
            <div class="loading-spinner"></div>
            <p>{{ t('project.loading') }}</p>
          </div>

          <div v-else-if="projects.length === 0" class="empty-state">
            <div class="empty-icon">
              <component :is="IconComponents.EMPTY" size="48px" />
            </div>
            <h3 class="empty-title">{{ t('project.empty.title') }}</h3>
            <p class="empty-description">{{ t('project.empty.description') }}</p>
            <HoverButton variant="primary" @click="createNewProject">
              {{ t('project.new') }}
              <template #icon>
                <component :is="IconComponents.ADD" size="20px" />
              </template>
            </HoverButton>
          </div>

          <div v-else class="projects-grid" :class="{ 'list-view': viewMode === 'list' }">
            <div
              v-for="project in projects"
              :key="project.id"
              class="project-card"
              @click="openProjectById(project.id)"
              @contextmenu="showProjectMenu($event, project)"
            >
              <div class="project-thumbnail">
                <img v-if="project.thumbnail" :src="project.thumbnail" :alt="project.name" />
                <div v-else class="thumbnail-placeholder">
                  <component :is="IconComponents.VIDEO" size="20px" />
                </div>
                <!-- 设置按钮移到缩略图右上角 -->
                <HoverButton
                  variant="small"
                  class="settings-btn-overlay"
                  @click.stop="showProjectMenu($event, project)"
                  :title="t('common.settings')"
                >
                  <template #icon>
                    <component :is="IconComponents.MORE" size="20px" />
                  </template>
                </HoverButton>
              </div>
              <div class="project-info">
                <h3 class="project-name">{{ project.name }}</h3>
                <p class="project-description">
                  {{ project.description || t('project.noDescription') }}
                </p>
                <div class="project-meta">
                  <span class="project-date">{{ formatDate(project.updatedAt) }}</span>
                  <span class="project-duration">{{ formatDuration(project.duration) }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>

  <!-- 项目设置菜单 -->
  <ContextMenu v-model:show="showContextMenu" :options="contextMenuOptions">
    <ContextMenuItem :label="t('project.edit')" @click="showEditDialog(selectedProject!)">
      <template #icon>
        <component :is="IconComponents.EDIT" size="14px" />
      </template>
    </ContextMenuItem>

    <ContextMenuItem
      :label="t('project.delete.title')"
      @click="confirmDeleteProject(selectedProject!)"
    >
      <template #icon>
        <component :is="IconComponents.DELETE" size="14px" color="#ff6b6b" />
      </template>
    </ContextMenuItem>
  </ContextMenu>

  <!-- 编辑项目对话框 -->
  <EditProjectModal
    :show="showEditProjectDialog"
    :project="selectedProject"
    :is-saving="false"
    @close="showEditProjectDialog = false"
    @save="handleSaveProjectEdit"
  />

  <!-- 登录对话框 -->
  <LoginModal :show="showLoginDialog" @close="showLoginDialog = false" />

  <!-- 用户信息对话框 -->
  <UserInfoModal
    v-if="currentUser"
    :show="showUserInfoDialog"
    :user="currentUser"
    @close="showUserInfoDialog = false"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { fileSystemService, unifiedProjectManager } from '@/core/managers'
import { useUnifiedStore } from '@/core/unifiedStore'
import type { UnifiedProjectConfig } from '@/core/project'
import { ContextMenu, ContextMenuItem } from '@imengyu/vue3-context-menu'
import EditProjectModal from '@/components/modals/EditProjectModal.vue'
import LanguageSelector from '@/components/utils/LanguageSelector.vue'
import { IconComponents, getUserStatusIcon } from '@/constants/iconComponents'
import HoverButton from '@/components/base/HoverButton.vue'
import { useProjectThumbnailService } from '@/core/composables/useProjectThumbnailService'
import LoginModal from '@/components/modals/LoginModal.vue'
import UserInfoModal from '@/components/modals/UserInfoModal.vue'
import { useAppI18n } from '@/core/composables/useI18n'

const router = useRouter()
const { t } = useAppI18n()

// 响应式数据
const viewMode = ref<'grid' | 'list'>('grid')
const projects = ref<UnifiedProjectConfig[]>([])
const isLoading = ref(false)
const hasWorkspaceAccess = ref(false)
const workspaceInfo = ref<{ name: string; path?: string } | null>(null)
const permissionError = ref(false)

// 用户相关状态
const showLoginDialog = ref(false)
const showUserInfoDialog = ref(false)

// 上下文菜单相关
const showContextMenu = ref(false)
const selectedProject = ref<UnifiedProjectConfig | null>(null)
const contextMenuOptions = ref({
  x: 0,
  y: 0,
  theme: 'mac dark',
  zIndex: 1000,
})

// 编辑项目对话框相关
const showEditProjectDialog = ref(false)

// 统一存储
const unifiedStore = useUnifiedStore()

// 计算属性
const isUserLogin = computed(() => unifiedStore.isLoggedIn)
const currentUser = computed(() => unifiedStore.getCurrentUser())
const isApiSupported = computed(() => fileSystemService.isSupported())

// 权限和工作目录管理
async function checkWorkspaceAccess() {
  try {
    console.log('🔍 开始检查工作目录权限...')
    const result = await fileSystemService.checkPermission()
    console.log('📋 权限检查结果:', result)
    hasWorkspaceAccess.value = result.hasAccess

    if (result.hasAccess) {
      workspaceInfo.value = await fileSystemService.getWorkspaceInfo()
      console.log('📁 工作目录信息:', workspaceInfo.value)

      if (result.accessChanged) {
        console.log('✅ 工作目录权限已从存储中恢复')
      }

      await loadProjects()
    } else {
      console.log('⚠️ 没有工作目录权限，需要用户设置')
      if (result.accessChanged) {
        console.log('⚠️ 工作目录权限已丢失')
        permissionError.value = true
      }
    }
  } catch (error) {
    console.error('❌ 检查工作目录权限失败:', error)
    hasWorkspaceAccess.value = false
    showPermissionError(error)
  }
}

// 显示权限错误信息
function showPermissionError(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : '未知错误'

  if (errorMessage.includes('权限') || errorMessage.includes('permission')) {
    console.log('🔒 权限错误，需要用户重新授权')
    permissionError.value = true
  } else if (errorMessage.includes('目录') || errorMessage.includes('directory')) {
    console.log('📁 目录访问错误，可能需要重新选择工作目录')
    permissionError.value = true
  }
}

async function setupWorkspace() {
  if (isLoading.value) return

  try {
    isLoading.value = true
    permissionError.value = false

    // 强制弹窗让用户选择工作空间
    const result = await fileSystemService.checkPermission(true)

    if (result.hasAccess) {
      hasWorkspaceAccess.value = true
      workspaceInfo.value = await fileSystemService.getWorkspaceInfo()
      await loadProjects()
      console.log('✅ 工作目录设置成功')
    } else {
      console.log('ℹ️ 用户取消了工作目录选择')
    }
  } catch (error) {
    console.error('设置工作目录失败:', error)
    showPermissionError(error)
  } finally {
    isLoading.value = false
  }
}

async function changeWorkspace() {
  try {
    // 强制弹窗让用户选择新的工作空间
    const result = await fileSystemService.checkPermission(true)

    if (result.hasAccess) {
      hasWorkspaceAccess.value = true
      workspaceInfo.value = await fileSystemService.getWorkspaceInfo()
      projects.value = []
      await loadProjects()
      console.log('✅ 工作目录已更改为:', workspaceInfo.value?.name)
    } else {
      console.log('ℹ️ 用户取消了工作目录更改，保持原有设置')
    }
  } catch (error) {
    console.error('更改工作目录失败:', error)
    await checkWorkspaceAccess()
  }
}

// 项目管理
async function loadProjects() {
  if (!hasWorkspaceAccess.value) return

  try {
    isLoading.value = true
    const projectList = await unifiedProjectManager.listProjects()

    // 为每个项目加载缩略图
    const projectsWithThumbnails = await Promise.all(
      projectList.map(async (project) => {
        try {
          // 尝试加载缩略图
          const thumbnailService = useProjectThumbnailService()
          const thumbnailUrl = await thumbnailService.getThumbnailUrl(project.id)

          return {
            ...project,
            thumbnail: thumbnailUrl,
          }
        } catch (error) {
          console.warn(`无法加载项目 ${project.name} 的缩略图:`, error)
          // 如果缩略图加载失败，保持原项目数据
          return project
        }
      }),
    )

    projects.value = projectsWithThumbnails
  } catch (error) {
    console.error('加载项目列表失败:', error)
    // 可以添加错误提示
  } finally {
    isLoading.value = false
  }
}

/**
 * 加载单个项目的缩略图
 */
async function loadProjectThumbnail(projectId: string, projectName: string) {
  try {
    const thumbnailService = useProjectThumbnailService()
    const thumbnailUrl = await thumbnailService.getThumbnailUrl(projectId)

    // 更新项目的缩略图URL
    const projectIndex = projects.value.findIndex((p) => p.id === projectId)
    if (projectIndex !== -1) {
      projects.value[projectIndex].thumbnail = thumbnailUrl
    }

    return thumbnailUrl
  } catch (error) {
    console.warn(`加载项目缩略图失败: ${projectName}`, error)
    throw error
  }
}

async function createNewProject() {
  if (!hasWorkspaceAccess.value || isLoading.value) return

  try {
    // 生成项目名称
    const projectName = `新项目 ${new Date().toLocaleDateString()}`
    const project = await unifiedProjectManager.createProject(projectName)

    // 跳转到编辑器页面
    router.push(`/editor/${project.id}`)
  } catch (error) {
    console.error('创建项目失败:', error)
    // 可以添加错误提示
  }
}

function openProjectById(projectId: string) {
  // 使用 window.location.href 直接跳转，彻底重新加载页面
  // 这样可以确保所有store状态都被重新创建，避免数据混合问题
  console.log(`🚀 使用页面重载方式打开项目: ${projectId}`)
  window.location.href = `/editor/${projectId}`
}

function confirmDeleteProject(project: UnifiedProjectConfig) {
  unifiedStore.dialogWarning({
    title: t('project.delete.title'),
    content: t('project.delete.confirm', { name: project.name }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    draggable: true,
    onPositiveClick: () => {
      deleteProject(project.id)
    },
  })
}

async function deleteProject(projectId: string) {
  try {
    await unifiedProjectManager.deleteProject(projectId)
    await loadProjects() // 刷新项目列表
    console.log('项目删除成功')
  } catch (error) {
    console.error('删除项目失败:', error)
  }
}

// 显示项目设置菜单
function showProjectMenu(event: MouseEvent, project: UnifiedProjectConfig) {
  event.preventDefault()
  event.stopPropagation()

  selectedProject.value = project
  contextMenuOptions.value.x = event.clientX
  contextMenuOptions.value.y = event.clientY
  showContextMenu.value = true
}

// 显示编辑项目对话框
function showEditDialog(project: UnifiedProjectConfig) {
  selectedProject.value = project
  showEditProjectDialog.value = true
  showContextMenu.value = false
}

// 处理保存项目编辑
async function handleSaveProjectEdit(data: { name: string; description: string }) {
  if (!selectedProject.value) {
    return
  }

  try {
    // 生成统一的更新时间戳
    const updatedAt = new Date().toISOString()

    // 更新项目配置
    const updatedProject: UnifiedProjectConfig = {
      ...selectedProject.value,
      name: data.name,
      description: data.description,
      updatedAt: updatedAt,
    }

    // 先关闭对话框，提升用户体验
    showEditProjectDialog.value = false
    console.log('项目信息已更新:', updatedProject.name)

    // 立即更新本地内存中的项目数据
    const projectIndex = projects.value.findIndex((p) => p.id === selectedProject.value!.id)
    if (projectIndex !== -1) {
      projects.value[projectIndex] = updatedProject
      // 重新排序项目列表（按更新时间排序）
      projects.value.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
    }

    // 异步保存项目配置到文件系统（传入相同的updatedAt确保一致性）
    unifiedProjectManager
      .saveProjectConfig(updatedProject, updatedAt)
      .then(() => {
        console.log('项目配置保存成功:', updatedProject.name)
      })
      .catch((error) => {
        console.error('保存项目配置失败:', error)
        // 保存失败时重新加载项目列表以恢复正确状态
        loadProjects()
      })
  } catch (error) {
    console.error('更新项目信息失败:', error)
    // 可以添加错误提示
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) {
    return '00:00'
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

// 用户相关方法
function handleUserClick() {
  if (isUserLogin.value) {
    // 如果已登录，显示用户信息对话框
    showUserInfoDialog.value = true
  } else {
    // 如果未登录，显示登录对话框
    showLoginDialog.value = true
  }
}

// 生命周期
onMounted(async () => {
  await checkWorkspaceAccess()
})
</script>

<style scoped>
.project-management {
  min-height: 100vh;
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.header {
  background-color: var(--color-bg-secondary);
  padding: 1rem 0;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo-section {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.app-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.app-subtitle {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.main-content {
  padding: 2rem 0;
}

.content-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.workspace-setup {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}

.setup-card {
  background-color: var(--color-bg-secondary);
  border-radius: var(--border-radius-large);
  padding: 3rem;
  text-align: center;
  max-width: 500px;
  width: 100%;
  transition: all 0.2s ease;
}

.setup-card.clickable-card {
  cursor: pointer;
  border-color: var(--color-accent-primary);
  opacity: 0.9;
}

.setup-card.clickable-card:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-accent-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  opacity: 1;
}

.setup-icon {
  color: var(--color-accent-primary);
  margin-bottom: 1.5rem;
  opacity: 0.8;
}

.setup-card h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--color-text-primary);
}

.setup-card p {
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin-bottom: 2rem;
}

.error-message {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--border-radius-medium);
  color: #dc2626;
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 1.5rem;
  text-align: left;
}

.btn-large {
  padding: 0.75rem 2rem;
  font-size: 1rem;
}

.quick-actions h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--color-text-primary);
}

.action-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.action-card {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--border-radius-large);
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.action-card:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  transform: translateY(-2px);
}

.card-icon {
  color: var(--color-accent-primary);
  margin-bottom: 1rem;
}

.action-card h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--color-text-primary);
}

.action-card p {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.recent-projects h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0; /* 移除 margin-bottom 以确保垂直居中 */
  color: var(--color-text-primary);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.loading-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--color-text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border-primary);
  border-top: 3px solid var(--color-accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

.view-options {
  display: flex;
  gap: 0.25rem;
}

.view-btn {
  padding: 0.5rem;
  background: none;
  border: 1px solid var(--color-border-primary);
  border-radius: var(--border-radius-small);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.view-btn:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.view-btn.active {
  background-color: var(--color-accent-primary);
  border-color: var(--color-accent-primary);
  color: white;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--color-text-secondary);
}

.empty-icon {
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--color-text-primary);
}

.empty-description {
  margin-bottom: 1.5rem;
  color: var(--color-text-secondary);
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.projects-grid.list-view {
  grid-template-columns: 1fr;
}

.project-card {
  background-color: var(--color-bg-secondary);
  border-radius: var(--border-radius-large);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.list-view .project-card {
  flex-direction: row;
  align-items: center;
}

.project-card:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  transform: translateY(-2px);
}

.project-thumbnail {
  aspect-ratio: 16/9;
  background-color: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.list-view .project-thumbnail {
  aspect-ratio: 16/9;
  width: 120px;
  flex-shrink: 0;
}

/* 列表视图中的设置按钮调整 */
.list-view .settings-btn-overlay {
  top: 4px;
  right: 4px;
  width: 28px;
  height: 28px;
}

.project-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-placeholder {
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.project-info {
  padding: 1rem;
  flex: 1;
}

.project-name {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: var(--color-text-primary);
}

.project-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

.project-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

/* 右上角设置按钮样式 */
.settings-btn-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: var(--border-radius-medium);
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0;
  transform: scale(0.9);
  backdrop-filter: blur(4px);
}

.project-card:hover .settings-btn-overlay {
  opacity: 1;
  transform: scale(1);
}

.settings-btn-overlay:hover {
  background: rgba(0, 0, 0, 0.8);
  transform: scale(1.05);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
