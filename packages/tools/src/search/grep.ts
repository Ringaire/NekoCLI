import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

const execAsync = promisify(exec)

interface GrepInput {
  pattern: string
  /** File glob to search within, e.g. "*.ts" or "src/**" */
  include?: string
  /** Search root */
  path?: string
  /** Case-insensitive, default false */
  ignoreCase?: boolean
  /** Max results, default 100 */
  limit?: number
}

export const grepTool: Tool<GrepInput> = {
  name: 'grep',
  description: 'Search file contents for a pattern using ripgrep',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (regex)' },
      include: { type: 'string', description: 'File glob filter (e.g. "*.ts")' },
      path: { type: 'string', description: 'Search root directory' },
      ignoreCase: { type: 'boolean', description: 'Case-insensitive search', default: false },
      limit: { type: 'integer', description: 'Max results (default 100)', default: 100 },
    },
    required: ['pattern'],
  },

  async execute(input: GrepInput, ctx: ToolContext): Promise<ToolResult> {
    const root = resolve(ctx.cwd, input.path ?? '.')
    const limit = input.limit ?? 100

    // Prefer ripgrep (rg), fallback to grep
    const hasRg = await execAsync('which rg').then(() => true).catch(() => false)
    const cmd = hasRg
      ? [
          'rg',
          '--line-number',
          '--no-heading',
          '--color=never',
          `--max-count=${limit}`,
          input.ignoreCase ? '--ignore-case' : '',
          input.include ? `--glob=${input.include}` : '',
          '--',
          input.pattern,
          root,
        ].filter(Boolean).join(' ')
      : [
          'grep',
          '-rn',
          '--include=' + (input.include ?? '*'),
          input.ignoreCase ? '-i' : '',
          '--',
          `'${input.pattern}'`,
          root,
        ].filter(Boolean).join(' ')

    try {
      const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 })
      const lines = stdout.trim().split('\n').filter(Boolean).slice(0, limit)
      if (lines.length === 0) {
        return { ok: true, content: [{ type: 'text', text: 'No matches found.' }] }
      }
      const text = lines.join('\n') + (lines.length >= limit ? `\n(limited to ${limit} results)` : '')
      return { ok: true, content: [{ type: 'text', text }], metadata: { count: lines.length } }
    } catch (err: unknown) {
      // grep/rg exit 1 = no matches (not an error)
      if (typeof err === 'object' && err !== null && 'code' in err && (err as NodeJS.ErrnoException).code === '1') {
        return { ok: true, content: [{ type: 'text', text: 'No matches found.' }] }
      }
      return { ok: false, error: String(err), code: 'GREP_ERROR' }
    }
  },
}
