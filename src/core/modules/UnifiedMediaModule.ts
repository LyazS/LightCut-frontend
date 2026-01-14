import { ref, watch, type Raw } from 'vue'
import {
  type UnifiedMediaItemData,
  type MediaStatus,
  type MediaType,
  createUnifiedMediaItemData,
  UnifiedMediaItemQueries,
  UnifiedMediaItemActions,
} from '@/core'
import type { UnifiedTimelineItemData } from '@/core/timelineitem/type'
import type { ModuleRegistry } from '@/core/modules/ModuleRegistry'
import { MODULE_NAMES } from '@/core/modules/ModuleRegistry'
import type { UnifiedProjectModule } from '@/core/modules/UnifiedProjectModule'
import type { UnifiedTimelineModule } from '@/core/modules/UnifiedTimelineModule'
import { getDataSourceRegistry } from '@/core/datasource/registry'
import { globalMetaFileManager } from '@/core/managers/media/globalMetaFileManager'

// ==================== 统一媒体项目调试工具 ====================

/**
 * 统一媒体项目调试信息打印函数
 * @param operation 操作名称
 * @param details 操作详情
 * @param mediaItems 统一媒体项目数组
 */
function printUnifiedDebugInfo(
  operation: string,
  details: unknown,
  mediaItems: UnifiedMediaItemData[],
) {
  const timestamp = new Date().toLocaleTimeString()
  console.group(`🎬 [${timestamp}] ${operation}`)

  if (details) {
    console.log('📋 操作详情:', details)
  }

  console.log('📚 统一媒体项目状态:')
  console.table(
    mediaItems.map((item) => ({
      id: item.id,
      name: item.name,
      duration: item.duration ? `${item.duration}帧` : '未知',
      mediaType: item.mediaType,
      mediaStatus: item.mediaStatus,
      sourceType: item.source.type,
      sourceProgress: `${item.source.progress}%`,
      createdAt: new Date(item.createdAt).toLocaleTimeString(),
    })),
  )

  console.log('📊 统计信息:')
  const statusCounts = mediaItems.reduce(
    (acc, item) => {
      acc[item.mediaStatus] = (acc[item.mediaStatus] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  console.log(`- 总项目数: ${mediaItems.length}`)
  console.log(`- 状态分布:`, statusCounts)

  console.groupEnd()
}

// ==================== 统一媒体项目管理模块 ====================

/**
 * 统一媒体管理模块
 * 负责管理素材库中的统一媒体项目
 */
export function createUnifiedMediaModule(registry: ModuleRegistry) {
  // ==================== 状态定义 ====================

  // 统一媒体项目列表
  const mediaItems = ref<UnifiedMediaItemData[]>([])

  // ==================== 媒体项目管理方法 ====================

  /**
   * 添加媒体项目到素材库
   * @param mediaItem 媒体项目
   */
  function addMediaItem(mediaItem: UnifiedMediaItemData) {
    mediaItems.value.push(mediaItem)
    printUnifiedDebugInfo(
      '添加统一媒体项目到素材库',
      {
        mediaItemId: mediaItem.id,
        name: mediaItem.name,
        duration: mediaItem.duration,
        mediaType: mediaItem.mediaType,
        mediaStatus: mediaItem.mediaStatus,
        sourceType: mediaItem.source.type,
      },
      getAllMediaItems(),
    )
  }

  /**
   * 从素材库删除媒体项目
   * @param mediaItemId 媒体项目ID
   */
  async function removeMediaItem(mediaItemId: string) {
    const index = mediaItems.value.findIndex(
      (item: UnifiedMediaItemData) => item.id === mediaItemId,
    )
    if (index > -1) {
      const mediaItem = mediaItems.value[index]

      // 1. 清理缩略图URL
      if (mediaItem.runtime.bunny?.thumbnailUrl) {
        URL.revokeObjectURL(mediaItem.runtime.bunny.thumbnailUrl)
        console.log(`🧹 [UnifiedMediaModule] bunny缩略图URL已清理: ${mediaItem.name}`)
      }

      // 2. 清理相关的时间轴项目
      await cleanupRelatedTimelineItems(mediaItemId)

      // 3. 删除硬盘文件（媒体文件 + Meta文件）
      try {
        const deleteResult = await globalMetaFileManager.deleteMediaFiles(mediaItemId)

        if (deleteResult.success) {
          console.log(`✅ [UnifiedMediaModule] 硬盘文件已删除: ${mediaItem.name}`)
        } else {
          console.warn(
            `⚠️ [UnifiedMediaModule] 硬盘文件删除失败: ${mediaItem.name}`,
            deleteResult.error,
          )
        }
      } catch (error) {
        console.error(`❌ [UnifiedMediaModule] 删除硬盘文件时出错: ${mediaItem.name}`, error)
        // 即使文件删除失败，也继续从内存中移除
      }

      // 5. 从数组中移除
      mediaItems.value.splice(index, 1)

      printUnifiedDebugInfo(
        '从素材库删除统一媒体项目',
        {
          mediaItemId,
          mediaItemName: mediaItem.name,
        },
        getAllMediaItems(),
      )
    }
  }

  /**
   * 根据ID获取媒体项目
   * @param mediaItemId 媒体项目ID
   * @returns 媒体项目或undefined
   */
  function getMediaItem(mediaItemId: string): UnifiedMediaItemData | undefined {
    return mediaItems.value.find((item: UnifiedMediaItemData) => item.id === mediaItemId)
  }

  /**
   * 根据数据源ID查找对应的媒体项目
   * @param sourceId 数据源ID
   * @returns 媒体项目或undefined
   */
  function getMediaItemBySourceId(sourceId: string): UnifiedMediaItemData | undefined {
    // 🌟 阶段二彻底重构：数据源不再有 id 字段
    // 此方法已废弃，保留仅为向后兼容
    console.warn('⚠️ getMediaItemBySourceId 已废弃，数据源不再有独立ID')
    return undefined
  }

  /**
   * 获取所有媒体项目
   * @returns 所有媒体项目的数组
   */
  function getAllMediaItems(): UnifiedMediaItemData[] {
    return [...mediaItems.value]
  }

  /**
   * 更新媒体项目名称
   * @param mediaItemId 媒体项目ID
   * @param newName 新名称
   */
  function updateMediaItemName(mediaItemId: string, newName: string) {
    const mediaItem = getMediaItem(mediaItemId)
    if (mediaItem) {
      UnifiedMediaItemActions.updateName(mediaItem, newName)
    }
  }

  /**
   * 更新媒体项目
   * @param updatedMediaItem 更新后的媒体项目
   */
  function updateMediaItem(updatedMediaItem: UnifiedMediaItemData) {
    const index = mediaItems.value.findIndex(
      (item: UnifiedMediaItemData) => item.id === updatedMediaItem.id,
    )
    if (index !== -1) {
      mediaItems.value[index] = updatedMediaItem
      console.log(`统一媒体项目已更新: ${updatedMediaItem.id} -> ${updatedMediaItem.name}`)
    }
  }

  // ==================== 分辨率管理方法 ====================

  /**
   * 获取视频原始分辨率（从WebAV对象获取）
   * @param mediaItemId 素材ID
   * @returns 视频分辨率对象
   */
  function getVideoOriginalResolution(mediaItemId: string): { width: number; height: number } {
    const mediaItem = getMediaItem(mediaItemId)
    if (mediaItem && mediaItem.mediaType === 'video' && mediaItem.runtime.bunny) {
      const size = UnifiedMediaItemQueries.getOriginalSize(mediaItem)
      if (size) {
        return size
      }
    }
    // 默认分辨率
    return { width: -1, height: -1 }
  }

  /**
   * 获取图片原始分辨率（从WebAV对象获取）
   * @param mediaItemId 素材ID
   * @returns 图片分辨率对象
   */
  function getImageOriginalResolution(mediaItemId: string): { width: number; height: number } {
    const mediaItem = getMediaItem(mediaItemId)
    if (mediaItem && mediaItem.mediaType === 'image' && mediaItem.runtime.bunny) {
      const size = UnifiedMediaItemQueries.getOriginalSize(mediaItem)
      if (size) {
        return size
      }
    }
    // 默认分辨率
    return { width: -1, height: -1 }
  }

  // ==================== 异步等待方法 ====================

  /**
   * 等待媒体项目解析完成
   * 使用Vue的watch机制监听status状态变化，更符合响应式编程模式
   * @param mediaItemId 媒体项目ID
   * @returns Promise<boolean> 解析成功返回true，解析失败抛出错误
   */
  function waitForMediaItemReady(mediaItemId: string): Promise<boolean> {
    const mediaItem = getMediaItem(mediaItemId)

    if (!mediaItem) {
      return Promise.reject(new Error(`找不到媒体项目: ${mediaItemId}`))
    }

    // 使用 Vue watch 监听状态变化，immediate: true 会立即检查当前状态
    return new Promise((resolve, reject) => {
      let unwatch: (() => void) | null = null

      unwatch = watch(
        () => mediaItem.mediaStatus,
        (newStatus) => {
          if (newStatus === 'ready') {
            unwatch?.()
            resolve(true)
          } else if (
            newStatus === 'error' ||
            newStatus === 'cancelled' ||
            newStatus === 'missing'
          ) {
            unwatch?.()
            reject(new Error(`媒体项目解析失败: ${mediaItem.name}, 状态: ${newStatus}`))
          }
          // 如果是其他状态，继续等待
        },
        { immediate: true }, // 立即执行一次，检查当前状态
      )
    })
  }

  // ==================== 数据源状态同步方法 ====================
  // 注意：handleSourceStatusChange方法已移除，现在由各个管理器直接处理媒体状态

  /**
   * 开始媒体项目处理流程
   * @param mediaItem 媒体项目
   */
  function startMediaProcessing(mediaItem: UnifiedMediaItemData) {
    console.log(`🚀 [UnifiedMediaModule] 开始处理媒体项目: ${mediaItem.name}`)

    // 直接使用数据源处理器注册中心（已在顶部静态导入）
    const dsRegistry = getDataSourceRegistry()
    const processor = dsRegistry.getProcessor(mediaItem.source.type)

    if (processor) {
      // ✅ 正确：通过任务队列处理，有并发控制和重试
      processor.addTask(mediaItem)

      console.log(`📋 [UnifiedMediaModule] 任务已加入队列`)

      // 注意：任务队列会自动处理，不需要手动 then/catch
      // 状态更新会通过 mediaItem 的响应式属性自动反映
      // 如果需要监听任务完成，可以通过 watch mediaItem.mediaStatus
    } else {
      console.error(
        `❌ [UnifiedMediaModule] 找不到对应的数据源处理器: ${mediaItem.source.type}`,
      )
      UnifiedMediaItemActions.transitionTo(mediaItem, 'error')
    }
  }

  /**
   * 取消媒体处理任务
   * @param mediaId 媒体项目ID
   * @returns 是否成功取消
   */
  async function cancelMediaProcessing(mediaId: string): Promise<boolean> {
    const mediaItem = getMediaItem(mediaId)
    if (!mediaItem) {
      console.warn(`⚠️ [UnifiedMediaModule] 媒体项目不存在: ${mediaId}`)
      return false
    }

    console.log(`🛑 [UnifiedMediaModule] 尝试取消媒体处理: ${mediaItem.name}`)

    try {
      // 导入数据源处理器注册中心
      const ds_registry = getDataSourceRegistry()
      const processor = ds_registry.getProcessor(mediaItem.source.type)

      if (!processor) {
        console.error(`❌ [UnifiedMediaModule] 找不到对应的数据源处理器: ${mediaItem.source.type}`)
        return false
      }

      // 🌟 直接使用 mediaId 作为 taskId（BaseDataSourceProcessor.addTask 已改为使用 mediaItem.id）
      const success = await processor.cancelTask(mediaId)

      if (success) {
        console.log(`✅ [UnifiedMediaModule] 任务取消成功: ${mediaItem.name}`)

        // 保存项目配置（内容已变更）
        const projectModule = registry.get<UnifiedProjectModule>(MODULE_NAMES.PROJECT)
        if (projectModule) {
          await projectModule.saveCurrentProject({ contentChanged: true })
        }
      } else {
        console.warn(`⚠️ [UnifiedMediaModule] 任务取消失败: ${mediaItem.name}`)
      }

      return success
    } catch (error) {
      console.error(`❌ [UnifiedMediaModule] 取消任务时出错: ${mediaItem.name}`, error)
      return false
    }
  }

  // ==================== 便捷查询方法 ====================

  /**
   * 获取就绪的媒体项目
   */
  function getReadyMediaItems(): UnifiedMediaItemData[] {
    return mediaItems.value.filter(UnifiedMediaItemQueries.isReady)
  }

  /**
   * 获取正在处理的媒体项目
   */
  function getProcessingMediaItems(): UnifiedMediaItemData[] {
    return mediaItems.value.filter(UnifiedMediaItemQueries.isProcessing)
  }

  /**
   * 获取有错误的媒体项目
   */
  function getErrorMediaItems(): UnifiedMediaItemData[] {
    return mediaItems.value.filter(UnifiedMediaItemQueries.hasAnyError)
  }

  /**
   * 根据媒体类型筛选项目
   */
  function getMediaItemsByType(mediaType: MediaType | 'unknown'): UnifiedMediaItemData[] {
    return mediaItems.value.filter((item) => item.mediaType === mediaType)
  }

  /**
   * 根据数据源类型筛选项目
   */
  function getMediaItemsBySourceType(sourceType: string): UnifiedMediaItemData[] {
    return mediaItems.value.filter((item) => item.source.type === sourceType)
  }

  /**
   * 获取媒体项目统计信息
   */
  function getMediaItemsStats() {
    const total = mediaItems.value.length
    const ready = getReadyMediaItems().length
    const processing = getProcessingMediaItems().length
    const error = getErrorMediaItems().length
    const pending = mediaItems.value.filter(UnifiedMediaItemQueries.isPending).length

    return {
      total,
      ready,
      processing,
      error,
      pending,
      readyPercentage: total > 0 ? Math.round((ready / total) * 100) : 0,
    }
  }

  // ==================== 清理方法 ====================

  /**
   * 清理与媒体项目相关的时间轴项目
   * @param mediaItemId 媒体项目ID
   */
  async function cleanupRelatedTimelineItems(mediaItemId: string): Promise<void> {
    try {
      // 通过 registry 获取时间轴模块
      const timelineModule = registry.get<UnifiedTimelineModule>(MODULE_NAMES.TIMELINE)

      if (!timelineModule) {
        console.warn('⚠️ 时间轴模块未初始化，跳过时间轴项目清理')
        return
      }

      // 获取所有时间轴项目
      const timelineItems = timelineModule.timelineItems.value

      // 找出使用该素材的所有时间轴项目
      const relatedTimelineItems = timelineItems.filter(
        (item: UnifiedTimelineItemData) => item.mediaItemId === mediaItemId,
      )

      // 清理每个相关的时间轴项目
      for (const timelineItem of relatedTimelineItems) {
        console.log(`🧹 清理时间轴项目: ${timelineItem.id}`)
        await timelineModule.removeTimelineItem(timelineItem.id)
      }

      console.log(`✅ 已清理 ${relatedTimelineItems.length} 个相关时间轴项目`)
    } catch (error) {
      console.error(`❌ 清理相关时间轴项目失败: ${mediaItemId}`, error)
    }
  }


  return {
    // 状态
    mediaItems,

    // 媒体项目管理方法
    addMediaItem,
    removeMediaItem,
    getMediaItem,
    getMediaItemBySourceId,
    updateMediaItemName,
    updateMediaItem,
    getAllMediaItems,

    // 分辨率管理方法
    getVideoOriginalResolution,
    getImageOriginalResolution,

    // 异步等待方法
    waitForMediaItemReady,

    // 数据源处理方法
    startMediaProcessing,
    cancelMediaProcessing,

    // 便捷查询方法
    getReadyMediaItems,
    getProcessingMediaItems,
    getErrorMediaItems,
    getMediaItemsByType,
    getMediaItemsBySourceType,
    getMediaItemsStats,

    // 清理方法
    cleanupRelatedTimelineItems,

    // 工厂函数和查询函数
    createUnifiedMediaItemData,
    UnifiedMediaItemQueries,
    UnifiedMediaItemActions,
  }
}

// 导出类型定义
export type UnifiedMediaModule = ReturnType<typeof createUnifiedMediaModule>
