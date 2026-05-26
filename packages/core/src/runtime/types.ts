// McpServerConfig is inlined here to avoid circular deps (mcp → core → mcp)
export type McpServerConfig =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }

export interface NekoConfig {
  mcpServers?: Record<string, McpServerConfig>
  toolPaths?: string[]
}

export interface McpServerState {
  name: string
  cfg: McpServerConfig
  close: () => void
  toolNames: string[]
  skillNames: string[]
}
