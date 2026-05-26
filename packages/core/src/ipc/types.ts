import type { NekoEvent } from '../events/types.js'

// ── Envelope ──────────────────────────────────────────────────────────────────

/** Every IPC frame is one of these — request, response, or fire-and-forget event */
export type IpcMessage =
  | IpcRequest
  | IpcResponse
  | IpcEventFrame

export interface IpcRequest {
  kind: 'request'
  id: string
  method: string
  params?: unknown
}

export interface IpcResponse {
  kind: 'response'
  id: string
  result?: unknown
  error?: { message: string; code?: string }
}

export interface IpcEventFrame {
  kind: 'event'
  event: NekoEvent
}

// ── Well-known RPC methods ────────────────────────────────────────────────────

export type IpcMethod =
  | 'session.create'
  | 'session.send'
  | 'session.abort'
  | 'session.close'
  | 'tool.permission_response'
  | 'ping'

export interface SessionCreateParams {
  sessionId: string
  cwd: string
  env?: Record<string, string>
}

export interface SessionSendParams {
  sessionId: string
  content: string
}

export interface SessionAbortParams {
  sessionId: string
}

export interface ToolPermissionResponseParams {
  callId: string
  granted: boolean
}

// ── Transport interface ───────────────────────────────────────────────────────

export interface IpcTransport {
  /** Send a message to the remote end */
  send(msg: IpcMessage): void
  /** Register a handler for incoming messages */
  onMessage(handler: (msg: IpcMessage) => void): void
  /** Called when the connection is cleanly closed */
  onClose(handler: () => void): void
  /** Called on transport errors */
  onError(handler: (err: Error) => void): void
  close(): void
}
