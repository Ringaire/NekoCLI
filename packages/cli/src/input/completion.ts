import type { SuggestionItem } from '../tui/input/Suggestions.js'

interface CommandMeta {
  description: string
  argHint?: string
}

export const COMMAND_META: Record<string, CommandMeta> = {
  // Session
  new:         { description: 'New session (clear history)' },
  sessions:    { description: 'List saved sessions, or load one', argHint: '[id-prefix]' },
  compact:     { description: 'Summarize conversation history to save tokens' },
  rename:      { description: 'Rename current session',          argHint: '<name>' },
  clear:       { description: 'Clear conversation history' },
  status:      { description: 'Token usage, tools, skills' },
  skills:      { description: 'List loaded skills' },
  exit:        { description: 'Exit NekoCode' },
  help:        { description: 'Show help' },
  // Agent
  model:       { description: 'Show or switch model',              argHint: '[provider/model-id]' },
  connect:     { description: 'Configure provider connection',    argHint: '[provider] [apiKey]' },
  mcp:         { description: 'Add MCP server for this session',  argHint: '<name> <command>' },
  // Code
  review:      { description: 'Code review (git diff)',          argHint: '[commit|branch|PR]' },
  diff:        { description: 'Show git diff in chat' },
  init:        { description: 'Generate / update AGENTS.md',     argHint: '[focus]' },
  // Permissions
  allow:       { description: 'Allow a tool in this session',    argHint: '<tool> [path]' },
  deny:        { description: 'Deny a tool in this session',     argHint: '<tool> [path]' },
  perms:       { description: 'Show active permission rules' },
  // Plugins
  plugin:      { description: 'Manage plugins',                  argHint: 'install|list|remove <pkg>' },
  think:       { description: 'Toggle extended thinking/reasoning',      argHint: '[on|off] [budget]' },
  orchestrate: { description: 'Toggle orchestrator mode (multi-agent + model routing)' },
  project:     { description: 'Project config management',                argHint: 'init' },
  // Config
  reload:      { description: 'Hot-reload config, MCP servers, and skills' },
}

export const STATIC_COMMANDS = Object.keys(COMMAND_META)

/**
 * Returns suggestion items for a `/prefix` input.
 */
export function getCommandSuggestions(input: string, dynamicCmds: string[] = []): SuggestionItem[] {
  if (!input.startsWith('/')) return []

  const prefix = input.slice(1).toLowerCase()
  const all = [...STATIC_COMMANDS, ...dynamicCmds.filter(c => !COMMAND_META[c])]

  const seen = new Set<string>()
  const result: SuggestionItem[] = []

  for (const cmd of all) {
    if (cmd.startsWith(prefix) && !seen.has(cmd)) {
      seen.add(cmd)
      const meta = COMMAND_META[cmd]
      result.push({
        id: `cmd-${cmd}`,
        value: `/${cmd}`,
        label: `/${cmd}`,
        ...(meta?.description !== undefined ? { description: meta.description } : {}),
        icon: '',
      } as SuggestionItem)
    }
  }
  return result
}

/**
 * Returns the argument hint for a fully-typed command (no args yet).
 * e.g. "/allow " → "<tool> [path]"
 */
export function getArgumentHint(input: string): string | undefined {
  if (!input.startsWith('/')) return undefined
  const trimmed = input.trim()
  // Command complete and either no args yet or ends with a space just typed
  const parts = trimmed.split(/\s+/)
  const cmdName = parts[0]?.slice(1)?.toLowerCase()
  if (!cmdName || (parts.length === 1 && !input.endsWith(' '))) return undefined
  return COMMAND_META[cmdName]?.argHint
}

/**
 * Inline ghost text for partial command (suffix to complete).
 */
export function getInlineGhost(input: string, suggestions: SuggestionItem[]): string {
  if (!input.startsWith('/') || suggestions.length === 0) return ''
  const first = suggestions[0]
  if (!first || first.value === input) return ''
  return first.value.slice(input.length)
}
