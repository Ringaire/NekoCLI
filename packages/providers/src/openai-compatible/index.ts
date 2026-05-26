import OpenAI from 'openai'
import type {
  Provider, ProviderRequest, ProviderEvent,
  Message, ToolDefinition,
} from '../types.js'

function toOpenAIMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      const parts: OpenAI.ChatCompletionContentPart[] = []
      const toolResults: OpenAI.ChatCompletionToolMessageParam[] = []

      for (const p of m.content) {
        if (p.type === 'text') {
          parts.push({ type: 'text', text: p.text })
        } else if (p.type === 'tool_result') {
          toolResults.push({
            role: 'tool',
            tool_call_id: p.toolUseId,
            content: p.content,
          })
        }
      }
      if (parts.length > 0) result.push({ role: 'user', content: parts })
      result.push(...toolResults)
    } else {
      const textParts = m.content.filter(p => p.type === 'text').map(p => p.type === 'text' ? p.text : '').join('')
      const toolCalls = m.content.filter(p => p.type === 'tool_use').map(p => {
        if (p.type !== 'tool_use') return null!
        return {
          id: p.id,
          type: 'function' as const,
          function: { name: p.name, arguments: JSON.stringify(p.input) },
        }
      })
      result.push({
        role: 'assistant',
        content: textParts || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
    }
  }
  return result
}

function toOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }))
}

export interface OpenAICompatibleProviderOptions {
  apiKey?: string
  baseURL?: string
}

/**
 * Streaming parser for <think>…</think> tags (DeepSeek R1, Qwen QwQ, etc.).
 * Buffers until a complete tag boundary is seen, then emits typed events.
 */
class ThinkTagParser {
  private buf = ''
  private inThink = false
  private thinkBuf = ''

  feed(text: string): Array<{ type: 'thinking_delta' | 'thinking_done' | 'text_delta'; value: string }> {
    const events: Array<{ type: 'thinking_delta' | 'thinking_done' | 'text_delta'; value: string }> = []
    this.buf += text

    while (this.buf.length > 0) {
      if (this.inThink) {
        const closeIdx = this.buf.indexOf('</think>')
        if (closeIdx === -1) {
          // No close tag yet — emit what we have, keep a safety margin for partial tags
          const safe = this.buf.length > 8 ? this.buf.length - 8 : 0
          if (safe > 0) {
            const chunk = this.buf.slice(0, safe)
            this.thinkBuf += chunk
            events.push({ type: 'thinking_delta', value: chunk })
            this.buf = this.buf.slice(safe)
          }
          break
        }
        const chunk = this.buf.slice(0, closeIdx)
        if (chunk) {
          this.thinkBuf += chunk
          events.push({ type: 'thinking_delta', value: chunk })
        }
        events.push({ type: 'thinking_done', value: this.thinkBuf })
        this.thinkBuf = ''
        this.inThink = false
        this.buf = this.buf.slice(closeIdx + 8)
      } else {
        const openIdx = this.buf.indexOf('<think>')
        if (openIdx === -1) {
          // No open tag — check partial match at end
          const partial = longestSuffixMatch(this.buf, '<think>')
          const emit = this.buf.slice(0, this.buf.length - partial)
          if (emit) events.push({ type: 'text_delta', value: emit })
          this.buf = this.buf.slice(emit.length)
          break
        }
        if (openIdx > 0) {
          events.push({ type: 'text_delta', value: this.buf.slice(0, openIdx) })
        }
        this.inThink = true
        this.buf = this.buf.slice(openIdx + 7)
      }
    }
    return events
  }

  flush(): Array<{ type: 'thinking_done' | 'text_delta'; value: string }> {
    const events: Array<{ type: 'thinking_done' | 'text_delta'; value: string }> = []
    if (this.inThink && this.thinkBuf) {
      events.push({ type: 'thinking_done', value: this.thinkBuf })
    } else if (this.buf) {
      events.push({ type: 'text_delta', value: this.buf })
    }
    this.buf = ''
    this.thinkBuf = ''
    return events
  }
}

function longestSuffixMatch(str: string, pattern: string): number {
  for (let len = Math.min(pattern.length - 1, str.length); len > 0; len--) {
    if (str.endsWith(pattern.slice(0, len))) return len
  }
  return 0
}

export class OpenAICompatibleProvider implements Provider {
  readonly id: string
  private client: OpenAI

  constructor(id: string, opts: OpenAICompatibleProviderOptions = {}) {
    this.id = id
    this.client = new OpenAI({
      apiKey: opts.apiKey ?? process.env['OPENAI_API_KEY'] ?? 'sk-placeholder',
      ...(opts.baseURL !== undefined ? { baseURL: opts.baseURL } : {}),
    })
  }

  async *stream(req: ProviderRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent> {
    const toolCallBufs = new Map<number, { id: string; name: string; args: string }>()
    const parser = new ThinkTagParser()

    const stream = await this.client.chat.completions.create({
      model: req.model,
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      messages: [
        ...(req.systemPrompt ? [{ role: 'system' as const, content: req.systemPrompt }] : []),
        ...toOpenAIMessages(req.messages),
      ],
      ...(req.tools !== undefined ? { tools: toOpenAITools(req.tools) } : {}),
      stream: true,
      stream_options: { include_usage: true },
      ...(req.extra as object | undefined),
    }, { signal })

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) {
        if (chunk.usage) {
          yield {
            type: 'usage',
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          }
        }
        continue
      }

      const delta = choice.delta as Record<string, unknown>

      // Some providers (DeepSeek, etc.) expose reasoning_content separately
      if (typeof delta['reasoning_content'] === 'string' && delta['reasoning_content']) {
        yield { type: 'thinking_delta', delta: delta['reasoning_content'] }
      }

      if (typeof delta['content'] === 'string' && delta['content']) {
        for (const ev of parser.feed(delta['content'])) {
          if (ev.type === 'thinking_delta') yield { type: 'thinking_delta', delta: ev.value }
          else if (ev.type === 'thinking_done') yield { type: 'thinking_done', full: ev.value }
          else yield { type: 'text_delta', delta: ev.value }
        }
      }

      for (const tc of (choice.delta.tool_calls ?? [])) {
        const idx = tc.index
        if (tc.id) {
          toolCallBufs.set(idx, { id: tc.id, name: tc.function?.name ?? '', args: '' })
          yield { type: 'tool_call_start', id: tc.id, name: tc.function?.name ?? '' }
        }
        if (tc.function?.arguments) {
          const entry = toolCallBufs.get(idx)
          if (entry) {
            entry.args += tc.function.arguments
            yield { type: 'tool_call_delta', id: entry.id, delta: tc.function.arguments }
          }
        }
      }

      if (choice.finish_reason) {
        for (const ev of parser.flush()) {
          if (ev.type === 'thinking_done') yield { type: 'thinking_done', full: ev.value }
          else yield { type: 'text_delta', delta: ev.value }
        }
        for (const [, tc] of toolCallBufs) {
          let input: unknown = tc.args
          try { input = JSON.parse(tc.args) } catch { /* keep as string */ }
          yield { type: 'tool_call_done', id: tc.id, name: tc.name, input }
        }
        toolCallBufs.clear()

        yield {
          type: 'done',
          stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use'
            : choice.finish_reason === 'length' ? 'max_tokens'
            : 'end_turn',
        }
      }

      if (chunk.usage) {
        yield {
          type: 'usage',
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        }
      }
    }
  }
}
