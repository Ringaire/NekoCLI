import { GoogleGenAI, type Part, type Content, type Tool as GeminiTool } from '@google/genai'
import type {
  Provider, ProviderRequest, ProviderEvent,
  Message, ToolDefinition,
} from '../types.js'

// Build id → name lookup from all messages so we can populate functionResponse.name
function buildToolNameMap(messages: Message[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of messages) {
    for (const p of m.content) {
      if (p.type === 'tool_use') map.set(p.id, p.name)
    }
  }
  return map
}

function toGeminiContents(messages: Message[], toolNameMap: Map<string, string>): Content[] {
  return messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: m.content.flatMap((p): Part[] => {
      if (p.type === 'text') return [{ text: p.text }]
      if (p.type === 'tool_use') return [{
        functionCall: { id: p.id, name: p.name, args: p.input as Record<string, unknown> },
      }]
      if (p.type === 'tool_result') return [{
        functionResponse: {
          id: p.toolUseId,
          name: toolNameMap.get(p.toolUseId) ?? '',
          response: { output: p.content, ...(p.isError ? { error: true } : {}) },
        },
      }]
      return []
    }),
  }))
}

function toGeminiTools(tools: ToolDefinition[]): GeminiTool[] {
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    })),
  }]
}

type FunctionCallPart = { id?: string; name?: string; args?: unknown }

export class GeminiProvider implements Provider {
  readonly id = 'gemini'
  private client: GoogleGenAI

  constructor(apiKey?: string) {
    this.client = new GoogleGenAI({ apiKey: apiKey ?? process.env['GEMINI_API_KEY'] ?? '' })
  }

  async *stream(req: ProviderRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent> {
    const thinkingEnabled = req.thinking?.enabled === true
    const budgetTokens = req.thinking?.budgetTokens ?? 8000

    const toolNameMap = buildToolNameMap(req.messages)

    const responseStream = await this.client.models.generateContentStream({
      model: req.model,
      contents: toGeminiContents(req.messages, toolNameMap),
      config: {
        ...(req.systemPrompt !== undefined ? { systemInstruction: req.systemPrompt } : {}),
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.tools !== undefined ? { tools: toGeminiTools(req.tools) } : {}),
        ...(thinkingEnabled ? {
          thinkingConfig: { includeThoughts: true, thinkingBudget: budgetTokens },
        } : {}),
        ...(req.extra as object | undefined),
      },
    })

    let thinkingBuf = ''
    let inThinking = false
    let sawToolCall = false

    for await (const chunk of responseStream) {
      if (signal?.aborted) break

      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        const isThought = (part as { thought?: boolean }).thought === true

        if (isThought) {
          inThinking = true
          const text = part.text ?? ''
          if (text) {
            thinkingBuf += text
            yield { type: 'thinking_delta', delta: text }
          }
        } else {
          if (inThinking) {
            inThinking = false
            if (thinkingBuf) {
              yield { type: 'thinking_done', full: thinkingBuf }
              thinkingBuf = ''
            }
          }

          if (part.text) {
            yield { type: 'text_delta', delta: part.text }
          }

          if (part.functionCall) {
            const fc = part.functionCall as FunctionCallPart
            const id = fc.id ?? fc.name ?? ''
            const name = fc.name ?? ''
            sawToolCall = true
            yield { type: 'tool_call_start', id, name }
            yield { type: 'tool_call_done', id, name, input: fc.args }
          }
        }
      }

      if (chunk.usageMetadata) {
        yield {
          type: 'usage',
          inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
          outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
        }
      }

      const finishReason = chunk.candidates?.[0]?.finishReason
      if (finishReason) {
        if (inThinking && thinkingBuf) {
          yield { type: 'thinking_done', full: thinkingBuf }
          thinkingBuf = ''
          inThinking = false
        }
        yield {
          type: 'done',
          stopReason: sawToolCall ? 'tool_use'
            : finishReason === 'MAX_TOKENS' ? 'max_tokens'
            : 'end_turn',
        }
      }
    }

    // Stream ended without an explicit finishReason (shouldn't happen, but be safe)
    if (inThinking && thinkingBuf) {
      yield { type: 'thinking_done', full: thinkingBuf }
    }
  }
}
