import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

const execAsync = promisify(exec)

// ── Diagnostics ──────────────────────────────────────────────────────────────

interface LspDiagnosticsInput {
  path?: string
}

export const lspDiagnosticsTool: Tool<LspDiagnosticsInput> = {
  name: 'lsp_diagnostics',
  description: 'Run TypeScript compiler diagnostics (tsc --noEmit) and return errors/warnings',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Project root (defaults to cwd)' },
    },
    required: [],
  },

  async execute(input: LspDiagnosticsInput, ctx: ToolContext): Promise<ToolResult> {
    const root = resolve(ctx.cwd, input.path ?? '.')

    // Prefer local tsc, fall back to global
    const tsc = await execAsync('which tsc', { cwd: root })
      .then(r => r.stdout.trim())
      .catch(() => 'npx tsc')

    try {
      const { stdout, stderr } = await execAsync(`${tsc} --noEmit`, {
        cwd: root,
        maxBuffer: 2 * 1024 * 1024,
        signal: ctx.signal,
      }).catch((err: { stdout?: string; stderr?: string; code?: number }) => ({
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        code: err.code,
      })) as { stdout: string; stderr: string }

      const output = (stdout + stderr).trim()
      if (!output) {
        return { ok: true, content: [{ type: 'text', text: 'No diagnostics. Project compiles cleanly.' }] }
      }

      // Truncate to 50KB
      const truncated = output.length > 51200
        ? output.slice(0, 51200) + '\n\n[truncated]'
        : output

      return { ok: true, content: [{ type: 'text', text: truncated }] }
    } catch (err) {
      return { ok: false, error: String(err), code: 'LSP_ERROR' }
    }
  },
}

// ── References / Definition ───────────────────────────────────────────────────
// Full LSP protocol requires a running language server. For now we delegate to
// ripgrep/grep as a lightweight approximation and expose a structured interface
// that can be upgraded to a real LSP client later.

interface LspRefsInput {
  symbol: string
  path?: string
  include?: string
}

export const lspRefsTool: Tool<LspRefsInput> = {
  name: 'lsp_refs',
  description: 'Find all references to a symbol using text search (ripgrep). Use lsp_diagnostics for type errors.',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Symbol name to search for' },
      path: { type: 'string', description: 'Search root (defaults to cwd)' },
      include: { type: 'string', description: 'File glob filter (e.g. "*.ts")' },
    },
    required: ['symbol'],
  },

  async execute(input: LspRefsInput, ctx: ToolContext): Promise<ToolResult> {
    const root = resolve(ctx.cwd, input.path ?? '.')
    const hasRg = await execAsync('which rg').then(() => true).catch(() => false)

    const pattern = `\\b${input.symbol}\\b`
    const cmd = hasRg
      ? [
          'rg', '--line-number', '--no-heading', '--color=never',
          input.include ? `--glob=${input.include}` : '',
          '--', pattern, root,
        ].filter(Boolean).join(' ')
      : [
          'grep', '-rn',
          input.include ? `--include=${input.include}` : '',
          '--', `'${pattern}'`, root,
        ].filter(Boolean).join(' ')

    try {
      const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 })
      const lines = stdout.trim().split('\n').filter(Boolean).slice(0, 200)
      if (lines.length === 0) {
        return { ok: true, content: [{ type: 'text', text: `No references to '${input.symbol}' found.` }] }
      }
      const text = lines.join('\n') + (lines.length >= 200 ? '\n(limited to 200 results)' : '')
      return { ok: true, content: [{ type: 'text', text }], metadata: { count: lines.length } }
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as NodeJS.ErrnoException).code === '1') {
        return { ok: true, content: [{ type: 'text', text: `No references to '${input.symbol}' found.` }] }
      }
      return { ok: false, error: String(err), code: 'LSP_ERROR' }
    }
  },
}
