import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve, relative, join, extname } from 'node:path'
import type { Mention } from './parser.js'

const MAX_FILE_BYTES = 512 * 1024  // 512 KB per file
const MAX_DIR_FILES = 50           // max files expanded from a dir mention

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.wasm', '.bin', '.exe',
  '.ttf', '.woff', '.woff2', '.mp3', '.mp4', '.mov',
])

async function expandFile(absPath: string, cwd: string): Promise<string> {
  const rel = relative(cwd, absPath)
  if (BINARY_EXTS.has(extname(absPath).toLowerCase())) {
    return `\`${rel}\` — [binary file, skipped]`
  }
  try {
    const s = await stat(absPath)
    if (s.size > MAX_FILE_BYTES) {
      return `\`${rel}\` — [file too large: ${(s.size / 1024).toFixed(0)} KB, max ${MAX_FILE_BYTES / 1024} KB]`
    }
    const content = await readFile(absPath, 'utf-8')
    const lang = extname(absPath).slice(1) || 'text'
    return `\`${rel}\`:\n\`\`\`${lang}\n${content}\n\`\`\``
  } catch {
    return `\`${rel}\` — [not found or unreadable]`
  }
}

async function treeDir(dir: string, cwd: string, depth = 0, maxDepth = 3): Promise<string[]> {
  if (depth > maxDepth) return []
  const indent = '  '.repeat(depth)
  const lines: string[] = []
  let entries: { name: string; isDirectory(): boolean }[]
  try {
    entries = (await readdir(dir, { withFileTypes: true })).map(e => ({
      name: String(e.name),
      isDirectory: () => e.isDirectory(),
    }))
  } catch {
    return []
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue
    const rel = relative(cwd, join(dir, e.name))
    if (e.isDirectory()) {
      lines.push(`${indent}${e.name}/`)
      lines.push(...await treeDir(join(dir, e.name), cwd, depth + 1, maxDepth))
    } else {
      lines.push(`${indent}${rel}`)
    }
  }
  return lines
}

async function expandDir(absPath: string, cwd: string): Promise<string> {
  const rel = relative(cwd, absPath)
  const treeLines = await treeDir(absPath, cwd)
  return `\`${rel}/\` (directory tree):\n\`\`\`\n${treeLines.join('\n')}\n\`\`\``
}

export interface ExpandedMention {
  mention: Mention
  content: string
}

export async function expandMentions(
  mentions: Mention[],
  cwd: string,
): Promise<ExpandedMention[]> {
  return Promise.all(
    mentions.map(async (m) => {
      const absPath = resolve(cwd, m.path)
      const content = m.type === 'dir'
        ? await expandDir(absPath, cwd)
        : await expandFile(absPath, cwd)
      return { mention: m, content }
    }),
  )
}

/** Replace @mentions in text with expanded content blocks */
export function buildMessageWithMentions(
  text: string,
  expanded: ExpandedMention[],
): string {
  if (expanded.length === 0) return text
  const blocks = expanded.map(e => e.content).join('\n\n')
  // Append expanded content after the user's message
  return `${text}\n\n---\n${blocks}`
}
