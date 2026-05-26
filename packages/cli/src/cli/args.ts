/**
 * CLI argument parsing — runs once at process startup.
 * Entirely separate from REPL session commands (/status, /clear, etc.)
 */

import { parseArgs } from 'node:util'
import type { ModeName } from '@nekocode/core/permissions'

export interface CliArgs {
  /** Model identifier, e.g. "claude-sonnet-4-6" */
  model?: string
  /** Starting mode (default: build) */
  mode: ModeName
  /** Working directory override (default: process.cwd()) */
  cwd: string
  /** Resume an existing session by ID prefix */
  session?: string
  /** One-shot prompt — run and exit (non-interactive) */
  prompt?: string
  /** Print version and exit */
  version: boolean
  /** Print help and exit */
  help: boolean
}

const USAGE = `
Usage: nekocode [options] [prompt]

Options:
  -m, --model <id>          Model to use (default: from config)
  --mode <build|edit|ask>   Starting mode (default: build)
  --cwd <dir>               Working directory (default: current dir)
  --session <id>            Resume existing session by ID prefix
  -v, --version             Show version
  -h, --help                Show this help

Modes:
  build   Full agent — dangerous ops require confirmation
  edit    File edits only — shell execution disabled
  ask     Read-only — no writes or execution

Examples:
  nekocode                          Interactive session
  nekocode "fix the type errors"    One-shot prompt
  nekocode --mode ask               Start in read-only mode
  nekocode --session abc123         Resume a previous session
  nekocode --model gemini-2.5-pro   Use a specific model
`.trim()

const VALID_MODES = new Set<string>(['build', 'edit', 'ask'])

export function parseCliArgs(argv = process.argv.slice(2)): CliArgs | null {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        model:    { type: 'string',  short: 'm' },
        mode:     { type: 'string' },
        cwd:      { type: 'string' },
        session:  { type: 'string' },
        version:  { type: 'boolean', short: 'v', default: false },
        help:     { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (err) {
    console.error(`Error: ${(err as Error).message}\n`)
    console.error(USAGE)
    process.exit(1)
  }

  const { values, positionals } = parsed

  if (values.help) {
    console.log(USAGE)
    return null
  }

  if (values.version) {
    // Version injected at build time
    console.log(`nekocode ${process.env['NEKOCODE_VERSION'] ?? '0.1.0'}`)
    return null
  }

  const rawMode = (values.mode as string | undefined) ?? 'build'
  if (!VALID_MODES.has(rawMode)) {
    console.error(`Error: --mode must be one of: build, edit, ask (got "${rawMode}")`)
    process.exit(1)
  }

  const modelVal = values.model as string | undefined
  const sessionVal = values.session as string | undefined
  const promptVal = positionals.join(' ').trim() || undefined
  return {
    ...(modelVal !== undefined ? { model: modelVal } : {}),
    mode:    rawMode as ModeName,
    cwd:     (values.cwd as string | undefined) ?? process.cwd(),
    ...(sessionVal !== undefined ? { session: sessionVal } : {}),
    ...(promptVal !== undefined ? { prompt: promptVal } : {}),
    version: false,
    help:    false,
  }
}

export { USAGE }
