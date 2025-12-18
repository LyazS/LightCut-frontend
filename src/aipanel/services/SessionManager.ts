import { ref } from 'vue'
import { fetchClient } from '@/utils/fetchClient'
import { API_ENDPOINTS } from '@/aipanel/services/apiTypes'
import type {
  CreateSessionResponse,
  AllSessionsResponse,
  SessionSummary,
} from '@/aipanel/services/apiTypes'
import { StreamChunkType, type StreamChunk } from '@/utils/streamTypes'
import type {
  ChatMessage,
  ChatMessageUser,
  ChatMessageAssistant,
  ChatMessageUserContent,
  ChatMessageAssistantContent,
} from '@/aipanel/types'
import {
  ChatMessageType,
  ChatMessageUserContentType,
  ChatMessageAssistantContentType,
  isAssistantMessage,
} from '@/aipanel/types'
import { useUnifiedStore } from '@/core/unifiedStore'

export interface SessionInfo {
  sessionId: string
  createdAt: Date
  lastActivity: Date
}

export class SessionManager {
  // 当前会话ID（直接公开）
  public currentSessionId = ref<string | null>(null)

  // 消息列表状态（直接公开）
  public messages = ref<ChatMessage[]>([])

  // 会话状态（直接公开）
  public isLoading = ref(false)
  public sessionError = ref<string | null>(null)

  // 消息发送状态（直接公开）
  public isSending = ref(false)
  private currentAbortController: AbortController | null = null
  private currentAIMessageId: string | null = null

  // 用户脚本执行函数引用
  private executeUserScript: ReturnType<typeof useUnifiedStore>['executeUserScript']

  constructor() {
    // 初始化用户脚本执行函数引用
    const unifiedStore = useUnifiedStore()
    this.executeUserScript = unifiedStore.executeUserScript
  }

  /**
   * 清空当前会话的消息（不创建新会话）
   */
  clearCurrentSession(): void {
    // 如果有进行中的消息请求，先中止
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      console.log('中止了进行中的消息请求')
    }

    // 清空当前会话ID
    this.currentSessionId.value = null

    // 清空消息列表
    this.messages.value = []

    // 重置发送状态
    this.isSending.value = false
    this.currentAbortController = null
    this.currentAIMessageId = null

    // 重置错误状态
    this.sessionError.value = null

    console.log('当前会话状态已完全重置')
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      console.log(`删除会话: ${sessionId}`)
      await fetchClient.delete(API_ENDPOINTS.deleteSession(sessionId))

      // 如果删除的是当前会话，清空当前会话ID
      if (this.currentSessionId.value === sessionId) {
        this.currentSessionId.value = null
      }

      console.log(`会话删除成功: ${sessionId}`)
    } catch (error) {
      console.error(`删除会话失败: ${sessionId}`, error)
      throw new Error(`删除会话失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 中止当前正在发送的消息
   */
  abortCurrentMessage(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
      this.isSending.value = false
      console.log('当前消息已中止')
    }
  }

  /**
   * 处理流式JSON消息
   */
  private async handleStreamMessage(message: StreamChunk): Promise<ChatMessage | undefined> {
    switch (message.type) {
      case StreamChunkType.TEXT:
        await this.handleTextMessage(message.content)
        break
      case StreamChunkType.ERROR:
        await this.handleErrorMessage(message.content)
        break
      case StreamChunkType.TOOL_USE:
        return await this.handleToolMessage(message.content)
      default:
        console.warn('未知的消息类型:', message.type)
        break
    }
  }

  /**
   * 处理文本消息
   */
  private async handleTextMessage(content: string): Promise<void> {
    // 实时更新AI消息内容
    const currentMessage = this.messages.value.find((msg) => msg.id === this.currentAIMessageId) as
      | ChatMessageAssistant
      | undefined
    if (currentMessage && isAssistantMessage(currentMessage)) {
      // 查找最后一个文本片段，如果没有则创建新的文本片段
      const lastContent = currentMessage.content[currentMessage.content.length - 1]
      if (lastContent && lastContent.type === ChatMessageAssistantContentType.TEXT) {
        lastContent.content += content
      } else {
        currentMessage.content.push({
          type: ChatMessageAssistantContentType.TEXT,
          content: content,
        })
      }
    }
  }
  /**
   * 处理工具消息
   */
  private async handleToolMessage(content: string): Promise<ChatMessageUser> {
    console.log('收到工具调用消息:', content)
    // 实时更新AI消息内容，添加工具调用片段
    const currentMessage = this.messages.value.find((msg) => msg.id === this.currentAIMessageId) as
      | ChatMessageAssistant
      | undefined
    if (currentMessage && isAssistantMessage(currentMessage)) {
      currentMessage.content.push({
        type: ChatMessageAssistantContentType.TOOL_USE,
        content: content,
      })
    }
    return {
      id: `${ChatMessageType.AUTO_REPLY}-${Date.now()}`,
      type: ChatMessageType.AUTO_REPLY,
      content: [
        {
          type: ChatMessageUserContentType.TEXT,
          content: '场景里有山有水，天空万里无云，是一个风景区',
        },
      ],
      timestamp: new Date().toISOString(), // 使用ISO格式与后端保持一致
    }
  }
  /**
   * 处理错误消息
   */
  private async handleErrorMessage(content: string): Promise<void> {
    // 暂时简单的console输出错误信息
    console.error('AI通信错误:', content)
  }

  /**
   * 处理发送消息
   */
  async handleSendMessage(message: string): Promise<void> {
    // 检查是否有活跃会话，如果没有则创建新会话
    if (!this.currentSessionId.value) {
      try {
        console.log('没有活跃会话，创建新会话...')
        this.isLoading.value = true
        this.sessionError.value = null

        const response = await fetchClient.post<CreateSessionResponse>(API_ENDPOINTS.createSession)
        const sessionId = response.data.session_id

        // 保存当前会话ID
        this.currentSessionId.value = sessionId

        console.log(`会话创建成功: ${sessionId}`)
      } catch (error) {
        console.error('创建会话失败:', error)
        this.sessionError.value = error instanceof Error ? error.message : '创建会话失败'
        throw new Error(`创建会话失败: ${error instanceof Error ? error.message : '未知错误'}`)
      } finally {
        this.isLoading.value = false
      }
    }

    const sessionId = this.currentSessionId.value
    if (!sessionId) {
      throw new Error('无法获取会话信息')
    }

    // 设置发送状态
    this.isSending.value = true
    try {
      let needContinue = true
      let sendMsg = message
      let sendType = ChatMessageType.USER
      while (needContinue) {
        this.currentAbortController = new AbortController()

        // 添加用户消息
        const userMessage: ChatMessageUser = {
          id: `${sendType}-${Date.now()}`,
          type: sendType as ChatMessageType.USER | ChatMessageType.AUTO_REPLY,
          content: [
            {
              type: ChatMessageUserContentType.TEXT,
              content: sendMsg,
            },
          ],
          timestamp: new Date().toISOString(), // 使用ISO格式与后端保持一致
        }
        if (sendType === ChatMessageType.USER) {
          this.messages.value.push(userMessage)

          // 添加助手消息占位符（初始为空内容）
          this.currentAIMessageId = `assistant-${Date.now()}`
          const aiMessage: ChatMessage = {
            id: this.currentAIMessageId,
            type: ChatMessageType.ASSISTANT,
            content: [], // 初始为空数组
            timestamp: new Date().toISOString(), // 使用ISO格式与后端保持一致
          }
          this.messages.value.push(aiMessage)
        }

        console.log(`发送消息到会话: ${sessionId}`)
        console.log(`用户消息: `, userMessage.content)

        let continueMsg: ChatMessage | undefined
        // 使用fetch客户端处理流式响应
        await fetchClient.stream<StreamChunk>(
          'POST',
          API_ENDPOINTS.sendMessage,
          async (message: StreamChunk) => {
            // 处理流式JSON消息
            continueMsg = await this.handleStreamMessage(message)

            console.log('收到流式JSON消息:', message)
          },
          {
            session_id: sessionId,
            message: userMessage, // 发送 ChatMessageUser 对象
          },
          { signal: this.currentAbortController!.signal },
        )
        if (continueMsg) {
          this.currentAbortController = null
          sendType = continueMsg.type
          sendMsg = continueMsg.content[0].content
        } else {
          needContinue = false
        }
      }
      // 响应完成
      console.log('AI响应完成')
      this.isSending.value = false
    } catch (error) {
      console.error('发送消息失败:', error)

      let errorMessage = '发送消息失败'
      if (error instanceof Error) {
        errorMessage = error.message
      }

      throw error instanceof Error ? error : new Error(errorMessage)
    } finally {
      this.isSending.value = false
      this.currentAbortController = null
      this.currentAIMessageId = null
    }
  }

  /**
   * 恢复会话
   */
  async restoreSession(sessionId: string): Promise<void> {
    try {
      // 设置当前会话ID
      this.currentSessionId.value = sessionId

      console.log(`获取会话历史: ${sessionId}`)
      const response = await fetchClient.get<ChatMessage[]>(API_ENDPOINTS.getHistory(sessionId))
      const messages = response.data
      console.log(`成功获取会话历史: ${messages.length} 条消息`)

      // 更新消息列表
      this.messages.value = []

      // 后端现在直接返回 ChatMessageUser 和 ChatMessageAssistant 类型
      // 时间戳已经是ISO格式，无需转换
      this.messages.value.push(...messages)

      console.log(`会话恢复成功: ${sessionId}`)
    } catch (error) {
      console.error(`恢复会话失败: ${sessionId}`, error)
      this.messages.value = []
      throw new Error(`恢复会话失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 获取所有会话的摘要信息
   */
  async getAllSessions(): Promise<SessionSummary[]> {
    try {
      console.log('获取所有会话列表...')

      const response = await fetchClient.get<AllSessionsResponse>(API_ENDPOINTS.getAllSessions)
      const sessionsData = response.data

      console.log(`成功获取会话列表: ${sessionsData.total_count} 个会话`)
      return sessionsData.sessions
    } catch (error) {
      console.error('获取会话列表失败:', error)
      throw new Error(`获取会话列表失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
}

// 创建全局实例
export const SESSION_MANAGER = new SessionManager()
