/**
 * REPL main loop — pure readline I/O, event-driven rendering.
 *
 * All agent progress arrives via the EventBus; the loop just subscribes
 * and writes to stdout. No raw-mode / keypress conflicts.
 */

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import type { DefaultPermissionEngine } from '@nekocode/core/permissions'
import type { NekoRuntime, Session } from '@nekocode/core'
import { parseInput } from '../input/parser.js'
import { expandMentions, buildMessageWithMentions } from '../input/mentions.js'
import { handleReplCommand, type ReplCommandContext } from './commands.js'
import { nextMode, renderModeBadge, renderStatusBar } from './mode-tab.js'

export interface ReplLoopOptions {
  runtime: NekoRuntime
  session: Session
  permissions: DefaultPermissionEngine
  model: string
  onMessage: (text: string, injectNote?: string) => Promise<void>
  onSessionClear: () => void
}

export async function startReplLoop(opts: ReplLoopOptions): Promise<void> {
  const { runtime, permissions, model, onMessage, onSessionClear } = opts
  let session = opts.session

  // Subscribe to agent events — stream output to terminal
  const unsub = [
    runtime.bus.on('agent:text', ({ delta }) => {
      output.write(delta)
    }),
    runtime.bus.on('agent:text_done', () => {
      output.write('\n')
    }),
    runtime.bus.on('agent:tool_call', ({ toolName, callId }) => {
      output.write(`\n[tool] ${toolName} [${callId.slice(0, 8)}]\n`)
    }),
    runtime.bus.on('tool:end', ({ toolName, result, durationMs }) => {
      const status = result.ok ? '[ok]' : '[err]'
      output.write(`  ${status} ${toolName} (${durationMs}ms)\n`)
    }),
    runtime.bus.on('agent:error', ({ error }) => {
      output.write(`\n[error] ${error}\n`)
    }),
    runtime.bus.on('agent:done', () => {
      // Prompt re-rendered by readline after onMessage resolves
    }),
  ]

  const rl = readline.createInterface({ input, output, terminal: true })

  const prompt = () => renderModeBadge(permissions.mode) + '> '

  const printStatus = () => {
    const tokens = estimateSessionTokens(session)
    output.write(renderStatusBar(permissions.mode, tokens, 200_000) + '\n')
  }

  printStatus()

  // Main input loop
  let running = true
  while (running) {
    let line: string
    try {
      line = await rl.question(prompt())
    } catch {
      break  // EOF / Ctrl-D
    }

    const raw = line.trim()
    if (!raw) continue

    // Tab-in-prompt mode cycling isn't available in readline mode;
    // use /mode or just Tab at start of input (treated as switch via keypress future)

    const parsed = parseInput(raw)

    if (parsed.kind === 'command') {
      // Special: Tab cycling via /tab or empty command
      const ctx: ReplCommandContext = {
        runtime,
        session,
        model,
        setModel: () => { /* non-interactive loop: ignore model switch */ },
        permissions,
        print: (text) => output.write(text + '\n'),
        clearSession: () => { onSessionClear(); session = opts.session },
        replaceSession: (s) => { session = s },
        exit: () => { running = false; rl.close() },
      }

      // Allow /build /edit /ask as mode shortcuts
      if (parsed.name === 'build' || parsed.name === 'edit' || parsed.name === 'ask') {
        permissions.setMode(parsed.name as 'build' | 'edit' | 'ask')
        printStatus()
        continue
      }

      if (parsed.name === 'tab') {
        permissions.setMode(nextMode(permissions.mode))
        printStatus()
        continue
      }

      const result = await handleReplCommand(parsed.name, parsed.args, ctx)
      if (result.output) output.write(result.output + '\n')
      if (!result.handled) output.write(`Unknown command: /${parsed.name}  (type /help)\n`)

      if (result.injectPrompt) {
        await onMessage('', result.injectPrompt)
      }
      continue
    }

    // Regular message with @mentions
    const expanded = await expandMentions(parsed.mentions, session.meta.cwd)
    const messageText = buildMessageWithMentions(parsed.text, expanded)

    output.write('\n')
    await onMessage(messageText)
    printStatus()
  }

  for (const u of unsub) u()
  rl.close()
}

function estimateSessionTokens(session: Session): number {
  let total = 0
  for (const msg of session.messages) {
    for (const block of msg.content) {
      const t = block.text ?? JSON.stringify(block.toolInput ?? block.toolResult ?? '')
      total += Math.ceil(t.length / 3.5)
    }
  }
  return total
}
