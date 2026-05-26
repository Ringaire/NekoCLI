import type { NekoRuntime } from '@nekocode/core'
import type { Session } from '@nekocode/core'

function bar(used: number, total: number, width = 20): string {
  const filled = Math.round((used / total) * width)
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']'
}

function pct(used: number, total: number): string {
  return ((used / total) * 100).toFixed(1) + '%'
}

function estimateTokens(session: Session): number {
  let total = 0
  for (const msg of session.messages) {
    for (const block of msg.content) {
      const text = block.text ?? JSON.stringify(block.toolInput ?? block.toolResult ?? '')
      total += Math.ceil(text.length / 3.5)
    }
  }
  return total
}

const CONTEXT_WINDOWS: Record<string, number> = {
  'claude': 200_000,
  'gpt-4o': 128_000,
  'gpt-4': 128_000,
  'o1': 200_000,
  'o3': 200_000,
  'gemini-2.5': 1_000_000,
  'gemini-2.0': 1_000_000,
  'gemini-1.5': 1_000_000,
}

function getContextWindow(model: string): number {
  for (const [key, size] of Object.entries(CONTEXT_WINDOWS)) {
    if (model.toLowerCase().includes(key)) return size
  }
  return 128_000 // safe default
}

export function renderStatus(runtime: NekoRuntime, session: Session, model: string): string {
  const sep = '─'.repeat(50)
  const tokens = estimateTokens(session)
  const window = getContextWindow(model)
  const tokenBar = bar(Math.min(tokens, window), window)
  const memoryCount = 0 // TODO: wire memory when available

  const mcpNames = Array.from(
    (runtime as unknown as { mcpServers: Map<string, unknown> }).mcpServers?.keys() ?? [],
  )

  const skills = runtime.skills?.list() ?? []
  const tools = runtime.tools.list()

  const lines = [
    sep,
    ' NekoCode — Session Status',
    sep,
    ` Session  : ${session.meta.id.slice(0, 8)}`,
    ` Model    : ${model}`,
    ` CWD      : ${session.meta.cwd}`,
    ` Created  : ${new Date(session.meta.createdAt).toLocaleString()}`,
    sep,
    ` Messages : ${session.messages.length}`,
    ` Tokens   : ~${tokens.toLocaleString()} / ${window.toLocaleString()}`,
    `            ${tokenBar} ${pct(tokens, window)}`,
    sep,
    ` Tools    : ${tools.length} registered`,
    ` Skills   : ${skills.length}${skills.length > 0 ? ` (${skills.map(s => s.name).join(', ')})` : ''}`,
    ` MCP      : ${mcpNames.length > 0 ? mcpNames.join(', ') : 'none'}`,
    sep,
  ]

  return lines.join('\n')
}
