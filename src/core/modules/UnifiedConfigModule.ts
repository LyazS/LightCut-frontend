import { ref, type Ref } from 'vue'
import type { VideoResolution } from '@/core/types'
import type { UnifiedProjectConfig } from '@/core/project'

/**
 * 项目配置管理模块
 * 负责管理项目级别的配置和设置
 */
export function createUnifiedConfigModule() {
  // ==================== 配置定义 ====================
  const projectId = ref('') // 项目ID
  const projectName = ref('') // 项目名称
  const projectDescription = ref('') // 项目描述
  const projectCreatedAt = ref('') // 项目创建时间
  const projectUpdatedAt = ref('') // 项目更新时间
  const projectVersion = ref('') // 项目版本
  const projectThumbnail = ref<string | undefined | null>(null) // 项目缩略图

  // ==================== 状态定义 ====================

  // 视频分辨率设置
  const videoResolution = ref({
    name: '1080p',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
  }) as Ref<VideoResolution>

  // 时间轴基础时长（帧数）
  const timelineDurationFrames = ref(1800) // 默认1800帧（60秒@30fps），确保有足够的刻度线空间

  // ==================== 配置管理方法 ====================

  /**
   * 设置视频分辨率
   * @param resolution 新的视频分辨率配置
   */
  function setVideoResolution(resolution: VideoResolution) {
    videoResolution.value = resolution
    console.log('🎬 视频分辨率已设置为:', resolution)
  }

  /**
   * 从项目配置中恢复配置
   * @param config 项目设置对象
   */
  function restoreFromProjectSettings(pid: string, pconfig: UnifiedProjectConfig) {
    projectId.value = pid
    projectName.value = pconfig.name
    projectDescription.value = pconfig.description
    projectCreatedAt.value = pconfig.createdAt
    projectUpdatedAt.value = pconfig.updatedAt
    projectVersion.value = pconfig.version
    projectThumbnail.value = pconfig.thumbnail || null

    // 视频分辨率设置
    setVideoResolution(pconfig.settings.videoResolution)
    console.log('✅ [Config] 项目设置恢复完成')
  }

  /**
   * 重置配置为默认值
   */
  function resetToDefaults() {
    videoResolution.value = {
      name: '1080p',
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
    }
    timelineDurationFrames.value = 1800 // 60秒@30fps

    console.log('🔄 配置已重置为默认值')
  }

  // ==================== 导出接口 ====================

  return {
    // 配置
    projectId,
    projectName,
    projectDescription,
    projectCreatedAt,
    projectUpdatedAt,
    projectVersion,
    projectThumbnail,

    // 状态
    videoResolution,
    timelineDurationFrames,

    // 方法
    setVideoResolution,
    resetToDefaults,
    restoreFromProjectSettings,
  }
}

// 导出类型定义
export type UnifiedConfigModule = ReturnType<typeof createUnifiedConfigModule>
