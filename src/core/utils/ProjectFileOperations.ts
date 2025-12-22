import { fileSystemService } from '@/core/managers/filesystem/fileSystemService'
import type { UnifiedProjectConfig, UnifiedProjectTimeline } from '@/core/project'
import type { UnifiedDirectoryConfig } from '@/core/directory/types'

/**
 * 轻量级设置预加载 - 只读取 project.json 中的配置
 * @param projectId 项目ID
 * @returns 项目配置或null（仅当项目不存在时）
 * @throws 当项目存在但读取失败时抛出错误
 */
export async function loadProjectConfig(projectId: string): Promise<UnifiedProjectConfig | null> {
  // 检查工作空间权限
  const permissionResult = await fileSystemService.checkPermission()
  if (!permissionResult.hasAccess) {
    throw new Error('未设置工作目录')
  }

  try {
    console.log(`🔧 [Project Config Load] 开始加载项目配置: ${projectId}`)

    const configPath = fileSystemService.paths.getProjectConfigPath(projectId)
    const configText = await fileSystemService.readFile(configPath)
    const projectConfig = JSON.parse(configText) as UnifiedProjectConfig

    if (!projectConfig) {
      throw new Error(`项目配置文件读取失败或格式错误`)
    }

    if (!projectConfig.settings) {
      throw new Error(`项目配置文件缺少settings字段`)
    }

    // 验证关键设置字段
    if (!projectConfig.settings.videoResolution) {
      throw new Error(`项目配置缺少videoResolution设置`)
    }

    console.log(`✅ [Project Config Load] 项目配置加载成功:`, {
      videoResolution: projectConfig.settings.videoResolution,
      frameRate: projectConfig.settings.frameRate,
    })

    return projectConfig
  } catch (error) {
    // 如果是项目不存在的错误，返回null（用于新项目）
    if (error instanceof Error && error.name === 'NotFoundError') {
      console.error(`📝 [Project Config Load] 项目不存在，返回null: ${projectId}`)
      return null
    }

    // 其他错误（文件损坏、格式错误等）抛出异常
    console.error(`❌ [Project Config Load] 加载项目配置失败: ${projectId}`, error)
    return null
  }
}

/**
 * 加载项目内容数据
 * @param projectId 项目ID
 * @returns 项目内容数据或null（仅当文件不存在时）
 * @throws 当文件存在但读取失败时抛出错误
 */
export async function loadProjectTimeline(
  projectId: string,
): Promise<UnifiedProjectTimeline | null> {
  // 检查工作空间权限
  const permissionResult = await fileSystemService.checkPermission()
  if (!permissionResult.hasAccess) {
    throw new Error('未设置工作目录')
  }

  try {
    console.log(`📂 [Project Content Load] 开始加载项目内容: ${projectId}`)

    const contentPath = fileSystemService.paths.getProjectTimelinePath(projectId)
    const contentText = await fileSystemService.readFile(contentPath)
    const projectTimeline = JSON.parse(contentText) as UnifiedProjectTimeline

    if (!projectTimeline) {
      throw new Error(`项目内容文件读取失败或格式错误`)
    }

    // 🔧 修复：将 timeRangeN 中的 number 转换回 bigint（从 JSON 加载后）
    if (projectTimeline.timelineItems) {
      projectTimeline.timelineItems.forEach((item) => {
        item.timeRangeN = {
          clipStart: BigInt(item.timeRangeN.clipStart),
          clipEnd: BigInt(item.timeRangeN.clipEnd),
          timelineStart: BigInt(item.timeRangeN.timelineStart),
          timelineEnd: BigInt(item.timeRangeN.timelineEnd),
        } as any
      })
    }

    console.log(`✅ [Project Content Load] 项目内容加载成功:`, {
      轨道数量: projectTimeline.tracks?.length || 0,
      时间轴项目数量: projectTimeline.timelineItems?.length || 0,
      // 🌟 阶段二彻底重构：mediaItems 已移除
    })

    return projectTimeline
  } catch (error) {
    // 如果是文件不存在的错误，返回null（用于新项目）
    if (error instanceof Error && error.name === 'NotFoundError') {
      console.error(`📝 [Project Content Load] 内容文件不存在，返回null: ${projectId}`)
      return null
    }

    // 其他错误（文件损坏、格式错误等）抛出异常
    console.error(`❌ [Project Content Load] 加载项目内容失败: ${projectId}`, error)
    return null
  }
}
/**
 * 加载目录配置数据
 * @param projectId 项目ID
 * @returns 目录配置数据或null（仅当文件不存在时）
 * @throws 当文件存在但读取失败时抛出错误
 */
export async function loadDirectoryConfig(
  projectId: string,
): Promise<UnifiedDirectoryConfig | null> {
  // 检查工作空间权限
  const permissionResult = await fileSystemService.checkPermission()
  if (!permissionResult.hasAccess) {
    throw new Error('未设置工作目录')
  }

  try {
    console.log(`📂 [Directory Config Load] 开始加载目录配置: ${projectId}`)

    const filePath = `projects/${projectId}/directories.json`

    // 检查文件是否存在
    const fileExists = await fileSystemService.fileExists(filePath)
    if (!fileExists) {
      console.log(`📄 [Directory Config Load] 目录配置文件不存在: ${projectId}`)
      return null
    }

    // 从文件系统读取
    const jsonString = await fileSystemService.readFile(filePath)
    const directoryConfig: UnifiedDirectoryConfig = JSON.parse(jsonString)

    if (!directoryConfig) {
      throw new Error(`目录配置文件读取失败或格式错误`)
    }

    console.log(`✅ [Directory Config Load] 目录配置加载成功:`, {
      目录数量: directoryConfig.directories?.length || 0,
      打开标签数: directoryConfig.openTabs?.length || 0,
      活动标签: directoryConfig.activeTabId || 'none',
    })

    return directoryConfig
  } catch (error) {
    // 如果是文件不存在的错误，返回null
    if (error instanceof Error && error.name === 'NotFoundError') {
      console.log(`📝 [Directory Config Load] 目录配置文件不存在，返回null: ${projectId}`)
      return null
    }

    // 其他错误（文件损坏、格式错误等）抛出异常
    console.error(`❌ [Directory Config Load] 加载目录配置失败: ${projectId}`, error)
    throw error
  }
}

/**
 * 🔄 更新：保存项目（支持目录配置）
 * @param projectId 项目ID
 * @param projectConfig 项目配置（可选）
 * @param projectTimeline 项目内容（可选）
 * @param directoryConfig 目录配置（可选）
 * @param options 保存选项
 */
export async function saveProject(
  projectId: string,
  projectConfig?: UnifiedProjectConfig,
  projectTimeline?: UnifiedProjectTimeline,
  directoryConfig?: UnifiedDirectoryConfig,
  options?: {
    configChanged?: boolean
    contentChanged?: boolean
    directoryChanged?: boolean
  },
): Promise<void> {
  const { configChanged = false, contentChanged = false, directoryChanged = false } = options || {}

  try {
    console.log(`💾 保存项目: ${projectId}`)

    // 保存项目配置
    if (configChanged && projectConfig) {
      const configPath = fileSystemService.paths.getProjectConfigPath(projectId)
      await fileSystemService.writeFile(configPath, JSON.stringify(projectConfig, null, 2))
    }

    // 保存项目内容
    if (contentChanged && projectTimeline) {
      const contentPath = fileSystemService.paths.getProjectTimelinePath(projectId)
      await fileSystemService.writeFile(contentPath, JSON.stringify(projectTimeline, null, 2))
    }

    // 🆕 保存目录配置
    if (directoryChanged && directoryConfig) {
      const directoryPath = fileSystemService.paths.getProjectDirectoriesPath(projectId)
      await fileSystemService.writeFile(directoryPath, JSON.stringify(directoryConfig, null, 2))
    }

    console.log(`✅ 项目保存成功: ${projectId}`)
  } catch (error) {
    console.error(`❌ 保存项目失败: ${projectId}`, error)
    throw error
  }
}
