/**
 * 媒体文件路径管理工具
 * 提供媒体文件和 Meta 文件的路径生成和转换功能
 */

/**
 * 从 ID 生成媒体文件路径
 * @param id 媒体 ID（如 "V1StGXR8_Z5j.mp4"）
 * @returns 媒体文件路径（如 "media/V1StGXR8_Z5j.mp4"）
 */
export function getMediaPath(id: string): string {
  return `media/${id}`
}

/**
 * 从 ID 生成 meta 文件路径
 * @param id 媒体 ID（如 "V1StGXR8_Z5j.mp4"）
 * @returns meta 文件路径（如 "media/V1StGXR8_Z5j.mp4.meta"）
 */
export function getMetaPath(id: string): string {
  return `media/${id}.meta`
}

/**
 * 从媒体文件路径推导 meta 文件路径
 * @param mediaPath 媒体文件路径
 * @returns meta 文件路径
 */
export function mediaPathToMetaPath(mediaPath: string): string {
  return `${mediaPath}.meta`
}

/**
 * 从 meta 文件路径推导媒体文件路径
 * @param metaPath meta 文件路径
 * @returns 媒体文件路径
 */
export function metaPathToMediaPath(metaPath: string): string {
  return metaPath.replace(/\.meta$/, '')
}

/**
 * 从文件路径提取完整 ID（包含扩展名）
 * @param path 文件路径（如 "media/V1StGXR8_Z5j.mp4"）
 * @returns ID（如 "V1StGXR8_Z5j.mp4"）
 */
export function extractIdFromPath(path: string): string {
  // 移除 "media/" 前缀
  const withoutPrefix = path.replace(/^media\//, '')
  // 移除 ".meta" 后缀（如果有）
  return withoutPrefix.replace(/\.meta$/, '')
}
