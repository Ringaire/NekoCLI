import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'
import { listSessions, loadSession } from '@nekocode/core'

// ── list_sessions ─────────────────────────────────────────────────────────────

interface ListSessionsInput {
  limit?: number
}

export const listSessionsTool: Tool<ListSessionsInput> = {
  name: 'list_sessions',
  description: 'List recent NekoCode conversation sessions with metadata (title, date, message count)',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Max sessions to return (default 20)', default: 20 },
    },
    required: [],
  },

  async execute(input: ListSessionsInput, _ctx: ToolContext): Promise<ToolResult> {
    const sessions = await listSessions()
    const limit = input.limit ?? 20
    const slice = sessions.slice(0, limit)

    if (slice.length === 0) {
      return { ok: true, content: [{ type: 'text', text: 'No sessions found.' }] }
    }

    const lines = slice.map((s, i) => {
      const date = new Date(s.updatedAt).toLocaleString()
      const title = s.title ?? '(untitled)'
      return `${i + 1}. [${s.id.slice(0, 8)}] ${title}\n   ${date} · ${s.messageCount} messages · ${s.cwd}`
    })

    return {
      ok: true,
      content: [{ type: 'text', text: lines.join('\n\n') }],
      metadata: { count: slice.length },
    }
  },
}

// ── search_sessions ───────────────────────────────────────────────────────────

interface SearchSessionsInput {
  query: string
  limit?: number
}

export const searchSessionsTool: Tool<SearchSessionsInput> = {
  name: 'search_sessions',
  description: 'Search through previous conversation sessions by keyword (title, path, or message content)',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keyword' },
      limit: { type: 'integer', description: 'Max results (default 10)', default: 10 },
    },
    required: ['query'],
  },

  async execute(input: SearchSessionsInput, _ctx: ToolContext): Promise<ToolResult> {
    const sessions = await listSessions()
    const q = input.query.toLowerCase()
    const limit = input.limit ?? 10

    // First-pass: match on title / cwd / id
    const candidates = sessions.filter(s =>
      (s.title ?? '').toLowerCase().includes(q) ||
      s.id.toLowerCase().startsWith(q) ||
      s.cwd.toLowerCase().includes(q),
    )

    // Second-pass on message content for unmatched sessions (up to 30 total checked)
    const remaining = sessions.filter(s => !candidates.includes(s)).slice(0, 30)
    for (const s of remaining) {
      const sess = await loadSession(s.id)
      if (!sess) continue
      const hit = sess.messages.some(m => m.content.some(b => b.text?.toLowerCase().includes(q)))
      if (hit) candidates.push(s)
    }

    const slice = candidates.slice(0, limit)
    if (slice.length === 0) {
      return { ok: true, content: [{ type: 'text', text: `No sessions matching "${input.query}".` }] }
    }

    const lines = await Promise.all(slice.map(async (s) => {
      const date = new Date(s.updatedAt).toLocaleString()
      const title = s.title ?? '(untitled)'
      let entry = `[${s.id.slice(0, 8)}] ${title}\n   ${date} · ${s.cwd}`

      // Show a matching snippet if available
      const sess = await loadSession(s.id)
      if (sess) {
        const match = sess.messages.find(m => m.content.some(b => b.text?.toLowerCase().includes(q)))
        const snippet = match?.content.find(b => b.text?.toLowerCase().includes(q))?.text?.slice(0, 100)
        if (snippet) entry += `\n   "…${snippet}…"`
      }
      return entry
    }))

    return {
      ok: true,
      content: [{ type: 'text', text: lines.join('\n\n') }],
      metadata: { count: slice.length },
    }
  },
}
