import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { McpTransport, JsonRpcMessage, McpServerConfig } from '../types.js'

export class StdioTransport implements McpTransport {
  private proc: ChildProcess
  private messageHandler?: (msg: JsonRpcMessage) => void
  private closeHandler?: () => void
  private errorHandler?: (err: Error) => void

  constructor(cfg: Extract<McpServerConfig, { type: 'stdio' }>) {
    this.proc = spawn(cfg.command, cfg.args ?? [], {
      env: { ...process.env, ...cfg.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const rl = createInterface({ input: this.proc.stdout! })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const msg = JSON.parse(trimmed) as JsonRpcMessage
        this.messageHandler?.(msg)
      } catch {
        // ignore malformed
      }
    })

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      // surface server stderr as transport errors
      this.errorHandler?.(new Error(`MCP stderr: ${chunk.toString().trim()}`))
    })

    this.proc.on('close', () => this.closeHandler?.())
    this.proc.on('error', (err) => this.errorHandler?.(err))
  }

  send(msg: JsonRpcMessage): void {
    this.proc.stdin?.write(JSON.stringify(msg) + '\n')
  }

  onMessage(handler: (msg: JsonRpcMessage) => void): void {
    this.messageHandler = handler
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  onError(handler: (err: Error) => void): void {
    this.errorHandler = handler
  }

  close(): void {
    this.proc.kill()
  }
}
