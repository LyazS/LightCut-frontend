import { ref, computed } from 'vue'
import { generateDirectoryId, generateTabId } from '@/core/utils/idGenerator'
import type {
  VirtualDirectory,
  DisplayTab,
  DisplayItem,
  DirectoryNavigationState,
  ClipboardState,
  ClipboardItem,
  ClipboardOperation,
  PasteResult,
  ViewMode,
  SortBy,
  SortOrder,
  UnifiedDirectoryConfig,
  CharacterInfo,
  CharacterDirectory,
} from '@/core/directory/types'
import type { FileData } from '@/aipanel/aigenerate/types'
import { DirectoryType } from '@/core/directory/types'
import { ClipboardOperation as ClipboardOp } from '@/core/directory/types'
import { ModuleRegistry, MODULE_NAMES } from './ModuleRegistry'
import type { UnifiedMediaModule } from './UnifiedMediaModule'

/**
 * 统一目录模块（简化版）
 * 管理虚拟目录的创建、导航和标签页功能
 * 持久化由项目模块统一管理
 */
export function createUnifiedDirectoryModule(registry: ModuleRegistry) {
  // 通过注册中心获取依赖模块
  const mediaModule = registry.get<UnifiedMediaModule>(MODULE_NAMES.MEDIA)

  // ==================== 状态定义 ====================

  // 目录列表
  const directories = ref<Map<string, VirtualDirectory>>(new Map())

  // 打开的标签页列表
  const openTabs = ref<DisplayTab[]>([])

  // 当前活动标签页ID
  const activeTabId = ref<string>('')

  // 剪贴板状态
  const clipboardState = ref<ClipboardState>({
    operation: null,
    items: [],
    sourceDirId: null,
    timestamp: 0,
  })

  // 视图模式状态
  const viewMode = ref<ViewMode>('medium-icon')

  // 排序状态
  const sortBy = ref<SortBy>('name')
  const sortOrder = ref<SortOrder>('asc')

  // ==================== 计算属性 ====================

  // 当前活动的标签页
  const activeTab = computed(() => {
    return openTabs.value.find((tab) => tab.id === activeTabId.value) || null
  })

  // 当前显示的目录
  const currentDir = computed(() => {
    if (!activeTab.value) return null
    return directories.value.get(activeTab.value.dirId) || null
  })

  // ==================== 核心方法 ====================

  /**
   * 创建新目录
   */
  function createDirectory(name: string, parentId: string | null = null): VirtualDirectory {
    const newDir: VirtualDirectory = {
      type: DirectoryType.BASE,
      id: generateDirectoryId(),
      name,
      parentId,
      createdAt: new Date().toISOString(),
      childDirIds: [],
      mediaItemIds: [],
    }

    directories.value.set(newDir.id, newDir)

    // 如果有父目录，更新父目录的子目录列表
    if (parentId) {
      const parentDir = directories.value.get(parentId)
      if (parentDir) {
        parentDir.childDirIds.push(newDir.id)
      }
    }

    return newDir
  }

  /**
   * 创建角色文件夹
   */
  function createCharacterDirectory(
    name: string,
    remark: string,
    refVideo: FileData[] = [],
    parentId: string | null = null,
  ): CharacterDirectory {
    const characterDir: CharacterDirectory = {
      type: DirectoryType.CHARACTER,
      id: generateDirectoryId(),
      name,
      parentId,
      createdAt: new Date().toISOString(),
      childDirIds: [],
      mediaItemIds: [],
      character: {
        remark,
        refVideo,
      },
    }

    directories.value.set(characterDir.id, characterDir)

    // 如果有父目录，更新父目录的子目录列表
    if (parentId) {
      const parentDir = directories.value.get(parentId)
      if (parentDir) {
        parentDir.childDirIds.push(characterDir.id)
      }
    }

    console.log('✅ 角色文件夹创建成功:', characterDir.name)
    return characterDir
  }

  /**
   * 类型守卫：判断是否为角色文件夹
   */
  function isCharacterDirectory(dir: VirtualDirectory): dir is CharacterDirectory {
    return dir.type === DirectoryType.CHARACTER
  }

  /**
   * 获取角色文件夹
   */
  function getCharacterDirectory(dirId: string): CharacterDirectory | undefined {
    const dir = directories.value.get(dirId)
    if (dir && isCharacterDirectory(dir)) {
      return dir
    }
    return undefined
  }

  /**
   * 重命名目录
   */
  function renameDirectory(id: string, newName: string): boolean {
    const dir = directories.value.get(id)
    if (!dir) return false

    if (!newName.trim()) return false

    dir.name = newName.trim()
    return true
  }

  /**
   * 获取目录
   */
  function getDirectory(id: string): VirtualDirectory | undefined {
    return directories.value.get(id)
  }

  /**
   * 添加媒体到目录
   * @param mediaId 媒体ID
   * @param dirId 目录ID
   * @param updateRefCount 是否更新引用计数，默认为true。剪切/拖拽移动时应设为false
   */
  function addMediaToDirectory(
    mediaId: string,
    dirId: string,
    updateRefCount: boolean = true,
  ): boolean {
    const dir = directories.value.get(dirId)
    if (!dir) return false

    if (!dir.mediaItemIds.includes(mediaId)) {
      dir.mediaItemIds.push(mediaId)

      // 🆕 增加引用计数（仅在需要时）
      if (updateRefCount) {
        const mediaItem = mediaModule.getMediaItem(mediaId)
        if (mediaItem) {
          mediaItem.runtime.refCount = (mediaItem.runtime.refCount || 0) + 1
          console.log(
            `📊 [addMediaToDirectory] 素材 ${mediaItem.name} 引用计数: ${mediaItem.runtime.refCount}`,
          )
        }
      }

      return true
    }
    return false
  }

  /**
   * 从目录移除媒体
   * @param mediaId 媒体ID
   * @param dirId 目录ID
   * @param updateRefCount 是否更新引用计数，默认为true。剪切/拖拽移动时应设为false
   */
  function removeMediaFromDirectory(
    mediaId: string,
    dirId: string,
    updateRefCount: boolean = true,
  ): boolean {
    const dir = directories.value.get(dirId)
    if (!dir) return false

    const index = dir.mediaItemIds.indexOf(mediaId)
    if (index > -1) {
      dir.mediaItemIds.splice(index, 1)

      // 🆕 减少引用计数（仅在需要时）
      if (updateRefCount) {
        const mediaItem = mediaModule.getMediaItem(mediaId)
        if (mediaItem && mediaItem.runtime.refCount !== undefined) {
          mediaItem.runtime.refCount--

          // 如果引用计数降为0，记录日志
          if (mediaItem.runtime.refCount === 0) {
            console.warn(
              `⚠️ [removeMediaFromDirectory] 素材引用计数为0: ${mediaItem.name}，可以删除`,
            )
          } else {
            console.log(
              `📊 [removeMediaFromDirectory] 素材 ${mediaItem.name} 引用计数: ${mediaItem.runtime.refCount}`,
            )
          }
        }
      }

      return true
    }
    return false
  }

  /**
   * 获取目录内容（返回 DisplayItem[]）
   */
  function getDirectoryContent(dirId: string): DisplayItem[] {
    const dir = directories.value.get(dirId)
    if (!dir) return []

    const items: DisplayItem[] = []

    // 添加子目录
    dir.childDirIds.forEach((childDirId) => {
      items.push({
        id: childDirId,
        type: 'directory',
      })
    })

    // 添加媒体项
    dir.mediaItemIds.forEach((mediaId) => {
      items.push({
        id: mediaId,
        type: 'media',
      })
    })

    return items
  }

  /**
   * 通过 parentId 链计算面包屑路径
   */
  function getBreadcrumb(dirId: string): VirtualDirectory[] {
    const breadcrumb: VirtualDirectory[] = []
    let currentId: string | null = dirId

    while (currentId) {
      const dir = directories.value.get(currentId)
      if (!dir) break

      breadcrumb.unshift(dir)
      currentId = dir.parentId
    }

    return breadcrumb
  }

  /**
   * 打开新标签页
   * @param dirId 目录ID
   * @param switchToNewTab 是否切换到新标签页，默认为 true
   */
  function openTab(dirId: string, switchToNewTab: boolean = false): DisplayTab {
    const newTab: DisplayTab = {
      id: generateTabId(),
      dirId,
    }

    openTabs.value.push(newTab)

    // 如果这是第一个标签页，或者明确要求切换，设置为活动标签页
    if (openTabs.value.length === 1 || switchToNewTab) {
      activeTabId.value = newTab.id
    }

    return newTab
  }

  /**
   * 关闭标签页
   */
  function closeTab(tabId: string): boolean {
    const tabIndex = openTabs.value.findIndex((tab) => tab.id === tabId)
    if (tabIndex === -1) return false

    // 如果只有一个标签页，不允许关闭
    if (openTabs.value.length === 1) {
      return false
    }

    // 如果关闭的是当前活动标签页，需要切换到其他标签页
    if (activeTabId.value === tabId) {
      // 优先切换到下一个标签页，如果没有则切换到上一个
      const nextTab = openTabs.value[tabIndex + 1] || openTabs.value[tabIndex - 1]
      if (nextTab) {
        activeTabId.value = nextTab.id
      }
    }

    openTabs.value.splice(tabIndex, 1)
    return true
  }

  /**
   * 启动目录中 pending 状态的媒体
   * 包括当前目录的媒体项和角色类型子文件夹中的媒体项
   */
  function startPendingMediaInDirectory(dirId: string): void {
    const dir = directories.value.get(dirId)
    if (!dir || !mediaModule) return

    let startedCount = 0

    // 处理当前目录的媒体项
    dir.mediaItemIds.forEach((mediaId) => {
      const mediaItem = mediaModule.getMediaItem(mediaId)
      if (mediaItem?.mediaStatus === 'pending') {
        mediaModule.startMediaProcessing(mediaItem)
        startedCount++
      }
    })

    // 处理角色类型子文件夹中的媒体项
    dir.childDirIds.forEach((childDirId) => {
      const childDir = directories.value.get(childDirId)
      if (childDir && isCharacterDirectory(childDir)) {
        childDir.mediaItemIds.forEach((mediaId) => {
          const mediaItem = mediaModule.getMediaItem(mediaId)
          if (mediaItem?.mediaStatus === 'pending') {
            mediaModule.startMediaProcessing(mediaItem)
            startedCount++
          }
        })
      }
    })

    if (startedCount > 0) {
      console.log(`🚀 [DirectoryModule] 启动了 ${startedCount} 个延迟加载的媒体`)
    }
  }

  /**
   * 在当前标签页导航到指定目录（修改 activeTab.dirId）
   */
  function navigateToDir(dirId: string): boolean {
    if (!activeTab.value) return false

    const targetDir = directories.value.get(dirId)
    if (!targetDir) return false

    activeTab.value.dirId = dirId

    // 启动该目录中 pending 状态的媒体
    startPendingMediaInDirectory(dirId)

    return true
  }

  /**
   * 切换到指定标签页
   */
  function switchTab(tabId: string): boolean {
    const tab = openTabs.value.find((t) => t.id === tabId)
    if (!tab) return false

    activeTabId.value = tabId

    // 启动目标目录中 pending 状态的媒体
    startPendingMediaInDirectory(tab.dirId)

    return true
  }

  /**
   * 初始化根目录
   */
  function initializeRootDirectory(): VirtualDirectory {
    // 检查是否已存在根目录
    const existingRoot = Array.from(directories.value.values()).find((dir) => dir.parentId === null)
    if (existingRoot) {
      return existingRoot
    }

    // 创建根目录
    const rootDir = createDirectory('root', null)

    // 打开根目录标签页
    openTab(rootDir.id)

    return rootDir
  }

  /**
   * 获取所有目录（用于调试和管理）
   */
  function getAllDirectories(): VirtualDirectory[] {
    return Array.from(directories.value.values())
  }

  /**
   * 重置目录状态
   */
  function resetDirectories(): void {
    directories.value.clear()
    openTabs.value.length = 0
    activeTabId.value = ''
  }

  /**
   * 获取目录统计信息
   */
  function getDirectorySummary() {
    return {
      totalDirectories: directories.value.size,
      openTabsCount: openTabs.value.length,
      activeTabId: activeTabId.value,
      currentDirId: currentDir.value?.id || null,
      currentDirName: currentDir.value?.name || null,
    }
  }

  // ==================== 剪贴板方法 ====================

  /**
   * 检查目录A是否是目录B的子孙目录
   */
  function isDescendantOf(dirA: string, dirB: string): boolean {
    let current = getDirectory(dirA)
    while (current) {
      if (current.parentId === dirB) return true
      if (!current.parentId) break
      current = getDirectory(current.parentId)
    }
    return false
  }

  // ==================== 拖拽专用方法 ====================

  /**
   * 检查是否可以将文件夹拖拽到目标文件夹
   * @param sourceFolderId 源文件夹ID
   * @param targetFolderId 目标文件夹ID
   * @returns 是否可以拖拽
   */
  function canDragToFolder(sourceFolderId: string, targetFolderId: string): boolean {
    // 不能拖拽到自己
    if (sourceFolderId === targetFolderId) {
      return false
    }

    // 不能拖拽到子文件夹（防止循环引用）
    if (isDescendantOf(targetFolderId, sourceFolderId)) {
      return false
    }

    return true
  }

  /**
   * 拖拽移动媒体项到目标文件夹
   * @param mediaItemIds 媒体项ID列表
   * @param sourceFolderId 源文件夹ID（可能为null）
   * @param targetFolderId 目标文件夹ID
   */
  async function dragMoveMediaItems(
    mediaItemIds: string[],
    sourceFolderId: string | null,
    targetFolderId: string,
  ): Promise<void> {
    // 从源文件夹移除（不更新引用计数，因为是移动操作）
    if (sourceFolderId) {
      for (const mediaId of mediaItemIds) {
        removeMediaFromDirectory(mediaId, sourceFolderId, false)
      }
    }

    // 添加到目标文件夹（不更新引用计数，因为是移动操作）
    for (const mediaId of mediaItemIds) {
      addMediaToDirectory(mediaId, targetFolderId, false)
    }

    console.log(`✅ 拖拽移动 ${mediaItemIds.length} 个媒体项到文件夹 ${targetFolderId}`)
  }

  /**
   * 拖拽移动文件夹到目标文件夹
   * @param folderId 要移动的文件夹ID
   * @param targetFolderId 目标父文件夹ID
   */
  async function dragMoveFolder(folderId: string, targetFolderId: string): Promise<void> {
    // 验证是否可以移动
    if (!canDragToFolder(folderId, targetFolderId)) {
      throw new Error('不能将文件夹拖拽到此位置')
    }

    const folder = getDirectory(folderId)
    if (!folder) {
      throw new Error('源文件夹不存在')
    }

    // 从原父文件夹移除
    if (folder.parentId) {
      const parentDir = getDirectory(folder.parentId)
      if (parentDir) {
        const index = parentDir.childDirIds.indexOf(folderId)
        if (index > -1) {
          parentDir.childDirIds.splice(index, 1)
        }
      }
    }

    // 更新父文件夹
    folder.parentId = targetFolderId

    // 添加到目标文件夹
    const targetDir = getDirectory(targetFolderId)
    if (targetDir) {
      targetDir.childDirIds.push(folderId)
    }

    console.log(`✅ 拖拽移动文件夹 ${folderId} 到 ${targetFolderId}`)
  }

  /**
   * 剪切项目
   */
  function cut(items: DisplayItem[]): void {
    if (items.length === 0) return

    // 构建剪贴板项目
    const clipboardItems: ClipboardItem[] = items.map((item) => ({
      id: item.id,
      type: item.type,
    }))

    // 更新剪贴板状态
    clipboardState.value = {
      operation: ClipboardOp.CUT,
      items: clipboardItems,
      sourceDirId: currentDir.value?.id || null,
      timestamp: Date.now(),
    }

    console.log(`✂️ 剪切 ${items.length} 个项目`)
  }

  /**
   * 复制项目
   */
  function copy(items: DisplayItem[]): void {
    if (items.length === 0) return

    // 构建剪贴板项目
    const clipboardItems: ClipboardItem[] = items.map((item) => ({
      id: item.id,
      type: item.type,
    }))

    // 更新剪贴板状态
    clipboardState.value = {
      operation: ClipboardOp.COPY,
      items: clipboardItems,
      sourceDirId: currentDir.value?.id || null,
      timestamp: Date.now(),
    }

    console.log(`📋 复制 ${items.length} 个项目`)
  }

  /**
   * 检查是否可以粘贴到目标目录
   * ❌ 不能粘贴到来源目录（剪切和复制都不允许）
   * ❌ 不能粘贴目录到自己
   * ❌ 不能粘贴目录到子目录（防止循环引用）
   * ✅ 可以粘贴到其他任何目录
   */
  function canPaste(targetDirId: string): boolean {
    // 剪贴板为空
    if (clipboardState.value.items.length === 0) return false

    // 不能粘贴到来源目录
    if (clipboardState.value.sourceDirId === targetDirId) {
      return false
    }

    // 检查是否粘贴到自己或子目录（防止循环）
    for (const item of clipboardState.value.items) {
      if (item.type === 'directory') {
        if (item.id === targetDirId) {
          return false // 不能粘贴到自己
        }
        if (isDescendantOf(targetDirId, item.id)) {
          return false // 不能粘贴到子目录
        }
      }
    }

    return true
  }

  /**
   * 移动项目（剪切操作）
   */
  async function moveItem(item: ClipboardItem, targetDirId: string): Promise<void> {
    if (item.type === 'directory') {
      // 移动目录
      const dir = getDirectory(item.id)
      if (!dir) throw new Error('目录不存在')

      // 从原父目录移除
      if (dir.parentId) {
        const parentDir = getDirectory(dir.parentId)
        if (parentDir) {
          const index = parentDir.childDirIds.indexOf(item.id)
          if (index > -1) {
            parentDir.childDirIds.splice(index, 1)
          }
        }
      }

      // 更新目录的父目录
      dir.parentId = targetDirId

      // 添加到目标目录
      const targetDir = getDirectory(targetDirId)
      if (targetDir) {
        targetDir.childDirIds.push(item.id)
      }
    } else {
      // 移动媒体项（不更新引用计数，因为是剪切移动操作）
      // 从原目录移除
      if (clipboardState.value.sourceDirId) {
        removeMediaFromDirectory(item.id, clipboardState.value.sourceDirId, false)
      }

      // 添加到目标目录
      addMediaToDirectory(item.id, targetDirId, false)
    }
  }

  /**
   * 递归复制目录
   */
  async function copyDirectoryRecursive(
    sourceDirId: string,
    targetParentId: string,
    newName: string,
  ): Promise<string> {
    const sourceDir = getDirectory(sourceDirId)
    if (!sourceDir) throw new Error('源目录不存在')

    // 创建新目录
    const newDir = createDirectory(newName, targetParentId)

    // 复制子目录
    for (const childDirId of sourceDir.childDirIds) {
      const childDir = getDirectory(childDirId)
      if (childDir) {
        await copyDirectoryRecursive(childDirId, newDir.id, childDir.name)
      }
    }

    // 复制媒体项
    for (const mediaId of sourceDir.mediaItemIds) {
      await copyItem({ id: mediaId, type: 'media' }, newDir.id)
    }

    return newDir.id
  }

  /**
   * 复制项目（复制操作）
   */
  async function copyItem(item: ClipboardItem, targetDirId: string): Promise<void> {
    if (item.type === 'directory') {
      // 复制目录（递归复制所有子项）
      const sourceDir = getDirectory(item.id)
      const dirName = sourceDir?.name || 'untitled'
      await copyDirectoryRecursive(item.id, targetDirId, dirName)
    } else {
      // 复制媒体项（只复制引用）
      // 注意：这里需要访问 unifiedStore 的媒体数据
      // 暂时只复制引用到目标目录
      addMediaToDirectory(item.id, targetDirId)
    }
  }

  /**
   * 粘贴到目标目录
   */
  async function paste(targetDirId: string): Promise<PasteResult> {
    if (!canPaste(targetDirId)) {
      return {
        success: false,
        successCount: 0,
        failedCount: 0,
        errors: [
          {
            itemId: '',
            error: '无法粘贴到此位置',
          },
        ],
      }
    }

    const result: PasteResult = {
      success: true,
      successCount: 0,
      failedCount: 0,
      errors: [],
    }

    // 获取目标目录
    const targetDir = getDirectory(targetDirId)
    if (!targetDir) {
      result.success = false
      result.errors.push({
        itemId: targetDirId,
        error: '目标目录不存在',
      })
      return result
    }

    // 处理每个剪贴板项目
    for (const clipItem of clipboardState.value.items) {
      try {
        // 根据操作类型执行不同逻辑
        if (clipboardState.value.operation === ClipboardOp.CUT) {
          // 剪切：移动项目
          await moveItem(clipItem, targetDirId)
        } else {
          // 复制：复制项目
          await copyItem(clipItem, targetDirId)
        }

        result.successCount++
      } catch (error) {
        result.failedCount++
        result.errors.push({
          itemId: clipItem.id,
          error: error instanceof Error ? error.message : '未知错误',
        })
      }
    }

    // 粘贴成功后，无论是剪切还是复制，都清空剪贴板
    clearClipboard()

    result.success = result.failedCount === 0

    console.log(`📌 粘贴完成: 成功 ${result.successCount}, 失败 ${result.failedCount}`)
    return result
  }

  /**
   * 清空剪贴板
   */
  function clearClipboard(): void {
    clipboardState.value = {
      operation: null,
      items: [],
      sourceDirId: null,
      timestamp: 0,
    }
  }

  /**
   * 设置视图模式
   */
  function setViewMode(mode: ViewMode): void {
    viewMode.value = mode
  }

  /**
   * 设置排序方式
   */
  function setSortBy(newSortBy: SortBy): void {
    if (sortBy.value === newSortBy) {
      // 如果点击相同的排序方式，切换升序/降序
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      // 如果是新的排序方式，默认升序
      sortBy.value = newSortBy
      sortOrder.value = 'asc'
    }
  }

  /**
   * 设置排序顺序
   */
  function setSortOrder(order: SortOrder): void {
    sortOrder.value = order
  }

  /**
   * 从项目设置恢复目录状态
   * @param directoryConfig 目录配置数据，如果为 null 则初始化默认目录
   */
  function restoreFromProjectSettings(directoryConfig: UnifiedDirectoryConfig | null): void {
    try {
      // 如果配置为 null，初始化默认目录
      if (!directoryConfig) {
        console.log(`📄 目录配置不存在，初始化默认目录`)
        resetDirectories()
        initializeRootDirectory()
        return
      }

      console.log(`📂 从配置恢复目录状态`)

      // 清空现有状态
      resetDirectories()

      // 恢复目录列表
      const dirMap = new Map<string, VirtualDirectory>()
      directoryConfig.directories.forEach((dir) => {
        dirMap.set(dir.id, dir)
      })
      directories.value = dirMap

      // 恢复标签页状态
      openTabs.value = directoryConfig.openTabs || []
      activeTabId.value = directoryConfig.activeTabId || ''

      // 恢复视图和排序设置
      if (directoryConfig.viewMode) {
        viewMode.value = directoryConfig.viewMode
      }
      if (directoryConfig.sortBy) {
        sortBy.value = directoryConfig.sortBy
      }
      if (directoryConfig.sortOrder) {
        sortOrder.value = directoryConfig.sortOrder
      }

      console.log(
        `✅ 目录状态恢复成功: ${directories.value.size} 个目录, ${openTabs.value.length} 个标签页`,
      )
    } catch (error) {
      console.error(`❌ 恢复目录状态失败`, error)
      // 恢复失败时初始化默认状态
      resetDirectories()
      initializeRootDirectory()
    }
  }

  /**
   * 删除文件夹（递归删除所有子文件夹和引用计数为0的素材）
   */
  async function deleteDirectory(dirId: string): Promise<{
    success: boolean
    deletedMediaIds: string[]
    error?: string
  }> {
    const dir = directories.value.get(dirId)
    if (!dir) {
      return { success: false, deletedMediaIds: [], error: '文件夹不存在' }
    }

    // 不允许删除根目录
    if (dir.parentId === null) {
      return { success: false, deletedMediaIds: [], error: '不能删除根目录' }
    }

    const deletedMediaIds: string[] = []

    try {
      // 步骤1: 收集所有需要删除的子文件夹（使用广度优先遍历）
      const dirsToDelete: string[] = [dirId]
      const allMediaIds = new Set<string>()

      let index = 0
      while (index < dirsToDelete.length) {
        const currentDirId = dirsToDelete[index]
        const currentDir = directories.value.get(currentDirId)

        if (currentDir) {
          // 收集子文件夹
          dirsToDelete.push(...currentDir.childDirIds)

          // 收集媒体项
          currentDir.mediaItemIds.forEach((mediaId) => allMediaIds.add(mediaId))
        }

        index++
      }

      console.log(`📊 [deleteDirectory] 收集完成:`, {
        totalDirs: dirsToDelete.length,
        totalMedia: allMediaIds.size,
        dirs: dirsToDelete,
        media: Array.from(allMediaIds),
      })

      // 步骤2: 从所有文件夹中移除媒体项（更新引用计数）
      for (const currentDirId of dirsToDelete) {
        const currentDir = directories.value.get(currentDirId)
        if (currentDir) {
          const mediaIds = [...currentDir.mediaItemIds]
          for (const mediaId of mediaIds) {
            removeMediaFromDirectory(mediaId, currentDirId)
          }
        }
      }

      // 步骤3: 检查并删除引用计数为0的素材
      for (const mediaId of allMediaIds) {
        const mediaItem = mediaModule.getMediaItem(mediaId)
        if (mediaItem && mediaItem.runtime.refCount === 0) {
          console.log(`🗑️ [deleteDirectory] 删除引用计数为0的素材: ${mediaItem.name}`)
          await mediaModule.removeMediaItem(mediaId)
          deletedMediaIds.push(mediaId)
        }
      }

      // 步骤4: 从父文件夹中移除根文件夹
      if (dir.parentId) {
        const parentDir = directories.value.get(dir.parentId)
        if (parentDir) {
          const index = parentDir.childDirIds.indexOf(dirId)
          if (index > -1) {
            parentDir.childDirIds.splice(index, 1)
          }
        }
      }

      // 步骤5: 关闭显示被删除文件夹的标签页
      const tabsToClose: string[] = []
      for (const tab of openTabs.value) {
        if (dirsToDelete.includes(tab.dirId)) {
          tabsToClose.push(tab.id)
        }
      }

      // 关闭所有相关标签页
      for (const tabId of tabsToClose) {
        closeTab(tabId)
      }

      console.log(`🗂️ [deleteDirectory] 关闭了 ${tabsToClose.length} 个标签页`)

      // 步骤6: 删除所有收集到的文件夹（从子到父的顺序）
      for (let i = dirsToDelete.length - 1; i >= 0; i--) {
        directories.value.delete(dirsToDelete[i])
      }

      console.log(`✅ [deleteDirectory] 文件夹删除成功: ${dir.name}`, {
        deletedDirCount: dirsToDelete.length,
        deletedMediaCount: deletedMediaIds.length,
        deletedMediaIds,
      })

      return { success: true, deletedMediaIds }
    } catch (error) {
      console.error(`❌ [deleteDirectory] 删除文件夹失败: ${dir.name}`, error)
      return {
        success: false,
        deletedMediaIds,
        error: error instanceof Error ? error.message : '未知错误',
      }
    }
  }

  /**
   * 删除媒体项（从指定目录移除，如果引用计数为0则删除文件）
   */
  async function deleteMediaItem(
    mediaId: string,
    dirId: string,
  ): Promise<{
    success: boolean
    deletedFile: boolean
    error?: string
  }> {
    const dir = directories.value.get(dirId)
    if (!dir) {
      return { success: false, deletedFile: false, error: '目录不存在' }
    }

    const mediaItem = mediaModule.getMediaItem(mediaId)

    try {
      // 如果媒体项不存在，直接从目录移除该无效引用（不更新引用计数）
      if (!mediaItem) {
        console.warn(`⚠️ [deleteMediaItem] 媒体项不存在，从目录移除无效引用: ${mediaId}`)
        const removed = removeMediaFromDirectory(mediaId, dirId, false)
        if (removed) {
          console.log(`✅ [deleteMediaItem] 已从目录移除无效引用: ${mediaId}`)
          return { success: true, deletedFile: false }
        }
        return { success: false, deletedFile: false, error: '媒体项不在该目录中' }
      }

      // 步骤1: 从目录移除（会自动减少引用计数）
      const removed = removeMediaFromDirectory(mediaId, dirId)
      if (!removed) {
        return { success: false, deletedFile: false, error: '媒体项不在该目录中' }
      }

      // 步骤2: 检查引用计数，如果为0则删除素材文件
      const updatedMediaItem = mediaModule.getMediaItem(mediaId)
      let deletedFile = false

      if (updatedMediaItem && updatedMediaItem.runtime.refCount === 0) {
        console.log(`🗑️ [deleteMediaItem] 删除引用计数为0的素材: ${mediaItem.name}`)
        await mediaModule.removeMediaItem(mediaId)
        deletedFile = true
      }

      console.log(`✅ [deleteMediaItem] 媒体项删除成功: ${mediaItem.name}`, {
        deletedFile,
        remainingRefCount: updatedMediaItem?.runtime.refCount || 0,
      })

      return { success: true, deletedFile }
    } catch (error) {
      console.error(`❌ [deleteMediaItem] 删除媒体项失败: ${mediaItem?.name || mediaId}`, error)
      return {
        success: false,
        deletedFile: false,
        error: error instanceof Error ? error.message : '未知错误',
      }
    }
  }

  // ==================== 返回接口 ====================

  return {
    // 状态
    directories,
    openTabs,
    activeTabId,

    // 计算属性
    activeTab,
    currentDir,

    // 核心方法
    createDirectory,
    createCharacterDirectory, // 🆕 新增创建角色文件夹方法
    renameDirectory,
    getDirectory,
    getCharacterDirectory, // 🆕 新增获取角色文件夹方法
    isCharacterDirectory, // 🆕 新增类型守卫方法
    addMediaToDirectory,
    removeMediaFromDirectory,
    getDirectoryContent,
    getBreadcrumb,
    openTab,
    closeTab,
    navigateToDir,
    switchTab,
    deleteDirectory, // 🆕 新增删除文件夹方法
    deleteMediaItem, // 🆕 新增删除媒体项方法

    // 初始化和管理方法
    initializeRootDirectory,
    getAllDirectories,
    resetDirectories,
    getDirectorySummary,
    restoreFromProjectSettings,

    // 剪贴板操作
    clipboardState,
    cut,
    copy,
    paste,
    canPaste,
    clearClipboard,

    // 拖拽专用方法
    canDragToFolder,
    dragMoveMediaItems,
    dragMoveFolder,
    isDescendantOf,

    // 视图和排序状态
    viewMode,
    sortBy,
    sortOrder,
    setViewMode,
    setSortBy,
    setSortOrder,
  }
}

/**
 * 重新导出所有类型
 */
export type {
  VirtualDirectory,
  DisplayTab,
  DisplayItem,
  DirectoryNavigationState,
  ClipboardState,
  ClipboardItem,
  PasteResult,
  PasteError,
  ViewMode,
  SortBy,
  SortOrder,
  UnifiedDirectoryConfig,
  DirectoryType,
} from '@/core/directory/types'

// 导出枚举（不使用 type）
export { ClipboardOperation } from '@/core/directory/types'

/**
 * 导出模块类型
 */
export type UnifiedDirectoryModule = ReturnType<typeof createUnifiedDirectoryModule>
