import Anthropic from '@anthropic-ai/sdk'
import type {
  Provider, ProviderRequest, ProviderEvent,
  Message, ContentPart, ToolDefinition,
} from '../types.js'

function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((p): Anthropic.ContentBlockParam => {
      if (p.type === 'text') return { type: 'text', text: p.text }
      if (p.type === 'tool_use') return { type: 'tool_use', id: p.id, name: p.name, input: p.input as Record<string, unknown> }
      return {
        type: 'tool_result',
        tool_use_id: p.toolUseId,
        content: p.content,
        ...(p.isError !== undefined ? { is_error: p.isError } : {}),
      }
    }),
  }))
}

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }))
}

export class AnthropicProvider implements Provider {
  readonly id = 'anthropic'
  private client: Anthropic

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'] })
  }

  async *stream(req: ProviderRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent> {
    const thinkingEnabled = req.thinking?.enabled === true
    const budgetTokens   = req.thinking?.budgetTokens ?? 8000

    const thinkingParams: Record<string, unknown> = thinkingEnabled
      ? { thinking: { type: 'enabled', budget_tokens: budgetTokens } }
      : {}
    const betaHeaders = thinkingEnabled ? ['interleaved-thinking-2025-05-14'] : []

    const stream = this.client.messages.stream({
      model: req.model,
      max_tokens: req.maxTokens ?? (thinkingEnabled ? budgetTokens + 8192 : 8192),
      ...(req.systemPrompt !== undefined ? { system: req.systemPrompt } : {}),
      messages: toAnthropicMessages(req.messages),
      ...(req.tools !== undefined ? { tools: toAnthropicTools(req.tools) } : {}),
      ...(!thinkingEnabled && req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...thinkingParams,
      ...(req.extra as object | undefined),
    }, {
      signal,
      ...(betaHeaders.length > 0 ? { headers: { 'anthropic-beta': betaHeaders.join(',') } } : {}),
    })

    const toolInputBufs = new Map<number, string>()
    const thinkingBufs  = new Map<number, string>()

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block
        if (block.type === 'tool_use') {
          yield { type: 'tool_call_start', id: block.id, name: block.name }
          toolInputBufs.set(event.index, '')
        } else if ((block as { type: string }).type === 'thinking') {
          thinkingBufs.set(event.index, '')
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string; partial_json?: string; thinking?: string }
        if (delta.type === 'text_delta' && delta.text !== undefined) {
          yield { type: 'text_delta', delta: delta.text }
        } else if (delta.type === 'input_json_delta' && delta.partial_json !== undefined) {
          const prev = toolInputBufs.get(event.index) ?? ''
          toolInputBufs.set(event.index, prev + delta.partial_json)
          yield { type: 'tool_call_delta', id: String(event.index), delta: delta.partial_json }
        } else if (delta.type === 'thinking_delta' && delta.thinking !== undefined) {
          const prev = thinkingBufs.get(event.index) ?? ''
          thinkingBufs.set(event.index, prev + delta.thinking)
          yield { type: 'thinking_delta', delta: delta.thinking }
        }
      } else if (event.type === 'content_block_stop') {
        if (thinkingBufs.has(event.index)) {
          const full = thinkingBufs.get(event.index) ?? ''
          thinkingBufs.delete(event.index)
          if (full.length > 0) yield { type: 'thinking_done', full }
        }
      } else if (event.type === 'message_delta') {
        if (event.usage) {
          yield { type: 'usage', inputTokens: 0, outputTokens: event.usage.output_tokens }
        }
        const stopReason = event.delta.stop_reason
        if (stopReason) {
          yield {
            type: 'done',
            stopReason: stopReason === 'tool_use' ? 'tool_use'
              : stopReason === 'max_tokens' ? 'max_tokens'
              : stopReason === 'stop_sequence' ? 'stop_sequence'
              : 'end_turn',
          }
        }
      } else if (event.type === 'message_start') {
        if (event.message.usage) {
          yield {
            type: 'usage',
            inputTokens: event.message.usage.input_tokens,
            outputTokens: 0,
            ...(event.message.usage.cache_read_input_tokens != null
              ? { cacheReadTokens: event.message.usage.cache_read_input_tokens } : {}),
            ...(event.message.usage.cache_creation_input_tokens != null
              ? { cacheWriteTokens: event.message.usage.cache_creation_input_tokens } : {}),
          }
        }
        for (const block of event.message.content) {
          if (block.type === 'tool_use') {
            yield { type: 'tool_call_done', id: block.id, name: block.name, input: block.input }
          }
        }
      }
    }
  }
}
