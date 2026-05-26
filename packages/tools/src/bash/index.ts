import { spawn } from 'node:child_process'
import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000  // 10 min hard cap
const SIGKILL_GRACE_MS = 5_000  // SIGTERM → wait → SIGKILL

interface BashInput {
  command: string
  /**
   * Timeout in milliseconds. Defaults to 120000 (2 min).
   * Set higher for long-running builds, tests, or installs (max 600000 = 10 min).
   * If a command times out, retry with a larger value.
   */
  timeout?: number
  /** Working directory override */
  cwd?: string
}

function killProc(proc: ReturnType<typeof spawn>): void {
  proc.kill('SIGTERM')
  const forceKill = setTimeout(() => { proc.kill('SIGKILL') }, SIGKILL_GRACE_MS)
  proc.once('close', () => clearTimeout(forceKill))
}

export const bashTool: Tool<BashInput> = {
  name: 'bash',
  description:
    'Execute a shell command. For long-running commands (builds, installs, tests) set timeout_ms explicitly. Default 120 s, max 600 s.',
  permission: 'always',

  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      timeout: {
        type: 'integer',
        description: `Timeout in ms. Default ${DEFAULT_TIMEOUT_MS} (2 min), max ${MAX_TIMEOUT_MS} (10 min). Increase for slow builds/tests/installs.`,
        default: DEFAULT_TIMEOUT_MS,
        minimum: 1000,
        maximum: MAX_TIMEOUT_MS,
      },
      cwd: { type: 'string', description: 'Working directory override' },
    },
    required: ['command'],
  },

  buildPermissionRequest(input) {
    const timeoutSec = Math.round((input.timeout ?? DEFAULT_TIMEOUT_MS) / 1000)
    return {
      level: 'always',
      title: 'Run shell command',
      description: `Execute: ${input.command} (timeout ${timeoutSec}s)`,
      preview: `$ ${input.command}`,
    }
  },

  execute(input: BashInput, ctx: ToolContext): Promise<ToolResult> {
    return new Promise((resolve) => {
      const requestedMs = input.timeout ?? DEFAULT_TIMEOUT_MS
      const timeout = Math.min(Math.max(requestedMs, 1000), MAX_TIMEOUT_MS)
      const cwd = input.cwd ?? ctx.cwd

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let settled = false

      const proc = spawn('bash', ['-c', input.command], {
        cwd,
        env: { ...process.env, ...ctx.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const settle = (result: ToolResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }

      const timer = setTimeout(() => {
        timedOut = true
        killProc(proc)
      }, timeout)

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

      ctx.signal.addEventListener('abort', () => killProc(proc), { once: true })

      proc.on('close', (code) => {
        if (timedOut) {
          settle({
            ok: false,
            error: `Command timed out after ${timeout}ms. Retry with a higher timeout (max ${MAX_TIMEOUT_MS}ms) if the command needs more time.`,
            code: 'TIMEOUT',
          })
          return
        }
        const output = [stdout, stderr].filter(Boolean).join('\n')
        if (code === 0) {
          settle({ ok: true, content: [{ type: 'text', text: output || '(no output)' }] })
        } else {
          settle({ ok: false, error: output || `Exit code ${code}`, code: `EXIT_${code}` })
        }
      })

      proc.on('error', (err) => {
        settle({ ok: false, error: err.message, code: 'SPAWN_ERROR' })
      })
    })
  },
}
