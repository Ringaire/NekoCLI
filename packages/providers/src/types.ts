import type { JSONSchema } from '@nekocode/core/tools/types'

// ── Request ───────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: JSONSchema
}

export type MessageRole = 'user' | 'assistant'

export interface TextPart {
  type: 'text'
  text: string
}

export interface ToolUsePart {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface ToolResultPart {
  type: 'tool_result'
  toolUseId: string
  content: string
  isError?: boolean
}

export type ContentPart = TextPart | ToolUsePart | ToolResultPart

export interface Message {
  role: MessageRole
  content: ContentPart[]
}

export interface ThinkingOptions {
  enabled: boolean
  /** Max tokens the model may spend on reasoning (default 8000) */
  budgetTokens?: number
}

export interface ProviderRequest {
  model: string
  messages: Message[]
  systemPrompt?: string
  tools?: ToolDefinition[]
  /** 0–1 */
  temperature?: number
  maxTokens?: number
  /** Enable extended thinking/reasoning output */
  thinking?: ThinkingOptions
  /** Provider-specific passthrough */
  extra?: Record<string, unknown>
}

// ── Events (streaming) ────────────────────────────────────────────────────────

export interface TextDeltaEvent {
  type: 'text_delta'
  delta: string
}

export interface ToolCallStartEvent {
  type: 'tool_call_start'
  id: string
  name: string
}

export interface ToolCallDeltaEvent {
  type: 'tool_call_delta'
  id: string
  /** Partial JSON of the input */
  delta: string
}

export interface ToolCallDoneEvent {
  type: 'tool_call_done'
  id: string
  name: string
  input: unknown
}

export interface UsageEvent {
  type: 'usage'
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'error'

export interface DoneEvent {
  type: 'done'
  stopReason: StopReason
}

export interface ThinkingDeltaEvent {
  type: 'thinking_delta'
  delta: string
}

export interface ThinkingDoneEvent {
  type: 'thinking_done'
  full: string
}

export type ProviderEvent =
  | TextDeltaEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallDoneEvent
  | ThinkingDeltaEvent
  | ThinkingDoneEvent
  | UsageEvent
  | DoneEvent

// ── Provider interface ────────────────────────────────────────────────────────

export interface Provider {
  readonly id: string
  stream(req: ProviderRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent>
}

// ── Model compat flags (borrowed from OpenClaw pattern) ───────────────────────

export interface ModelInfo {
  id: string
  providerId: string
  contextWindow: number
  maxOutputTokens: number
  supportsTools: boolean
  supportsVision: boolean
  /** Cost per million tokens */
  cost?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
}
