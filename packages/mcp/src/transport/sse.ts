import type { McpTransport, JsonRpcMessage, McpServerConfig } from '../types.js'

export class SseTransport implements McpTransport {
  private messageHandler?: (msg: JsonRpcMessage) => void
  private closeHandler?: () => void
  private errorHandler?: (err: Error) => void
  private abortController = new AbortController()
  private postUrl: string

  constructor(private readonly cfg: Extract<McpServerConfig, { type: 'sse' }>) {
    this.postUrl = cfg.url
    void this.connect()
  }

  private async connect(): Promise<void> {
    try {
      const res = await fetch(this.cfg.url, {
        headers: { ...this.cfg.headers, Accept: 'text/event-stream' },
        signal: this.abortController.signal,
      })

      if (!res.ok || !res.body) {
        this.errorHandler?.(new Error(`SSE connect failed: HTTP ${res.status}`))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue
            try {
              const msg = JSON.parse(data) as JsonRpcMessage
              this.messageHandler?.(msg)
            } catch { /* ignore */ }
          }
        }
      }
      this.closeHandler?.()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.errorHandler?.(err as Error)
      }
    }
  }

  send(msg: JsonRpcMessage): void {
    void fetch(this.postUrl, {
      method: 'POST',
      headers: { ...this.cfg.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).catch((err: Error) => this.errorHandler?.(err))
  }

  onMessage(handler: (msg: JsonRpcMessage) => void): void { this.messageHandler = handler }
  onClose(handler: () => void): void { this.closeHandler = handler }
  onError(handler: (err: Error) => void): void { this.errorHandler = handler }

  close(): void {
    this.abortController.abort()
  }
}
