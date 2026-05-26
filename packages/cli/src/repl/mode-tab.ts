/**
 * Tab-based mode cycling for the REPL.
 *
 * When the input is empty and user presses Tab, cycle through modes.
 * Current mode is always visible in the prompt/status bar.
 */

import type { ModeName } from '@nekocode/core/permissions'
import { MODE_DESCRIPTIONS } from '@nekocode/core/permissions'

const MODE_CYCLE: ModeName[] = ['build', 'edit', 'ask']

const MODE_BADGE: Record<ModeName, string> = {
  build: 'BUILD',
  edit:  'EDIT ',
  ask:   'ASK  ',
}

// ANSI color codes for each mode badge
const MODE_COLOR: Record<ModeName, string> = {
  build: '\x1b[32m', // green
  edit:  '\x1b[33m', // yellow
  ask:   '\x1b[34m', // blue
}
const RESET = '\x1b[0m'

export function nextMode(current: ModeName): ModeName {
  const idx = MODE_CYCLE.indexOf(current)
  return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]!
}

/** Render the mode badge for the prompt line, e.g. "[BUILD] > " */
export function renderModeBadge(mode: ModeName): string {
  const color = MODE_COLOR[mode]!
  return `${color}[${MODE_BADGE[mode]!.trim()}]${RESET} `
}

/** Full status bar line shown below the input (single line) */
export function renderStatusBar(mode: ModeName, tokens: number, contextWindow: number): string {
  const pct = ((tokens / contextWindow) * 100).toFixed(1)
  const color = MODE_COLOR[mode]
  const desc = MODE_DESCRIPTIONS[mode].split('—')[0]!.trim()
  return (
    `${color}${desc}${RESET}` +
    `  │  tokens ~${tokens.toLocaleString()} / ${(contextWindow / 1000).toFixed(0)}k (${pct}%)` +
    `  │  Tab to switch mode`
  )
}
