import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

interface WebSearchInput {
  query: string
  /** Max results, default 10 */
  limit?: number
}

interface SearchResult {
  title: string
  url: string
  snippet: string
}

// DuckDuckGo HTML scrape — no API key required
async function duckduckgo(query: string, limit: number, signal: AbortSignal): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    signal,
    headers: {
      'User-Agent': 'NekoCode/0.1',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()

  const results: SearchResult[] = []
  const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

  const titleMatches = [...html.matchAll(resultRegex)].slice(0, limit)
  const snippetMatches = [...html.matchAll(snippetRegex)]

  for (let i = 0; i < titleMatches.length; i++) {
    const [, href, rawTitle] = titleMatches[i]!
    const snippet = snippetMatches[i]?.[1] ?? ''
    results.push({
      title: stripTags(rawTitle ?? '').trim(),
      url: href ?? '',
      snippet: stripTags(snippet).trim(),
    })
  }
  return results
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' ').trim()
}

export const webSearchTool: Tool<WebSearchInput> = {
  name: 'web_search',
  description: 'Search the web using DuckDuckGo and return result titles, URLs, and snippets',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'integer', description: 'Max results (default 10)', default: 10 },
    },
    required: ['query'],
  },

  async execute(input: WebSearchInput, ctx: ToolContext): Promise<ToolResult> {
    const limit = Math.min(input.limit ?? 10, 20)

    let results: SearchResult[]
    try {
      results = await duckduckgo(input.query, limit, ctx.signal)
    } catch (err) {
      return { ok: false, error: `Search failed: ${String(err)}`, code: 'SEARCH_ERROR' }
    }

    if (results.length === 0) {
      return { ok: true, content: [{ type: 'text', text: 'No results found.' }] }
    }

    const text = results
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
      .join('\n\n')

    return { ok: true, content: [{ type: 'text', text }], metadata: { count: results.length } }
  },
}
