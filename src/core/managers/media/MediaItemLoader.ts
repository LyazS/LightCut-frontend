import { globalMetaFileManager } from '@/core/managers/media/globalMetaFileManager'
import type { MediaMetaFile } from '@/core/project/metaTypes'
import type { UnifiedMediaItemData } from '@/core/mediaitem/types'
import { createUnifiedMediaItemData } from '@/core/mediaitem/types'
import { DataSourceFactory } from '@/core/datasource/core/DataSourceTypes'
import { SourceOrigin } from '@/core/datasource/core/BaseDataSource'
import type { BaseUserSelectedFileSourceData } from '@/core/datasource/providers/user-selected/UserSelectedFileSource'
import type { BaseAIGenerationSourceData } from '@/core/datasource/providers/ai-generation/AIGenerationSource'

/**
 * 媒体项目加载器（阶段二彻底重构版）
 * 负责从 Meta 文件重建媒体项目
 *
 * 🌟 只从 Meta 文件加载，Meta 文件是唯一真相源
 */
export class MediaItemLoader {
  /**
   * 从 Meta 文件加载所有媒体项目
   * @param projectId 项目 ID
   * @returns 媒体项目数组
   */
  async loadMediaItemsFromMeta(projectId: string): Promise<UnifiedMediaItemData[]> {
    try {
      console.log(`📂 [MediaItemLoader] 开始从 Meta 文件加载媒体项目: ${projectId}`)

      // 1. 扫描所有 Meta 文件
      const metaFiles = await globalMetaFileManager.scanAllMetaFiles()
      console.log(`📄 [MediaItemLoader] 发现 ${metaFiles.length} 个 Meta 文件`)

      // 2. 从每个 Meta 文件重建媒体项目
      const mediaItems: UnifiedMediaItemData[] = []

      for (const metaData of metaFiles) {
        try {
          const mediaItem = await this.rebuildMediaItemFromMeta(metaData)

          // 3. 只对 ready 状态的媒体项目验证文件是否存在
          if (mediaItem.mediaStatus === 'ready') {
            const fileExists = await globalMetaFileManager.verifyMediaFileExists(metaData.id)

            if (fileExists) {
              console.log(`✅ [MediaItemLoader] 媒体项目加载成功: ${metaData.name}`)
            } else {
              // 文件缺失，标记为 missing 状态
              mediaItem.mediaStatus = 'missing'
              console.warn(`⚠️ [MediaItemLoader] 媒体文件缺失: ${metaData.name}`)
            }
          } else {
            console.log(
              `📋 [MediaItemLoader] 媒体项目加载（状态: ${mediaItem.mediaStatus}）: ${metaData.name}`,
            )
          }
          mediaItems.push(mediaItem)
        } catch (error) {
          console.error(`❌ [MediaItemLoader] 重建媒体项目失败: ${metaData.name}`, error)
        }
      }

      console.log(`✅ [MediaItemLoader] 媒体项目加载完成: ${mediaItems.length}/${metaFiles.length}`)
      return mediaItems
    } catch (error) {
      console.error('❌ [MediaItemLoader] 加载媒体项目失败:', error)
      return []
    }
  }

  /**
   * 从 Meta 文件重建媒体项目（阶段二彻底重构版）
   * @param metaData Meta 文件数据
   * @returns 重建的媒体项目
   */
  private async rebuildMediaItemFromMeta(metaData: MediaMetaFile): Promise<UnifiedMediaItemData> {
    // 1. 根据数据源类型创建相应的数据源（运行时状态）
    let source

    // 🌟 使用类型断言确保 metaData.source 有 type 属性
    const sourceType = (metaData.source as any).type

    if (sourceType === 'user-selected') {
      // 用户选择文件数据源
      source = DataSourceFactory.createUserSelectedSourceFromBaseData(
        metaData.source as BaseUserSelectedFileSourceData,
      )
    } else if (sourceType === 'ai-generation') {
      // AI 生成数据源（从项目加载）
      source = DataSourceFactory.createAIGenerationSource(
        metaData.source as BaseAIGenerationSourceData,
        SourceOrigin.PROJECT_LOAD,
      )
    } else {
      throw new Error(`不支持的数据源类型: ${sourceType}`)
    }

    // 2. 创建媒体项目
    const mediaItem = createUnifiedMediaItemData(
      metaData.id, // ID 格式: {nanoid}.{ext}
      metaData.name,
      source,
      {
        createdAt: metaData.createdAt,
        mediaType: metaData.mediaType,
        duration: metaData.duration,
        mediaStatus: metaData.mediaStatus || 'pending', // 🌟 如果 meta 文件中有终态状态，使用它；否则默认为 pending
      },
    )

    return mediaItem
  }
}

// 导出全局实例
export const globalMediaItemLoader = new MediaItemLoader()
