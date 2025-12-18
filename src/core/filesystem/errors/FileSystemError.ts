import { ErrorCode } from './ErrorCodes'

/**
 * 文件系统错误类
 */
export class FileSystemError extends Error {
  /** 错误码 */
  public readonly code: ErrorCode

  /** 相关路径 */
  public readonly path?: string

  /** 原始错误 */
  public readonly cause?: Error

  constructor(message: string, code: ErrorCode = ErrorCode.UNKNOWN, path?: string, cause?: Error) {
    super(message)
    this.name = 'FileSystemError'
    this.code = code
    this.path = path
    this.cause = cause

    // 保持正确的原型链
    Object.setPrototypeOf(this, FileSystemError.prototype)
  }

  /**
   * 获取完整的错误信息
   */
  getFullMessage(): string {
    let msg = `[${this.code}] ${this.message}`

    if (this.path) {
      msg += ` (路径: ${this.path})`
    }

    if (this.cause) {
      msg += `\n原因: ${this.cause.message}`
    }

    return msg
  }

  /**
   * 转换为 JSON 对象
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      path: this.path,
      cause: this.cause?.message,
    }
  }
}
