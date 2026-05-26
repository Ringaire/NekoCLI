import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

interface ReadFileInput {
  path: string
  /** Start line (1-based, inclusive) */
  offset?: number
  /** Number of lines to read */
  limit?: number
}

const MAX_SIZE_BYTES = 1024 * 1024 // 1MB hard cap

export const readFileTool: Tool<ReadFileInput> = {
  name: 'read_file',
  description: 'Read a file from the filesystem, optionally sliced by line range',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or cwd-relative file path' },
      offset: { type: 'integer', description: 'Start line (1-based)', minimum: 1 },
      limit: { type: 'integer', description: 'Max lines to read', minimum: 1 },
    },
    required: ['path'],
  },

  async execute(input: ReadFileInput, ctx: ToolContext): Promise<ToolResult> {
    const absPath = resolve(ctx.cwd, input.path)

    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(absPath)
    } catch {
      return { ok: false, error: `File not found: ${absPath}`, code: 'NOT_FOUND' }
    }

    if (!info.isFile()) {
      return { ok: false, error: `Not a file: ${absPath}`, code: 'NOT_FILE' }
    }

    if (info.size > MAX_SIZE_BYTES) {
      return { ok: false, error: `File too large (${info.size} bytes, max 1MB)`, code: 'TOO_LARGE' }
    }

    const raw = await readFile(absPath, 'utf-8')
    let lines = raw.split('\n')

    const offset = (input.offset ?? 1) - 1 // convert to 0-based
    const limit = input.limit ?? lines.length
    lines = lines.slice(offset, offset + limit)

    // Prefix with line numbers (cat -n style)
    const numbered = lines
      .map((line, i) => `${String(offset + i + 1).padStart(4, ' ')}\t${line}`)
      .join('\n')

    return { ok: true, content: [{ type: 'text', text: numbered }] }
  },
}
