import { randomUUID } from 'node:crypto'
import type {
  McpTransport,
  McpServerConfig,
  McpInitializeResult,
  McpToolDefinition,
  McpToolCallParams,
  McpToolCallResult,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcMessage,
} from './types.js'
import { StdioTransport } from './transport/stdio.js'
import { SseTransport } from './transport/sse.js'

const MCP_PROTOCOL_VERSION = '2024-11-05'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

export class McpClient {
  private transport: McpTransport
  private pending = new Map<string | number, Pending>()
  private _serverInfo?: McpInitializeResult['serverInfo']
  private closed = false

  constructor(cfg: McpServerConfig) {
    this.transport = cfg.type === 'stdio'
      ? new StdioTransport(cfg)
      : new SseTransport(cfg)

    this.transport.onMessage((msg) => this.handleMessage(msg))
    this.transport.onClose(() => { this.closed = true })
    this.transport.onError(() => { /* errors surface per-call */ })
  }

  get serverInfo() { return this._serverInfo }

  async initialize(): Promise<McpInitializeResult> {
    const result = await this.request<McpInitializeResult>('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      clientInfo: { name: 'nekocode', version: '0.1.0' },
    })
    this._serverInfo = result.serverInfo
    // send initialized notification
    this.transport.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    return result
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const res = await this.request<{ tools: McpToolDefinition[] }>('tools/list', {})
    return res.tools
  }

  async callTool(params: McpToolCallParams): Promise<McpToolCallResult> {
    return this.request<McpToolCallResult>('tools/call', params)
  }

  close(): void {
    this.transport.close()
  }

  private request<T>(method: string, params: unknown): Promise<T> {
    const id = randomUUID()
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP timeout: ${method}`))
      }, 30_000)

      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v as T) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      this.transport.send(req)
    })
  }

  private handleMessage(msg: JsonRpcMessage): void {
    if (!('id' in msg) || msg.id == null) return // notification
    const res = msg as JsonRpcResponse
    const pending = this.pending.get(res.id)
    if (!pending) return
    this.pending.delete(res.id)
    if (res.error) {
      pending.reject(new Error(`MCP error ${res.error.code}: ${res.error.message}`))
    } else {
      pending.resolve(res.result)
    }
  }
}

export async function connectMcp(cfg: McpServerConfig): Promise<McpClient> {
  const client = new McpClient(cfg)
  await client.initialize()
  return client
}
