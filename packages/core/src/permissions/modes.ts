import type { ModeName, PermissionRule } from './types.js'

/**
 * Build — full agent. Dangerous ops ask, everything else allowed.
 * Typical use: autonomous coding tasks.
 */
const BUILD: PermissionRule[] = [
  { tool: 'bash',       action: 'ask',   reason: 'shell execution' },
  { tool: 'write_file', action: 'ask',   reason: 'file write' },
  { tool: 'edit_file',  action: 'ask',   reason: 'file edit' },
  { tool: '*',          action: 'allow' },
]

/**
 * Edit — file operations only. No shell execution.
 * Typical use: make targeted edits, no side effects.
 */
const EDIT: PermissionRule[] = [
  { tool: 'bash',       action: 'deny',  reason: 'shell execution disabled in edit mode' },
  { tool: 'write_file', action: 'ask',   reason: 'file write' },
  { tool: 'edit_file',  action: 'ask',   reason: 'file edit' },
  { tool: '*',          action: 'allow' },
]

/**
 * Ask — read-only. No writes, no execution.
 * Typical use: code review, explanation, Q&A.
 */
const ASK: PermissionRule[] = [
  { tool: 'bash',            action: 'deny', reason: 'read-only mode' },
  { tool: 'write_file',      action: 'deny', reason: 'read-only mode' },
  { tool: 'edit_file',       action: 'deny', reason: 'read-only mode' },
  { tool: 'lsp_diagnostics', action: 'allow' },
  { tool: 'lsp_refs',        action: 'allow' },
  { tool: 'read_file',       action: 'allow' },
  { tool: 'glob',            action: 'allow' },
  { tool: 'grep',            action: 'allow' },
  { tool: 'web_fetch',       action: 'allow' },
  { tool: 'web_search',      action: 'allow' },
  { tool: 'token_count',     action: 'allow' },
  { tool: 'todo',            action: 'allow' },
  { tool: '*',               action: 'deny',  reason: 'read-only mode — only read tools allowed' },
]

export const MODE_RULES: Record<ModeName, PermissionRule[]> = {
  build: BUILD,
  edit: EDIT,
  ask: ASK,
}

export const MODE_DESCRIPTIONS: Record<ModeName, string> = {
  build: 'Build  — full agent, dangerous ops require confirmation',
  edit:  'Edit   — file edits only, no shell execution',
  ask:   'Ask    — read-only, no writes or execution',
}
