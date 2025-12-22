import { fileSystemService } from '@/core/managers/filesystem/fileSystemService'
import type { UnifiedProjectConfig, UnifiedProjectTimeline } from '@/core/project'
import { createUnifiedTrackData } from '@/core/track'
import type { UnifiedTrackData } from '@/core/track'
import { i18n } from '@/locales'

/**
 * 统一项目管理器
 * 专注于多项目管理：项目列表、创建、删除等操作
 * 不涉及单个项目的编辑操作（由UnifiedProjectModule处理）
 */
export class UnifiedProjectManager {
  private static instance: UnifiedProjectManager
  private readonly PROJECTS_FOLDER = 'projects'

  private constructor() {}

  static getInstance(): UnifiedProjectManager {
    if (!UnifiedProjectManager.instance) {
      UnifiedProjectManager.instance = new UnifiedProjectManager()
    }
    return UnifiedProjectManager.instance
  }

  /**
   * 扫描并获取所有项目列表
   */
  async listProjects(): Promise<UnifiedProjectConfig[]> {
    // 检查工作空间权限
    const permissionResult = await fileSystemService.checkPermission()
    if (!permissionResult.hasAccess) {
      throw new Error('未设置工作目录')
    }

    try {
      // 确保projects文件夹存在
      await this.ensureProjectsFolder()

      const projects: UnifiedProjectConfig[] = []

      // 列出projects文件夹中的所有条目
      const entries = await fileSystemService.listDirectory(this.PROJECTS_FOLDER)

      // 遍历所有子文件夹
      for (const entry of entries) {
        if (entry.kind === 'directory') {
          try {
            const projectConfig = await this.loadProjectJson(entry.name)
            if (projectConfig) {
              projects.push(projectConfig)
            }
          } catch (error) {
            console.warn(`加载项目 ${entry.name} 失败:`, error)
          }
        }
      }

      // 按更新时间排序
      projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      return projects
    } catch (error) {
      console.error('扫描项目列表失败:', error)
      throw error
    }
  }

  /**
   * 创建默认轨道
   */
  private createDefaultTracks(): UnifiedTrackData[] {
    // 使用i18n获取当前语言的轨道名称
    const trackNames = {
      video: i18n.global.t('timeline.videoTrack'),
      audio: i18n.global.t('timeline.audioTrack'),
      text: i18n.global.t('timeline.textTrack'),
    }

    const videoTrack = createUnifiedTrackData('video', { name: trackNames.video })
    const audioTrack = createUnifiedTrackData('audio', { name: trackNames.audio })
    const textTrack = createUnifiedTrackData('text', { name: trackNames.text })

    return [videoTrack, audioTrack, textTrack]
  }

  /**
   * 创建新项目
   */
  async createProject(
    name: string,
    template?: Partial<UnifiedProjectConfig>,
  ): Promise<UnifiedProjectConfig> {
    // 检查工作空间权限
    const permissionResult = await fileSystemService.checkPermission()
    if (!permissionResult.hasAccess) {
      throw new Error('未设置工作目录')
    }

    const projectId = 'project_' + Date.now()
    const now = new Date().toISOString()

    // 创建默认轨道
    const defaultTracks = this.createDefaultTracks()

    const projectConfig: UnifiedProjectConfig = {
      id: projectId,
      name: name,
      description: template?.description || '',
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
      thumbnail: template?.thumbnail,
      duration: template?.duration || 0,

      settings: template?.settings || {
        videoResolution: {
          name: '1080p',
          width: 1920,
          height: 1080,
          aspectRatio: '16:9',
        },
        frameRate: 30,
        timelineDurationFrames: 1800,
      },
    }

    // 创建项目内容数据（拆分出来的timeline数据）
    // 🌟 阶段二彻底重构：移除 mediaItems 字段
    const projectTimeline: UnifiedProjectTimeline = {
      tracks: defaultTracks,
      timelineItems: [],
    }

    try {
      // 确保projects文件夹存在
      await this.ensureProjectsFolder()

      // 创建项目文件夹
      const projectPath = fileSystemService.paths.getProjectPath(projectId)
      await fileSystemService.createDirectory(projectPath)

      // 创建子文件夹结构
      // 🌟 阶段二彻底重构：只创建 media 文件夹，不再按类型分类
      // 所有媒体文件直接保存在 media/ 下，使用 {nanoid}.{ext} 格式
      const mediaPath = fileSystemService.paths.getMediaDirPath(projectId)
      await fileSystemService.createDirectory(mediaPath)

      // 分别保存项目配置文件和内容文件
      await this.saveProjectConfigFile(projectId, projectConfig)
      await this.saveProjectTimelineFile(projectId, projectTimeline)

      console.log('统一项目创建成功:', projectConfig.name)
      return projectConfig
    } catch (error) {
      console.error('创建统一项目失败:', error)
      throw error
    }
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string): Promise<void> {
    // 检查工作空间权限
    const permissionResult = await fileSystemService.checkPermission()
    if (!permissionResult.hasAccess) {
      throw new Error('未设置工作目录')
    }

    try {
      const projectPath = fileSystemService.paths.getProjectPath(projectId)
      await fileSystemService.deleteDirectory(projectPath, true)
      console.log('统一项目删除成功:', projectId)
    } catch (error) {
      console.error('删除统一项目失败:', error)
      throw error
    }
  }

  /**
   * 保存项目配置（只保存project.json）
   */
  async saveProjectConfig(projectConfig: UnifiedProjectConfig, updatedAt?: string): Promise<void> {
    // 检查工作空间权限
    const permissionResult = await fileSystemService.checkPermission()
    if (!permissionResult.hasAccess) {
      throw new Error('未设置工作目录')
    }

    try {
      // 使用外部传入的时间戳，或者生成新的时间戳
      projectConfig.updatedAt = updatedAt || new Date().toISOString()

      await this.saveProjectConfigFile(projectConfig.id, projectConfig)
      console.log('统一项目配置保存成功:', projectConfig.name)
    } catch (error) {
      console.error('保存统一项目配置失败:', error)
      throw error
    }
  }

  /**
   * 保存项目内容（只保存content.json）
   */
  async saveProjectTimeline(
    projectId: string,
    projectTimeline: UnifiedProjectTimeline,
  ): Promise<void> {
    // 检查工作空间权限
    const permissionResult = await fileSystemService.checkPermission()
    if (!permissionResult.hasAccess) {
      throw new Error('未设置工作目录')
    }

    try {
      await this.saveProjectTimelineFile(projectId, projectTimeline)
      console.log('统一项目内容保存成功:', projectId)
    } catch (error) {
      console.error('保存统一项目内容失败:', error)
      throw error
    }
  }

  /**
   * 保存完整项目（配置+内容）
   */
  async saveProject(
    projectConfig: UnifiedProjectConfig,
    projectTimeline: UnifiedProjectTimeline,
  ): Promise<void> {
    try {
      // 更新时间戳
      projectConfig.updatedAt = new Date().toISOString()

      // 并行保存配置和内容
      await Promise.all([
        this.saveProjectConfig(projectConfig),
        this.saveProjectTimeline(projectConfig.id, projectTimeline),
      ])

      console.log('统一项目保存成功:', projectConfig.name)
    } catch (error) {
      console.error('保存统一项目失败:', error)
      throw error
    }
  }

  /**
   * 确保projects文件夹存在
   */
  private async ensureProjectsFolder(): Promise<void> {
    const exists = await fileSystemService.directoryExists(this.PROJECTS_FOLDER)
    if (!exists) {
      await fileSystemService.createDirectory(this.PROJECTS_FOLDER)
    }
  }

  /**
   * 从项目文件夹加载配置
   */
  private async loadProjectJson(projectId: string): Promise<UnifiedProjectConfig | null> {
    try {
      const configPath = fileSystemService.paths.getProjectConfigPath(projectId)
      const configText = await fileSystemService.readFile(configPath)
      return JSON.parse(configText) as UnifiedProjectConfig
    } catch (error) {
      console.warn('加载统一项目配置失败:', error)
      return null
    }
  }

  /**
   * 保存项目配置到文件
   */
  private async saveProjectConfigFile(
    projectId: string,
    config: UnifiedProjectConfig,
  ): Promise<void> {
    const configPath = fileSystemService.paths.getProjectConfigPath(projectId)
    await fileSystemService.writeFile(configPath, JSON.stringify(config, null, 2))
  }

  /**
   * 保存项目内容到文件
   */
  private async saveProjectTimelineFile(
    projectId: string,
    content: UnifiedProjectTimeline,
  ): Promise<void> {
    const contentPath = fileSystemService.paths.getProjectTimelinePath(projectId)
    await fileSystemService.writeFile(contentPath, JSON.stringify(content, null, 2))
  }
}

// 导出单例实例
export const unifiedProjectManager = UnifiedProjectManager.getInstance()
