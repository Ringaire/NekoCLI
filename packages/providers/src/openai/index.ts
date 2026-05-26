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

// o-series models use reasoning_effort instead of temperature
function isOSeriesModel(model: string): boolean {
  return /^o\d/.test(model)
}

export class OpenAIProvider implements Provider {
  readonly id = 'openai'
  private client: OpenAI

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env['OPENAI_API_KEY'] ?? 'sk-placeholder',
    })
  }

  async *stream(req: ProviderRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent> {
    const toolCallBufs = new Map<number, { id: string; name: string; args: string }>()
    const oSeries = isOSeriesModel(req.model)
    const thinkingEnabled = req.thinking?.enabled === true

    const extraParams: Record<string, unknown> = {}
    if (oSeries && thinkingEnabled) {
      // reasoning_effort maps budget roughly: <4000=low, <16000=medium, else=high
      const budget = req.thinking?.budgetTokens ?? 8000
      extraParams['reasoning_effort'] = budget < 4000 ? 'low' : budget < 16000 ? 'medium' : 'high'
    }

    const stream = await this.client.chat.completions.create({
      model: req.model,
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      ...(!oSeries && req.temperature !== undefined ? { temperature: req.temperature } : {}),
      messages: [
        ...(req.systemPrompt ? [{ role: 'system' as const, content: req.systemPrompt }] : []),
        ...toOpenAIMessages(req.messages),
      ],
      ...(req.tools !== undefined ? { tools: toOpenAITools(req.tools) } : {}),
      stream: true,
      stream_options: { include_usage: true },
      ...extraParams,
      ...(req.extra as object | undefined),
    }, { signal })

    let inReasoning = false
    let reasoningBuf = ''

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

      // o-series: reasoning tokens arrive in delta.reasoning_content
      if (typeof delta['reasoning_content'] === 'string') {
        // Always mark inReasoning even on empty string (issue #3)
        if (!inReasoning) inReasoning = true
        if (delta['reasoning_content']) {
          reasoningBuf += delta['reasoning_content']
          yield { type: 'thinking_delta', delta: delta['reasoning_content'] }
        }
      } else if (inReasoning) {
        // Transition: reasoning done when text OR tool_calls arrive (issue #2)
        const hasContent = typeof delta['content'] === 'string' && delta['content'] !== ''
        const hasToolCalls = (choice.delta.tool_calls ?? []).length > 0
        if (hasContent || hasToolCalls) {
          inReasoning = false
          if (reasoningBuf) {
            yield { type: 'thinking_done', full: reasoningBuf }
            reasoningBuf = ''
          }
        }
      }

      if (typeof delta['content'] === 'string' && delta['content']) {
        yield { type: 'text_delta', delta: delta['content'] }
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
        if (inReasoning && reasoningBuf) {
          yield { type: 'thinking_done', full: reasoningBuf }
          reasoningBuf = ''
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
