import type { Tool, ToolContext, ToolResult, ToolResultContent } from '@nekocode/core/tools/types'
import type { McpToolDefinition, McpServerConfig } from './types.js'
import { connectMcp, type McpClient } from './client.js'

/** Wrap a single MCP tool definition as a NekoCode Tool */
function wrapMcpTool(
  def: McpToolDefinition,
  client: McpClient,
  serverName: string,
): Tool<Record<string, unknown>> {
  return {
    name: `${serverName}__${def.name}`,
    description: def.description ?? def.name,
    permission: 'auto',

    inputSchema: def.inputSchema as unknown as import('@nekocode/core/tools/types').JSONSchema,

    buildPermissionRequest(input) {
      return {
        level: 'auto',
        title: `MCP: ${def.name}`,
        description: `Run ${def.name} on ${serverName}`,
        preview: JSON.stringify(input, null, 2).slice(0, 200),
      }
    },

    async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      // Respect abort signal — close is async so best-effort
      ctx.signal.addEventListener('abort', () => client.close(), { once: true })

      const result = await client.callTool({ name: def.name, arguments: input })

      if (result.isError) {
        const errorText = result.content.map(c => c.text ?? '').join('\n')
        return { ok: false, error: errorText, code: 'MCP_TOOL_ERROR' }
      }

      const content = result.content.flatMap((c): ToolResultContent[] => {
        if (c.type === 'text' && c.text != null) return [{ type: 'text', text: c.text }]
        if (c.type === 'image' && c.data != null) return [{ type: 'text', text: `[image: ${c.mimeType ?? 'unknown'}]` }]
        return []
      })

      return { ok: true, content: content.length > 0 ? content : [{ type: 'text', text: '(no output)' }] }
    },
  }
}

/**
 * Connect to an MCP server and return all its tools as NekoCode Tool instances.
 * The server name is used as a namespace prefix (server__toolName).
 */
export async function loadMcpTools(
  cfg: McpServerConfig,
  serverName: string,
): Promise<{ tools: Tool<never>[]; close: () => void }> {
  const client = await connectMcp(cfg)
  const defs = await client.listTools()
  const tools: Tool<never>[] = defs.map(def => wrapMcpTool(def, client, serverName) as Tool<never>)
  return { tools, close: () => client.close() }
}
