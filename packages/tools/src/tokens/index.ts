import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

// ── Tokenizer heuristics ──────────────────────────────────────────────────────
// Proper tokenization requires model-specific tokenizers (tiktoken, sentencepiece).
// We use a fast heuristic that's accurate to ~±10% for English prose / code.
// Word-based: average ~1.3 tokens/word for English; ~2.5 chars/token for code.

const CODE_EXTS = /\.(ts|js|py|rs|go|c|cpp|h|json|yaml|toml|sh|bash)$/i

function estimateTokens(text: string, model: string): number {
  const isCode = CODE_EXTS.test(model) || /```|function |const |import |def |class /.test(text.slice(0, 500))

  if (isCode) {
    // Code: ~3 chars/token (more symbols, less common words)
    return Math.ceil(text.length / 3)
  }

  // English prose: count words and apply multiplier
  const words = text.trim().split(/\s+/).filter(Boolean).length
  // ~1.3 tokens/word baseline; adjust for special chars
  const symbolDensity = (text.match(/[^a-zA-Z0-9\s]/g)?.length ?? 0) / text.length
  const multiplier = 1.3 + symbolDensity * 2
  return Math.ceil(words * multiplier)
}

// Model → context window size (for % remaining calculation)
const CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  'claude-opus-4-7': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-3-5-sonnet': 200_000,
  'claude-3-opus': 200_000,
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'o1': 200_000,
  'o3': 200_000,
  // Gemini
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.0-flash': 1_000_000,
}

function contextWindow(model: string): number | undefined {
  for (const [key, size] of Object.entries(CONTEXT_WINDOWS)) {
    if (model.toLowerCase().includes(key.toLowerCase())) return size
  }
  return undefined
}

// ── Input ─────────────────────────────────────────────────────────────────────

interface TokenCountInput {
  text: string
  /** Model name — used for context window % calculation */
  model?: string
}

// ── Tool ──────────────────────────────────────────────────────────────────────

export const tokenCountTool: Tool<TokenCountInput> = {
  name: 'token_count',
  description:
    'Estimate token count for a given text. Useful for checking if content fits in context ' +
    'before passing it to the model. Provides % of context window used if model is specified.',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to count tokens for' },
      model: { type: 'string', description: 'Model name (optional) — used to show % of context window used' },
    },
    required: ['text'],
  },

  async execute(input: TokenCountInput, _ctx: ToolContext): Promise<ToolResult> {
    const model = input.model ?? ''
    const count = estimateTokens(input.text, model)
    const chars = input.text.length
    const window = contextWindow(model)

    const lines: string[] = [
      `Estimated tokens : ${count.toLocaleString()}`,
      `Characters       : ${chars.toLocaleString()}`,
      `Ratio            : ~${(chars / count).toFixed(1)} chars/token`,
    ]

    if (window) {
      const pct = ((count / window) * 100).toFixed(1)
      const remaining = window - count
      lines.push(
        `Context window   : ${window.toLocaleString()} tokens (${model})`,
        `Used             : ${pct}%`,
        `Remaining        : ~${remaining.toLocaleString()} tokens`,
      )
    }

    lines.push('', '⚠ This is an estimate (±10%). Actual tokenization is model-specific.')

    return {
      ok: true,
      content: [{ type: 'text', text: lines.join('\n') }],
      metadata: { estimatedTokens: count, chars, contextWindow: window ?? null },
    }
  },
}
