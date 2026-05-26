import { readdir, stat } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

interface TreeInput {
  path?: string
  depth?: number
  /** Extra patterns to exclude (in addition to defaults) */
  exclude?: string[]
}

// Directories/files always skipped unless explicitly overridden
const DEFAULT_EXCLUDE = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.cache',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  'target',       // Rust
  '.gradle',
  '.idea',
  '.vscode',
  'coverage',
  '.nyc_output',
  'vendor',       // Go / PHP
  'Pods',         // iOS
  '.DS_Store',
  'thumbs.db',
])

const MAX_FILES = 1000
const DEFAULT_DEPTH = 5

async function walk(
  dir: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  exclude: Set<string>,
  lines: string[],
  count: { n: number },
): Promise<void> {
  if (depth > maxDepth) {
    lines.push(`${prefix}…`)
    return
  }

  let entries: { name: string; isDir: boolean }[]
  try {
    const raw = await readdir(dir, { withFileTypes: true })
    entries = raw
      .filter(e => !exclude.has(e.name))
      .map(e => ({ name: e.name, isDir: e.isDirectory() || e.isSymbolicLink() && false }))
      .sort((a, b) => {
        // Dirs first, then files; alphabetical within each group
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    lines.push(`${prefix}[permission denied]`)
    return
  }

  for (let i = 0; i < entries.length; i++) {
    if (count.n >= MAX_FILES) {
      lines.push(`${prefix}… (truncated at ${MAX_FILES} entries)`)
      return
    }

    const entry = entries[i]!
    const isLast = i === entries.length - 1
    const connector = isLast ? '└── ' : '├── '
    const childPrefix = prefix + (isLast ? '    ' : '│   ')

    lines.push(`${prefix}${connector}${entry.isDir ? entry.name + '/' : entry.name}`)
    count.n++

    if (entry.isDir) {
      await walk(join(dir, entry.name), childPrefix, depth + 1, maxDepth, exclude, lines, count)
    }
  }
}

export const treeTool: Tool<TreeInput> = {
  name: 'tree',
  description: 'Display a directory tree. Common build artifacts, caches, and VCS directories are excluded automatically.',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory to display (default: cwd)',
      },
      depth: {
        type: 'integer',
        description: `Max depth to recurse (default: ${DEFAULT_DEPTH})`,
        minimum: 1,
        maximum: 20,
      },
      exclude: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional directory/file names to exclude',
      },
    },
  },

  async execute(input: TreeInput, ctx: ToolContext): Promise<ToolResult> {
    const absPath = resolve(ctx.cwd, input.path ?? '.')
    const maxDepth = input.depth ?? DEFAULT_DEPTH

    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(absPath)
    } catch {
      return { ok: false, error: `Path not found: ${absPath}`, code: 'NOT_FOUND' }
    }
    if (!info.isDirectory()) {
      return { ok: false, error: `Not a directory: ${absPath}`, code: 'NOT_DIR' }
    }

    const exclude = new Set(DEFAULT_EXCLUDE)
    for (const e of input.exclude ?? []) exclude.add(e)

    const displayRoot = relative(ctx.cwd, absPath) || '.'
    const lines: string[] = [`${displayRoot}/`]
    const count = { n: 0 }

    await walk(absPath, '', 1, maxDepth, exclude, lines, count)
    lines.push(`\n${count.n} entries`)

    return { ok: true, content: [{ type: 'text', text: lines.join('\n') }] }
  },
}
