import { fileSystemService } from '@/core/managers/filesystem/fileSystemService'
import type { MediaMetaFile } from '@/core/project/metaTypes'
import type { UnifiedMediaItemData, MediaType, MediaStatus } from '@/core/mediaitem/types'
import { getMediaPath, getMetaPath } from '@/core/utils/mediaPathUtils'
import { extractSourceData } from '@/core/datasource/core/DataSourceTypes'

/**
 * 媒体保存结果接口
 */
export interface MediaSaveResult {
  success: boolean
  mediaId?: string
  storagePath?: string
  isReused?: boolean
  error?: string
}

/**
 * 全局Meta文件管理器
 * 统一管理媒体文件 + Meta文件的完整生命周期
 *
 * 核心职责：
 * 1. 媒体文件管理：保存、加载、验证
 * 2. Meta文件管理：保存、读取、扫描
 * 3. 项目初始化：扫描媒体文件
 */
class GlobalMetaFileManager {
  private projectId: string = ''

  /**
   * 初始化管理器
   * @param projectId 项目ID
   */
  async initialize(projectId: string): Promise<void> {
    this.projectId = projectId
    console.log(`🔧 [globalMetaFileManager] 初始化: ${projectId}`)
  }

  /**
   * 获取当前项目ID
   */
  get currentProjectId(): string {
    return this.projectId
  }

  // ==================== 媒体文件操作 ====================

  /**
   * 保存媒体文件到项目
   * @param file 媒体文件
   * @param id 媒体ID（格式：{nanoid}.{ext}）
   * @returns 是否成功
   */
  async saveMediaFile(file: File, id: string): Promise<boolean> {
    try {
      console.log(`💾 [globalMetaFileManager] 保存媒体文件: ${id}`)

      // 检查工作空间权限
      const permissionResult = await fileSystemService.checkPermission()
      if (!permissionResult.hasAccess) throw new Error('未设置工作目录')

      // 确保 media 目录存在
      const mediaDirPath = fileSystemService.paths.getMediaDirPath(this.projectId)
      const mediaDirExists = await fileSystemService.directoryExists(mediaDirPath)
      if (!mediaDirExists) {
        await fileSystemService.createDirectory(mediaDirPath)
      }

      // 保存文件
      const mediaPath = fileSystemService.paths.getMediaPath(this.projectId, id)
      await fileSystemService.writeFile(mediaPath, file)

      console.log(`✅ [globalMetaFileManager] 媒体文件保存成功: ${id}`)
      return true
    } catch (error) {
      console.error(`❌ [globalMetaFileManager] 媒体文件保存失败: ${id}`, error)
      return false
    }
  }

  /**
   * 获取媒体文件句柄
   * @param id 媒体ID（格式：{nanoid}.{ext}）
   * @returns 文件句柄
   */
  /**
   * 从项目加载媒体文件
   * @param id 媒体ID（格式：{nanoid}.{ext}）
   * @returns 媒体文件
   */
  async loadMediaFile(id: string): Promise<File> {
    try {
      const mediaPath = fileSystemService.paths.getMediaPath(this.projectId, id)
      const blob = await fileSystemService.readFileAsBlob(mediaPath)
      const file = new File([blob], id, { type: blob.type })

      console.log(`📂 [globalMetaFileManager] 媒体文件加载成功: ${id}`)
      return file
    } catch (error) {
      console.error(`❌ [globalMetaFileManager] 媒体文件加载失败: ${id}`, error)
      throw new Error(`加载媒体文件失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 验证媒体文件是否存在
   * @param id 媒体ID
   * @returns 是否存在
   */
  async verifyMediaFileExists(id: string): Promise<boolean> {
    try {
      const mediaPath = fileSystemService.paths.getMediaPath(this.projectId, id)
      return await fileSystemService.fileExists(mediaPath)
    } catch {
      return false
    }
  }

  /**
   * 验证Meta文件是否存在
   * @param id 媒体ID
   * @returns 是否存在
   */
  async verifyMetaFileExists(id: string): Promise<boolean> {
    try {
      const metaPath = fileSystemService.paths.getMetaPath(this.projectId, id)
      return await fileSystemService.fileExists(metaPath)
    } catch {
      return false
    }
  }

  // ==================== Meta文件操作 ====================

  /**
   * 保存 Meta 文件
   * @param mediaItem 媒体项目数据
   * @returns 是否成功
   */
  async saveMetaFile(mediaItem: UnifiedMediaItemData): Promise<boolean> {
    try {
      console.log(`💾 [globalMetaFileManager] 保存 Meta 文件: ${mediaItem.id}`)

      // 定义终态列表
      const terminalStatuses: MediaStatus[] = ['ready', 'error', 'cancelled', 'missing']

      // 1. 提取持久化数据
      const metaData: MediaMetaFile = {
        version: '1.0.0',
        id: mediaItem.id,
        name: mediaItem.name,
        createdAt: mediaItem.createdAt,
        mediaType: mediaItem.mediaType,
        source: extractSourceData(mediaItem.source),
        duration: mediaItem.duration,
        // 🌟 只在终态时保存 mediaStatus
        ...(terminalStatuses.includes(mediaItem.mediaStatus) && {
          mediaStatus: mediaItem.mediaStatus as 'ready' | 'error' | 'cancelled' | 'missing'
        })
      }

      // 2. 检查工作空间权限
      const permissionResult = await fileSystemService.checkPermission()
      if (!permissionResult.hasAccess) throw new Error('未设置工作目录')

      // 3. 确保 media 目录存在
      const mediaDirPath = fileSystemService.paths.getMediaDirPath(this.projectId)
      const mediaDirExists = await fileSystemService.directoryExists(mediaDirPath)
      if (!mediaDirExists) {
        await fileSystemService.createDirectory(mediaDirPath)
      }

      // 4. 写入 meta 文件
      const metaPath = fileSystemService.paths.getMetaPath(this.projectId, mediaItem.id)
      await fileSystemService.writeFile(metaPath, JSON.stringify(metaData, null, 2))

      console.log(`✅ [globalMetaFileManager] Meta 文件保存成功: ${mediaItem.id}.meta`)
      return true
    } catch (error) {
      console.error(`❌ [globalMetaFileManager] Meta 文件保存失败: ${mediaItem.id}`, error)
      return false
    }
  }

  /**
   * 读取 Meta 文件
   * @param id Meta 文件 ID（如 "V1StGXR8_Z5j.mp4"）
   * @returns Meta 文件数据
   */
  async readMetaFile(id: string): Promise<MediaMetaFile | null> {
    try {
      const metaPath = fileSystemService.paths.getMetaPath(this.projectId, id)
      const content = await fileSystemService.readFile(metaPath)
      return JSON.parse(content) as MediaMetaFile
    } catch (error) {
      console.error(`❌ [globalMetaFileManager] 读取 Meta 文件失败: ${id}`, error)
      return null
    }
  }

  /**
   * 扫描所有 Meta 文件
   * @returns Meta 文件数组
   */
  async scanAllMetaFiles(): Promise<MediaMetaFile[]> {
    try {
      const mediaDirPath = fileSystemService.paths.getMediaDirPath(this.projectId)
      const entries = await fileSystemService.listDirectory(mediaDirPath)

      const metaFiles: MediaMetaFile[] = []

      for (const entry of entries) {
        if (entry.kind === 'file' && entry.name.endsWith('.meta')) {
          try {
            const content = await fileSystemService.readFile(entry.path)
            const metaData = JSON.parse(content) as MediaMetaFile
            metaFiles.push(metaData)
          } catch (error) {
            console.warn(`⚠️ [globalMetaFileManager] 解析 Meta 文件失败: ${entry.name}`, error)
          }
        }
      }

      console.log(`📄 [globalMetaFileManager] 扫描到 ${metaFiles.length} 个 Meta 文件`)
      return metaFiles
    } catch (error) {
      console.error('❌ [globalMetaFileManager] 扫描 Meta 文件失败:', error)
      return []
    }
  }

  // ==================== 完整保存流程 ====================

  /**
   * 保存媒体到项目（媒体文件 + Meta文件）
   * 这是导入流程的核心方法，完成文件保存和元数据生成
   *
   * @param mediaItem 媒体项目数据（元数据已在外部设置好）
   * @param file 文件对象（必需）
   * @returns 保存结果
   */
  async saveMediaToProject(mediaItem: UnifiedMediaItemData, file: File): Promise<MediaSaveResult> {
    try {
      if (!file) {
        throw new Error('媒体项目缺少文件数据')
      }
      
      const targetFile = file

      console.log(`💾 [globalMetaFileManager] 开始保存媒体到项目: ${targetFile.name}`)

      // 1. 保存媒体文件到 media/{id}
      const saveFileSuccess = await this.saveMediaFile(targetFile, mediaItem.id)
      if (!saveFileSuccess) {
        throw new Error('保存媒体文件失败')
      }

      // 2. 保存 Meta 文件到 media/{id}.meta
      const saveMetaSuccess = await this.saveMetaFile(mediaItem)
      if (!saveMetaSuccess) {
        console.warn(`⚠️ [globalMetaFileManager] Meta 文件保存失败，但媒体文件已保存`)
      }

      console.log(`✅ [globalMetaFileManager] 媒体保存成功: ${targetFile.name} -> ${mediaItem.id}`)

      return {
        success: true,
        mediaId: mediaItem.id,
        storagePath: getMediaPath(mediaItem.id),
        isReused: false,
      }
    } catch (error) {
      console.error(`❌ [globalMetaFileManager] 保存媒体失败: ${mediaItem.name}`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 删除媒体文件和Meta文件
   * @param id 媒体ID（格式：{nanoid}.{ext}）
   * @returns 删除结果
   */
  async deleteMediaFiles(id: string): Promise<{
    success: boolean
    deletedMedia: boolean
    deletedMeta: boolean
    error?: string
  }> {
    try {
      console.log(`🗑️ [globalMetaFileManager] 开始删除媒体文件: ${id}`)

      let deletedMedia = false
      let deletedMeta = false

      // 1. 删除媒体文件
      try {
        const mediaPath = fileSystemService.paths.getMediaPath(this.projectId, id)
        const mediaExists = await fileSystemService.fileExists(mediaPath)

        if (mediaExists) {
          await fileSystemService.deleteFile(mediaPath)
          deletedMedia = true
          console.log(`✅ [globalMetaFileManager] 媒体文件已删除: ${id}`)
        } else {
          console.warn(`⚠️ [globalMetaFileManager] 媒体文件不存在: ${id}`)
        }
      } catch (error) {
        console.error(`❌ [globalMetaFileManager] 删除媒体文件失败: ${id}`, error)
        // 继续尝试删除meta文件
      }

      // 2. 删除Meta文件
      try {
        const metaPath = fileSystemService.paths.getMetaPath(this.projectId, id)
        const metaExists = await fileSystemService.fileExists(metaPath)

        if (metaExists) {
          await fileSystemService.deleteFile(metaPath)
          deletedMeta = true
          console.log(`✅ [globalMetaFileManager] Meta文件已删除: ${id}.meta`)
        } else {
          console.warn(`⚠️ [globalMetaFileManager] Meta文件不存在: ${id}.meta`)
        }
      } catch (error) {
        console.error(`❌ [globalMetaFileManager] 删除Meta文件失败: ${id}.meta`, error)
      }

      // 3. 返回结果
      const success = deletedMedia || deletedMeta

      if (success) {
        console.log(`✅ [globalMetaFileManager] 媒体文件删除完成: ${id}`)
      } else {
        console.warn(`⚠️ [globalMetaFileManager] 没有文件被删除: ${id}`)
      }

      return {
        success,
        deletedMedia,
        deletedMeta,
      }
    } catch (error) {
      console.error(`❌ [globalMetaFileManager] 删除媒体文件失败: ${id}`, error)
      return {
        success: false,
        deletedMedia: false,
        deletedMeta: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  // ==================== 辅助方法 ====================
}

// 导出全局实例
export const globalMetaFileManager = new GlobalMetaFileManager()
