/**
 * /rc — hidden raw-command channel.
 *
 * Executes a shell command directly in the REPL without going through the
 * model. Output is shown inline. Not listed in /help, not in autocomplete.
 *
 * Use cases:
 *   - Quick shell checks without polluting conversation history
 *   - Debug / introspection during development
 *   - Running setup commands before handing control back to the agent
 *
 * Usage: /rc <shell command>
 * Example: /rc git status
 *          /rc cat package.json | jq .version
 */

import { spawn } from 'node:child_process'

export interface RcResult {
  stdout: string
  stderr: string
  code: number | null
  durationMs: number
}

export function runRc(command: string, cwd: string, signal?: AbortSignal): Promise<RcResult> {
  return new Promise((resolve) => {
    const start = Date.now()
    let stdout = ''
    let stderr = ''

    const proc = spawn('bash', ['-c', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    if (signal) {
      signal.addEventListener('abort', () => proc.kill('SIGTERM'), { once: true })
    }

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code, durationMs: Date.now() - start })
    })

    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, code: 1, durationMs: Date.now() - start })
    })
  })
}

export function formatRcOutput(result: RcResult, command: string): string {
  const lines: string[] = [`$ ${command}`]

  if (result.stdout.trim()) lines.push(result.stdout.trimEnd())
  if (result.stderr.trim()) lines.push(`[stderr]\n${result.stderr.trimEnd()}`)

  if (result.code !== 0) {
    lines.push(`[exit ${result.code ?? 'killed'} · ${result.durationMs}ms]`)
  } else {
    lines.push(`[ok · ${result.durationMs}ms]`)
  }

  return lines.join('\n')
}
