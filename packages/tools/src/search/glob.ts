import { readdir, stat } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

interface GlobInput {
  pattern: string
  /** Search root, defaults to cwd */
  path?: string
  /** Max results, default 100 */
  limit?: number
}

function matchGlob(pattern: string, str: string): boolean {
  // Convert glob to regex: * → [^/]*, ** → .*, ? → [^/]
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\x00/g, '.*')
  return new RegExp(`^${escaped}$`).test(str)
}

async function walk(dir: string, root: string, pattern: string, results: string[], limit: number): Promise<void> {
  if (results.length >= limit) return
  let entries: { name: string; isDirectory(): boolean }[]
  try {
    entries = (await readdir(dir, { withFileTypes: true })).map(e => ({
      name: String(e.name),
      isDirectory: () => e.isDirectory(),
    }))
  } catch {
    return
  }
  for (const entry of entries) {
    if (results.length >= limit) break
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    const rel = relative(root, full)
    if (entry.isDirectory()) {
      await walk(full, root, pattern, results, limit)
    } else if (matchGlob(pattern, rel) || matchGlob(pattern, entry.name)) {
      results.push(rel)
    }
  }
}

export const globTool: Tool<GlobInput> = {
  name: 'glob',
  description: 'Find files matching a glob pattern (e.g. "src/**/*.ts")',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern to match' },
      path: { type: 'string', description: 'Search root directory' },
      limit: { type: 'integer', description: 'Max results (default 100)', default: 100 },
    },
    required: ['pattern'],
  },

  async execute(input: GlobInput, ctx: ToolContext): Promise<ToolResult> {
    const root = resolve(ctx.cwd, input.path ?? '.')
    const limit = input.limit ?? 100
    const results: string[] = []
    await walk(root, root, input.pattern, results, limit)
    if (results.length === 0) {
      return { ok: true, content: [{ type: 'text', text: 'No files found.' }] }
    }
    const text = results.join('\n') + (results.length >= limit ? `\n(limited to ${limit} results)` : '')
    return { ok: true, content: [{ type: 'text', text }], metadata: { count: results.length } }
  },
}
