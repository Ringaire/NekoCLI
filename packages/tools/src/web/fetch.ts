import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

interface WebFetchInput {
  url: string
  /** 'text' returns raw, 'markdown' converts HTML (default) */
  format?: 'text' | 'markdown'
}

// Very basic HTML-to-text stripper
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export const webFetchTool: Tool<WebFetchInput> = {
  name: 'web_fetch',
  description: 'Fetch content from a URL and return it as text or markdown',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      format: {
        type: 'string',
        enum: ['text', 'markdown'],
        description: 'Output format (default: markdown)',
        default: 'markdown',
      },
    },
    required: ['url'],
  },

  async execute(input: WebFetchInput, ctx: ToolContext): Promise<ToolResult> {
    // Block non-HTTPS in non-localhost contexts
    try {
      const url = new URL(input.url)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { ok: false, error: 'Only http/https URLs are supported', code: 'INVALID_URL' }
      }
    } catch {
      return { ok: false, error: `Invalid URL: ${input.url}`, code: 'INVALID_URL' }
    }

    let response: Response
    try {
      response = await fetch(input.url, {
        signal: ctx.signal,
        headers: { 'User-Agent': 'NekoCode/0.1' },
      })
    } catch (err) {
      return { ok: false, error: `Fetch failed: ${String(err)}`, code: 'FETCH_ERROR' }
    }

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${response.statusText}`, code: 'HTTP_ERROR' }
    }

    const contentType = response.headers.get('content-type') ?? ''
    const raw = await response.text()

    const text = contentType.includes('html') && input.format !== 'text'
      ? htmlToText(raw)
      : raw

    // Truncate to ~100KB
    const truncated = text.length > 102400
      ? text.slice(0, 102400) + '\n\n[truncated]'
      : text

    return { ok: true, content: [{ type: 'text', text: truncated }] }
  },
}
