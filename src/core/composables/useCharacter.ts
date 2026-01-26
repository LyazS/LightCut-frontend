import { computed, type Ref, type ComputedRef } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { DirectoryType, type CharacterDirectory, type VirtualDirectory } from '@/core/directory/types'
import { MediaItemQueries } from '@/core/mediaitem/queries'

/**
 * 角色媒体状态枚举
 */
export type CharacterMediaStatus = 'loading' | 'ready' | 'error' | 'unknown'

/**
 * 角色相关操作的 Composable
 * 提供角色文件夹的媒体状态查询和缩略图获取功能
 *
 * @param directoryId 目录ID（响应式引用）
 * @returns 角色相关的计算属性和方法
 */
export function useCharacter(
  directoryId: Ref<string | null | undefined> | ComputedRef<string | null | undefined>
) {
  const unifiedStore = useUnifiedStore()

  /**
   * 获取目录对象
   */
  const directory = computed(() => {
    const id = directoryId.value
    if (!id) return null
    return unifiedStore.getDirectory(id)
  })

  /**
   * 判断是否为角色文件夹
   */
  const isCharacterFolder = computed(() => {
    const dir = directory.value
    return dir?.type === DirectoryType.CHARACTER
  })

  /**
   * 获取角色媒体状态
   * @returns 'loading' | 'ready' | 'error' | 'unknown'
   */
  const characterMediaStatus = computed<CharacterMediaStatus>(() => {
    const dir = directory.value
    if (!dir || dir.type !== DirectoryType.CHARACTER) return 'unknown'

    const charDir = dir as CharacterDirectory
    const portraitMediaId = charDir.character?.portraitMediaId
    if (!portraitMediaId) return 'unknown'

    const mediaItem = unifiedStore.getMediaItem(portraitMediaId)
    if (!mediaItem) return 'unknown'

    // 检查是否为加载中状态
    if (MediaItemQueries.isPending(mediaItem) || MediaItemQueries.isProcessing(mediaItem)) {
      return 'loading'
    }

    // 检查是否为就绪状态
    if (MediaItemQueries.isReady(mediaItem)) {
      return 'ready'
    }

    // 检查是否为错误状态
    if (MediaItemQueries.hasAnyError(mediaItem)) {
      return 'error'
    }

    // 其他情况
    return 'unknown'
  })

  /**
   * 获取角色缩略图 URL
   * 仅在媒体就绪时返回有效的缩略图 URL
   */
  const characterThumbnailUrl = computed(() => {
    const dir = directory.value
    if (!dir || dir.type !== DirectoryType.CHARACTER) return undefined

    const charDir = dir as CharacterDirectory
    const portraitMediaId = charDir.character?.portraitMediaId
    if (!portraitMediaId) return undefined

    const mediaItem = unifiedStore.getMediaItem(portraitMediaId)
    if (!mediaItem || !MediaItemQueries.isReady(mediaItem)) {
      return undefined
    }

    return mediaItem.runtime.bunny?.thumbnailUrl
  })

  /**
   * 获取角色信息
   */
  const characterInfo = computed(() => {
    const dir = directory.value
    if (!dir || dir.type !== DirectoryType.CHARACTER) return null
    return (dir as CharacterDirectory).character
  })

  /**
   * 获取角色头像媒体 ID
   */
  const portraitMediaId = computed(() => {
    return characterInfo.value?.portraitMediaId
  })

  /**
   * 获取角色头像媒体项
   */
  const portraitMediaItem = computed(() => {
    if (!portraitMediaId.value) return null
    return unifiedStore.getMediaItem(portraitMediaId.value)
  })

  return {
    // 目录相关
    directory,

    // 状态判断
    isCharacterFolder,
    characterMediaStatus,

    // 图片相关
    characterThumbnailUrl,
    characterInfo,
    portraitMediaId,
    portraitMediaItem,
  }
}
