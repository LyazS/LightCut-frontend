import { computed, type Ref, type ComputedRef } from 'vue'
import { useUnifiedStore } from '@/core/unifiedStore'
import { DirectoryType, type CharacterDirectory, type VirtualDirectory } from '@/core/directory/types'

/**
 * 角色媒体状态枚举
 */
export type CharacterMediaStatus = 'loading' | 'ready' | 'error' | 'unknown'

/**
 * 角色相关操作的 Composable
 * 提供角色文件夹的媒体状态查询功能
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

    const characterDir = dir as CharacterDirectory
    const profileMediaItemId = characterDir.character.profileMediaItemId

    // 如果没有头像 MediaItem，返回 unknown
    if (!profileMediaItemId) return 'unknown'

    // 获取头像 MediaItem
    const mediaItem = unifiedStore.getMediaItem(profileMediaItemId)
    if (!mediaItem) return 'unknown'

    // 根据 MediaItem 的状态返回对应的状态
    if (mediaItem.mediaStatus === 'pending' || mediaItem.mediaStatus === 'asyncprocessing' || mediaItem.mediaStatus === 'decoding') {
      return 'loading'
    } else if (mediaItem.mediaStatus === 'ready') {
      return 'ready'
    } else if (mediaItem.mediaStatus === 'error' || mediaItem.mediaStatus === 'cancelled' || mediaItem.mediaStatus === 'missing') {
      return 'error'
    }

    return 'unknown'
  })

  /**
   * 获取角色缩略图 URL
   * 返回头像 MediaItem 的缩略图 URL
   */
  const characterThumbnailUrl = computed(() => {
    const dir = directory.value
    if (!dir || dir.type !== DirectoryType.CHARACTER) return undefined

    const characterDir = dir as CharacterDirectory
    const profileMediaItemId = characterDir.character.profileMediaItemId

    // 如果没有头像 MediaItem，返回 undefined
    if (!profileMediaItemId) return undefined

    // 获取头像 MediaItem
    const mediaItem = unifiedStore.getMediaItem(profileMediaItemId)
    if (!mediaItem) return undefined

    // 如果 MediaItem 未准备好，返回 undefined
    if (mediaItem.mediaStatus !== 'ready') return undefined

    // 返回缩略图 URL（如果有）
    return mediaItem.runtime.bunny?.thumbnailUrl || undefined
  })

  /**
   * 获取角色信息
   */
  const characterInfo = computed(() => {
    const dir = directory.value
    if (!dir || dir.type !== DirectoryType.CHARACTER) return null
    return (dir as CharacterDirectory).character
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
  }
}
