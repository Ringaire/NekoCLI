import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

interface EditFileInput {
  path: string
  old_string: string
  new_string: string
  /** Replace all occurrences, default false */
  replace_all?: boolean
}

export const editFileTool: Tool<EditFileInput> = {
  name: 'edit_file',
  description: 'Replace exact string(s) in a file. old_string must be unique unless replace_all is true.',
  permission: 'auto',

  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to edit' },
      old_string: { type: 'string', description: 'Exact string to find and replace' },
      new_string: { type: 'string', description: 'Replacement string' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences', default: false },
    },
    required: ['path', 'old_string', 'new_string'],
  },

  buildPermissionRequest(input) {
    return {
      level: 'auto',
      title: 'Edit file',
      description: `Edit ${input.path}`,
      preview: `- ${input.old_string.slice(0, 100)}\n+ ${input.new_string.slice(0, 100)}`,
    }
  },

  async execute(input: EditFileInput, ctx: ToolContext): Promise<ToolResult> {
    const absPath = resolve(ctx.cwd, input.path)

    let content: string
    try {
      content = await readFile(absPath, 'utf-8')
    } catch {
      return { ok: false, error: `File not found: ${absPath}`, code: 'NOT_FOUND' }
    }

    if (!content.includes(input.old_string)) {
      return { ok: false, error: 'old_string not found in file', code: 'NOT_FOUND' }
    }

    if (!input.replace_all) {
      const idx = content.indexOf(input.old_string)
      const secondIdx = content.indexOf(input.old_string, idx + 1)
      if (secondIdx !== -1) {
        return {
          ok: false,
          error: 'old_string is not unique in file. Use replace_all or provide more context.',
          code: 'AMBIGUOUS',
        }
      }
    }

    const updated = input.replace_all
      ? content.split(input.old_string).join(input.new_string)
      : content.replace(input.old_string, input.new_string)

    await writeFile(absPath, updated, 'utf-8')

    return { ok: true, content: [{ type: 'text', text: `Edited ${absPath}` }] }
  },
}
