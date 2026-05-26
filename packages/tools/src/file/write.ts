import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

interface WriteFileInput {
  path: string
  content: string
}

export const writeFileTool: Tool<WriteFileInput> = {
  name: 'write_file',
  description: 'Write content to a file, creating parent directories if needed. Overwrites existing files.',
  permission: 'auto',

  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'File content' },
    },
    required: ['path', 'content'],
  },

  buildPermissionRequest(input) {
    return {
      level: 'auto',
      title: 'Write file',
      description: `Write ${input.path} (${input.content.length} chars)`,
    }
  },

  async execute(input: WriteFileInput, ctx: ToolContext): Promise<ToolResult> {
    const absPath = resolve(ctx.cwd, input.path)
    await mkdir(dirname(absPath), { recursive: true })
    await writeFile(absPath, input.content, 'utf-8')
    return { ok: true, content: [{ type: 'text', text: `Written: ${absPath}` }] }
  },
}
