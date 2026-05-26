// MCP protocol types (JSON-RPC 2.0 + MCP spec)

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

// ── MCP initialize ────────────────────────────────────────────────────────────

export interface McpClientInfo {
  name: string
  version: string
}

export interface McpCapabilities {
  tools?: Record<string, never>
  resources?: Record<string, never>
  prompts?: Record<string, never>
}

export interface McpInitializeParams {
  protocolVersion: string
  capabilities: McpCapabilities
  clientInfo: McpClientInfo
}

export interface McpInitializeResult {
  protocolVersion: string
  capabilities: McpCapabilities
  serverInfo: { name: string; version: string }
}

// ── MCP tools ─────────────────────────────────────────────────────────────────

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }
}

export interface McpToolsListResult {
  tools: McpToolDefinition[]
}

export interface McpToolCallParams {
  name: string
  arguments?: Record<string, unknown>
}

export interface McpToolCallContent {
  type: 'text' | 'image' | 'resource'
  text?: string
  data?: string
  mimeType?: string
}

export interface McpToolCallResult {
  content: McpToolCallContent[]
  isError?: boolean
}

// ── Transport interface ───────────────────────────────────────────────────────

export interface McpTransport {
  send(msg: JsonRpcMessage): void
  onMessage(handler: (msg: JsonRpcMessage) => void): void
  onClose(handler: () => void): void
  onError(handler: (err: Error) => void): void
  close(): void
}

// ── Server config ─────────────────────────────────────────────────────────────

export type McpServerConfig =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
