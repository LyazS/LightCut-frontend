/**
 * 统一管理器导出
 * 提供基于新架构的管理器类
 */

// ==================== 核心管理器 ====================
export { UnifiedProjectManager, unifiedProjectManager } from './project/UnifiedProjectManager'

// ==================== 文件系统服务 ====================
export { fileSystemService } from './filesystem/fileSystemService'

// ==================== 媒体管理器 ====================

export {
  MediaSyncFactory,
  cleanupCommandMediaSync,
  cleanupProjectLoadMediaSync,
  getMediaSyncInfo,
} from './media'
