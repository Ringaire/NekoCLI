/**
 * Agent turn loop — the core of NekoCode.
 *
 * One "turn" = send messages to provider → stream response → execute any
 * tool calls → loop until the model stops calling tools.
 *
 * All progress is emitted through the EventBus so the REPL (and future
 * remote adapters) can subscribe and render independently.
 */

import { randomUUID } from 'node:crypto'
import type { Provider, ProviderRequest, ContentPart, ToolDefinition } from '@nekocode/providers/types'
import type {
  ToolRegistry, ToolContext, ToolResult,
  EventBus,
  Session, Message as SessMsg, ContentBlock,
} from '@nekocode/core'
import { appendMessage } from '@nekocode/core'
import type { DefaultPermissionEngine } from '@nekocode/core/permissions'
import type { NekoEventType, EventOfType } from '@nekocode/core'

// ── Type conversions ──────────────────────────────────────────────────────────

function sessBlockToProvPart(b: ContentBlock): ContentPart | null {
  if (b.type === 'text' && b.text != null) {
    return { type: 'text', text: b.text }
  }
  if (b.type === 'tool_use' && b.toolUseId != null) {
    return { type: 'tool_use', id: b.toolUseId, name: b.toolName ?? '', input: b.toolInput }
  }
  if (b.type === 'tool_result' && b.toolUseId != null) {
    return {
      type: 'tool_result',
      toolUseId: b.toolUseId,
      content: String(b.toolResult ?? ''),
      ...(b.isError !== undefined ? { isError: b.isError } : {}),
    }
  }
  return null
}

function buildProviderMessages(messages: SessMsg[]): import('@nekocode/providers/types').Message[] {
  const result: import('@nekocode/providers/types').Message[] = []
  for (const m of messages) {
    const parts = m.content
      .map(sessBlockToProvPart)
      .filter((p): p is ContentPart => p !== null)
    if (parts.length === 0) continue

    if (m.role === 'assistant') {
      result.push({ role: 'assistant', content: parts })
    } else {
      // 'user' and 'tool_result' both map to provider 'user' role;
      // merge consecutive tool_result blocks into the preceding user turn
      const last = result[result.length - 1]
      if (m.role === 'tool_result' && last?.role === 'user') {
        last.content.push(...parts)
      } else {
        result.push({ role: 'user', content: parts })
      }
    }
  }
  return result
}

// ── Event factory ─────────────────────────────────────────────────────────────

function makeEv<T extends NekoEventType>(
  type: T,
  sessionId: string,
  payload: Omit<EventOfType<T>, 'type' | 'ts' | 'sessionId'>,
): EventOfType<T> {
  return { type, ts: Date.now(), sessionId, ...payload } as EventOfType<T>
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface AgentTurnOptions {
  provider: Provider
  session: Session
  tools: ToolRegistry
  bus: EventBus
  permissions: DefaultPermissionEngine
  systemPrompt?: string
  signal?: AbortSignal
  /** Guard against infinite tool loops (default 20) */
  maxTurns?: number
  /** Persist messages to disk (default true). Set false for ephemeral sub-agents. */
  persist?: boolean
  /** Enable extended thinking/reasoning output */
  thinking?: import('@nekocode/providers/types').ThinkingOptions
  /**
   * Called when a tool needs user confirmation (action='ask').
   * Return true to allow, false to deny.
   * If omitted, 'ask' actions are allowed by default.
   */
  requestPermission?: (callId: string, toolName: string, input: unknown) => Promise<boolean>
}

// ── Main turn loop ────────────────────────────────────────────────────────────

export async function runAgentTurn(opts: AgentTurnOptions): Promise<void> {
  const { provider, session, tools, bus, permissions, signal } = opts
  const sid = session.meta.id
  const maxTurns = opts.maxTurns ?? 20

  const ev = <T extends NekoEventType>(type: T, payload: Omit<EventOfType<T>, 'type' | 'ts' | 'sessionId'>) =>
    makeEv(type, sid, payload)

  bus.emit(ev('agent:thinking', {}))

  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal?.aborted) break

    // Build provider request
    const toolDefs: ToolDefinition[] = tools.list().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))

    const req: ProviderRequest = {
      model: session.meta.model ?? 'claude-sonnet-4-6',
      messages: buildProviderMessages(session.messages),
      ...(opts.systemPrompt !== undefined ? { systemPrompt: opts.systemPrompt } : {}),
      ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
      ...(opts.thinking !== undefined ? { thinking: opts.thinking } : {}),
    }

    // Stream
    let textBuf = ''
    const toolCalls: Array<{ id: string; name: string; input: unknown }> = []

    for await (const event of provider.stream(req, signal)) {
      if (signal?.aborted) break

      if (event.type === 'thinking_delta') {
        bus.emit(ev('agent:reasoning', { delta: event.delta }))
      } else if (event.type === 'thinking_done') {
        bus.emit(ev('agent:reasoning_done', { full: event.full }))
      } else if (event.type === 'text_delta') {
        textBuf += event.delta
        bus.emit(ev('agent:text', { delta: event.delta }))
      } else if (event.type === 'tool_call_done') {
        toolCalls.push({ id: event.id, name: event.name, input: event.input })
        bus.emit(ev('agent:tool_call', { callId: event.id, toolName: event.name, input: event.input }))
      }
    }

    // Persist assistant message
    if (textBuf || toolCalls.length > 0) {
      const blocks: ContentBlock[] = []
      if (textBuf) blocks.push({ type: 'text', text: textBuf })
      for (const tc of toolCalls) {
        blocks.push({ type: 'tool_use', toolUseId: tc.id, toolName: tc.name, toolInput: tc.input })
      }
      const assistantMsg: SessMsg = { id: randomUUID(), role: 'assistant', content: blocks, ts: Date.now() }
      session.messages.push(assistantMsg)
      if (opts.persist !== false) await appendMessage(sid, assistantMsg)

      if (textBuf) bus.emit(ev('agent:text_done', { full: textBuf }))
    }

    // No tool calls → done
    if (toolCalls.length === 0) break

    // Execute tools
    const resultBlocks: ContentBlock[] = []

    for (const tc of toolCalls) {
      if (signal?.aborted) break

      const tool = tools.get(tc.name)
      if (!tool) {
        resultBlocks.push({ type: 'tool_result', toolUseId: tc.id, toolResult: `Tool '${tc.name}' not found`, isError: true })
        continue
      }

      const decision = permissions.evaluate({ tool: tc.name, description: `Run ${tc.name}` })

      if (decision === 'deny') {
        resultBlocks.push({ type: 'tool_result', toolUseId: tc.id, toolResult: 'Denied by permission policy', isError: true })
        continue
      }

      if (decision === 'ask' && opts.requestPermission) {
        const allowed = await opts.requestPermission(tc.id, tc.name, tc.input)
        if (!allowed) {
          resultBlocks.push({ type: 'tool_result', toolUseId: tc.id, toolResult: 'Denied by user', isError: true })
          continue
        }
      }

      const ctx: ToolContext = {
        cwd: session.meta.cwd,
        sessionId: sid,
        signal: signal ?? new AbortController().signal,
        emit: () => { /* tool-internal events; no-op for now */ },
        requestPermission: async () => true,
        env: process.env as Record<string, string>,
      }

      const startMs = Date.now()
      bus.emit(ev('tool:start', { callId: tc.id, toolName: tc.name, input: tc.input }))

      let result: ToolResult
      try {
        result = await (tool.execute as (i: unknown, c: ToolContext) => Promise<ToolResult>)(tc.input, ctx)
      } catch (err) {
        result = { ok: false, error: String(err), code: 'TOOL_EXCEPTION' }
      }

      bus.emit(ev('tool:end', { callId: tc.id, toolName: tc.name, result, durationMs: Date.now() - startMs }))

      const text = result.ok
        ? result.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join('\n')
        : result.error

      resultBlocks.push({
        type: 'tool_result',
        toolUseId: tc.id,
        toolResult: text,
        ...(result.ok ? {} : { isError: true }),
      })
    }

    // Persist tool results
    const toolResultMsg: SessMsg = { id: randomUUID(), role: 'tool_result', content: resultBlocks, ts: Date.now() }
    session.messages.push(toolResultMsg)
    if (opts.persist !== false) await appendMessage(sid, toolResultMsg)
  }

  bus.emit(ev('agent:done', { stopReason: 'end_turn' }))
}
