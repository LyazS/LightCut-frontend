// 聊天API相关的类型定义
import type { ChatMessageUser, ChatMessage } from '@/aipanel/agent/types'

// API端点配置
export const API_ENDPOINTS = {
  createSession: '/api/chat/create-session',
  sendMessage: '/api/chat/send-message',
  getHistory: (sessionId: string) => `/api/chat/session/${sessionId}/history`,
  deleteSession: (sessionId: string) => `/api/chat/session/${sessionId}`,
  getAllSessions: '/api/chat/sessions',
  healthCheck: '/health',
} as const

// API响应类型定义
export interface CreateSessionResponse {
  session_id: string
  created_at: string
}

export interface SendMessageRequest {
  session_id: string
  message: ChatMessageUser // 使用 ChatMessageUser 类型
}

// 后端现在直接返回 ChatMessageUser 和 ChatMessageAssistant 类型
export interface SessionHistoryResponse {
  session_id: string
  messages: ChatMessage[] // 使用 ChatMessage 类型
}

export interface SessionSummary {
  session_id: string
  created_at: string
  updated_at: string
  message_count: number
  preview_text: string
}

export interface AllSessionsResponse {
  sessions: SessionSummary[]
  total_count: number
}

export interface ApiError {
  detail: string
  status_code?: number
}
