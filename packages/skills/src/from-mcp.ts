import type { Skill } from './types.js'
import type { McpToolDefinition } from '@nekocode/mcp'

function schemaToPrompt(schema: McpToolDefinition['inputSchema']): string {
  const props = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  const lines: string[] = []

  for (const [key, raw] of Object.entries(props)) {
    const prop = raw as Record<string, unknown>
    const type = typeof prop['type'] === 'string' ? prop['type'] : 'any'
    const desc = typeof prop['description'] === 'string' ? ` — ${prop['description']}` : ''
    const req = required.has(key) ? '' : ' (optional)'
    lines.push(`  - \`${key}\` (${type}${req})${desc}`)
  }

  return lines.length > 0 ? `**Parameters:**\n${lines.join('\n')}` : ''
}

/**
 * Convert MCP tool definitions from one server into Skills.
 * The tool name is namespaced as `serverName__toolName`.
 */
export function mcpToolsToSkills(
  defs: McpToolDefinition[],
  serverName: string,
): Skill[] {
  return defs.map((def): Skill => {
    const toolName = `${serverName}__${def.name}`
    const description = def.description?.split('\n')[0]?.trim() ?? def.name
    const schemaSection = schemaToPrompt(def.inputSchema)

    const prompt = [
      def.description ?? def.name,
      '',
      schemaSection,
      '',
      `Use the \`${toolName}\` tool to invoke this capability.`,
    ].filter(line => line !== undefined).join('\n').trim()

    return {
      name: toolName,
      description,
      prompt,
      tools: [toolName],
      source: 'mcp',
    }
  })
}
