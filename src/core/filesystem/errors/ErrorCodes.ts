/**
 * 文件系统错误码
 */
export enum ErrorCode {
  /** 不支持的适配器 */
  NOT_SUPPORTED = 'NOT_SUPPORTED',

  /** 权限被拒绝 */
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  /** 文件未找到 */
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',

  /** 目录未找到 */
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',

  /** 文件已存在 */
  FILE_EXISTS = 'FILE_EXISTS',

  /** 目录已存在 */
  DIRECTORY_EXISTS = 'DIRECTORY_EXISTS',

  /** 操作失败 */
  OPERATION_FAILED = 'OPERATION_FAILED',

  /** 无效的路径 */
  INVALID_PATH = 'INVALID_PATH',

  /** 目录不为空 */
  DIRECTORY_NOT_EMPTY = 'DIRECTORY_NOT_EMPTY',

  /** 未知错误 */
  UNKNOWN = 'UNKNOWN',
}
