import { createConnection, createServer, type Socket, type Server } from 'node:net'
import type { IpcMessage, IpcTransport } from './types.js'

// Messages are newline-delimited JSON over a Unix socket
class SocketTransport implements IpcTransport {
  private messageHandler?: (msg: IpcMessage) => void
  private closeHandler?: () => void
  private errorHandler?: (err: Error) => void
  private buf = ''

  constructor(private readonly socket: Socket) {
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      this.buf += chunk
      const lines = this.buf.split('\n')
      this.buf = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const msg = JSON.parse(trimmed) as IpcMessage
          this.messageHandler?.(msg)
        } catch {
          // malformed frame — drop
        }
      }
    })
    socket.on('close', () => this.closeHandler?.())
    socket.on('error', (err) => this.errorHandler?.(err))
  }

  send(msg: IpcMessage): void {
    this.socket.write(JSON.stringify(msg) + '\n')
  }

  onMessage(handler: (msg: IpcMessage) => void): void {
    this.messageHandler = handler
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  onError(handler: (err: Error) => void): void {
    this.errorHandler = handler
  }

  close(): void {
    this.socket.destroy()
  }
}

/** Connect to an existing Unix socket server (sub-manager → main manager) */
export function connectSocket(path: string): Promise<IpcTransport> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path)
    socket.once('connect', () => resolve(new SocketTransport(socket)))
    socket.once('error', (err: Error) => reject(err))
  })
}

/** Create a Unix socket server and call onConnection for each client */
export function listenSocket(
  path: string,
  onConnection: (transport: IpcTransport) => void,
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => {
      onConnection(new SocketTransport(socket))
    })
    server.once('error', (err: Error) => reject(err))
    server.listen(path, () => resolve(server))
  })
}
