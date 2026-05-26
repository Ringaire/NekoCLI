export type MessageRole = 'user' | 'assistant' | 'tool_result'

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  toolUseId?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown
  isError?: boolean
}

export interface Message {
  id: string
  role: MessageRole
  content: ContentBlock[]
  ts: number
  /** Approximate token count (estimated) */
  tokens?: number
}

export interface SessionMeta {
  id: string
  title?: string
  cwd: string
  createdAt: number
  updatedAt: number
  messageCount: number
  /** Provider + model used */
  model?: string
}

export interface Session {
  meta: SessionMeta
  messages: Message[]
}
