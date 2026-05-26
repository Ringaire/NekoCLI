import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { paths } from '../config/paths.js'

export type MemoryType = 'user' | 'project' | 'feedback' | 'reference'

export interface MemoryEntry {
  id: string
  type: MemoryType
  /** Short label for index */
  title: string
  /** Full memory content */
  body: string
  /** ISO date string */
  createdAt: string
  updatedAt: string
  /** Optional tags */
  tags?: string[]
}

const memoryFile = join(paths.cache, 'memory.json')

async function readAll(): Promise<MemoryEntry[]> {
  try {
    const raw = await readFile(memoryFile, 'utf-8')
    return JSON.parse(raw) as MemoryEntry[]
  } catch {
    return []
  }
}

async function writeAll(entries: MemoryEntry[]): Promise<void> {
  await mkdir(paths.cache, { recursive: true })
  await writeFile(memoryFile, JSON.stringify(entries, null, 2) + '\n', 'utf-8')
}

export async function saveMemory(
  entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt'>,
): Promise<MemoryEntry> {
  const all = await readAll()
  const now = new Date().toISOString()
  const existing = all.findIndex(e => e.id === entry.id)
  const full: MemoryEntry = { ...entry, createdAt: now, updatedAt: now }

  if (existing !== -1) {
    full.createdAt = all[existing]!.createdAt
    all[existing] = full
  } else {
    all.push(full)
  }

  await writeAll(all)
  return full
}

export async function deleteMemory(id: string): Promise<void> {
  const all = await readAll()
  await writeAll(all.filter(e => e.id !== id))
}

export async function listMemory(type?: MemoryType): Promise<MemoryEntry[]> {
  const all = await readAll()
  return type ? all.filter(e => e.type === type) : all
}

export async function searchMemory(query: string): Promise<MemoryEntry[]> {
  const all = await readAll()
  const q = query.toLowerCase()
  return all.filter(e =>
    e.title.toLowerCase().includes(q) ||
    e.body.toLowerCase().includes(q) ||
    e.tags?.some(t => t.toLowerCase().includes(q)),
  )
}

/** Format all memories as a system prompt block */
export async function buildMemoryPrompt(): Promise<string> {
  const all = await readAll()
  if (all.length === 0) return ''

  const grouped = new Map<MemoryType, MemoryEntry[]>()
  for (const e of all) {
    const list = grouped.get(e.type) ?? []
    list.push(e)
    grouped.set(e.type, list)
  }

  const sections: string[] = ['## Memory']
  for (const [type, entries] of grouped) {
    sections.push(`\n### ${type}`)
    for (const e of entries) {
      sections.push(`**${e.title}**\n${e.body}`)
    }
  }
  return sections.join('\n')
}
