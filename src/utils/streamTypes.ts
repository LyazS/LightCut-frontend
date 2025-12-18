// 流式消息类型枚举
export enum StreamChunkType {
  TEXT = 'text',
  ERROR = 'error',
  TOOL_USE = 'tool_use',
}

// 流式消息接口定义
export interface StreamChunk {
  type: StreamChunkType
  content: string
}
