import { FileSystemService } from '@/core/filesystem/core/FileSystemService'
import { FileSystemAccessAdapter } from '@/core/filesystem/adapters/FileSystemAccessAdapter'

/**
 * 创建适配器
 */
const adapter = new FileSystemAccessAdapter()

/**
 * 创建并导出文件系统服务单例
 */
export const fileSystemService = new FileSystemService(adapter)
