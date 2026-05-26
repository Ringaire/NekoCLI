import type { ToolResult, PermissionRequest } from '../tools/types.js'

// ── Base ─────────────────────────────────────────────────────────────────────

export interface BaseEvent {
  /** Monotonic timestamp (ms) */
  ts: number
  /** Session this event belongs to */
  sessionId: string
}

// ── Tool events ───────────────────────────────────────────────────────────────

export interface ToolStartEvent extends BaseEvent {
  type: 'tool:start'
  callId: string
  toolName: string
  input: unknown
}

export interface ToolEndEvent extends BaseEvent {
  type: 'tool:end'
  callId: string
  toolName: string
  result: ToolResult
  durationMs: number
}

export interface ToolPermissionEvent extends BaseEvent {
  type: 'tool:permission'
  callId: string
  toolName: string
  request: PermissionRequest
}

// ── Agent / LLM events ────────────────────────────────────────────────────────

export interface AgentThinkingEvent extends BaseEvent {
  type: 'agent:thinking'
}

/** Streaming reasoning/thinking token delta */
export interface AgentReasoningEvent extends BaseEvent {
  type: 'agent:reasoning'
  delta: string
}

/** Reasoning block complete */
export interface AgentReasoningDoneEvent extends BaseEvent {
  type: 'agent:reasoning_done'
  full: string
}

export interface AgentTextEvent extends BaseEvent {
  type: 'agent:text'
  /** Streaming chunk */
  delta: string
}

export interface AgentTextDoneEvent extends BaseEvent {
  type: 'agent:text_done'
  full: string
}

export interface AgentToolCallEvent extends BaseEvent {
  type: 'agent:tool_call'
  callId: string
  toolName: string
  input: unknown
}

export interface AgentErrorEvent extends BaseEvent {
  type: 'agent:error'
  error: string
  code?: string
}

export interface AgentDoneEvent extends BaseEvent {
  type: 'agent:done'
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'error'
}

// ── Session events ────────────────────────────────────────────────────────────

export interface SessionStartEvent extends BaseEvent {
  type: 'session:start'
  cwd: string
}

export interface SessionEndEvent extends BaseEvent {
  type: 'session:end'
  reason: 'user' | 'error' | 'timeout'
}

export interface SessionMessageEvent extends BaseEvent {
  type: 'session:message'
  role: 'user' | 'assistant'
  content: string
}

// ── Context events ────────────────────────────────────────────────────────────

export interface ContextUpdateEvent extends BaseEvent {
  type: 'context:update'
  tokenCount: number
  messageCount: number
}

export interface ContextTruncateEvent extends BaseEvent {
  type: 'context:truncate'
  removedMessages: number
  strategy: string
}

export interface ContextSummaryEvent extends BaseEvent {
  type: 'context:summary'
  summary: string
  replacedMessages: number
}

// ── Process events (cross-process / IPC) ─────────────────────────────────────

export interface ProcessReadyEvent extends BaseEvent {
  type: 'process:ready'
  pid: number
  managerId: string
}

export interface ProcessExitEvent extends BaseEvent {
  type: 'process:exit'
  pid: number
  managerId: string
  code: number | null
  signal: string | null
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type NekoEvent =
  | ToolStartEvent
  | ToolEndEvent
  | ToolPermissionEvent
  | AgentThinkingEvent
  | AgentReasoningEvent
  | AgentReasoningDoneEvent
  | AgentTextEvent
  | AgentTextDoneEvent
  | AgentToolCallEvent
  | AgentErrorEvent
  | AgentDoneEvent
  | SessionStartEvent
  | SessionEndEvent
  | SessionMessageEvent
  | ContextUpdateEvent
  | ContextTruncateEvent
  | ContextSummaryEvent
  | ProcessReadyEvent
  | ProcessExitEvent

export type NekoEventType = NekoEvent['type']

export type EventOfType<T extends NekoEventType> = Extract<NekoEvent, { type: T }>
