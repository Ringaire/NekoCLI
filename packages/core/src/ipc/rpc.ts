import { randomUUID } from 'node:crypto'
import type { IpcTransport, IpcMessage, IpcRequest, IpcResponse } from './types.js'

type PendingCall = {
  resolve: (result: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/** Thin RPC layer over IpcTransport — request/response matching with timeouts */
export class RpcClient {
  private readonly pending = new Map<string, PendingCall>()

  constructor(
    private readonly transport: IpcTransport,
    private readonly timeoutMs = 30_000,
  ) {
    transport.onMessage((msg) => {
      if (msg.kind === 'response') this.handleResponse(msg)
    })
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = randomUUID()
    const req: IpcRequest = { kind: 'request', id, method, params }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`RPC timeout: ${method} (${this.timeoutMs}ms)`))
      }, this.timeoutMs)

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.transport.send(req)
    })
  }

  private handleResponse(msg: IpcResponse): void {
    const pending = this.pending.get(msg.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(msg.id)
    if (msg.error) {
      pending.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }))
    } else {
      pending.resolve(msg.result)
    }
  }

  /** Cancel all in-flight calls (e.g. on transport close) */
  flush(reason = 'transport closed'): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
      this.pending.delete(id)
    }
  }
}

/** Minimal RPC server — maps method names to async handlers */
export class RpcServer {
  private readonly handlers = new Map<string, (params: unknown) => Promise<unknown>>()

  constructor(private readonly transport: IpcTransport) {
    transport.onMessage((msg) => {
      if (msg.kind === 'request') void this.handleRequest(msg)
    })
  }

  handle(method: string, fn: (params: unknown) => Promise<unknown>): void {
    this.handlers.set(method, fn)
  }

  private async handleRequest(req: IpcRequest): Promise<void> {
    const handler = this.handlers.get(req.method)
    if (!handler) {
      this.transport.send({
        kind: 'response',
        id: req.id,
        error: { message: `Unknown method: ${req.method}`, code: 'NOT_FOUND' },
      })
      return
    }
    try {
      const result = await handler(req.params)
      this.transport.send({ kind: 'response', id: req.id, result })
    } catch (err) {
      this.transport.send({
        kind: 'response',
        id: req.id,
        error: { message: String(err), code: 'HANDLER_ERROR' },
      })
    }
  }
}
