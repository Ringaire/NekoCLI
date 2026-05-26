import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { paths } from '../config/paths.js'
import type { Session, SessionMeta, Message } from './types.js'

function metaPath(id: string): string {
  return join(paths.sessions, `${id}.meta.json`)
}

function messagesPath(id: string): string {
  return join(paths.sessions, `${id}.jsonl`)
}

// Sessions that exist only in memory — files written lazily on first appendMessage.
// Stores a reference to the live meta object so mutations (e.g. model switch) are captured.
const pendingSessions = new Map<string, SessionMeta>()

/**
 * Create an in-memory session. No files are written until the first message is appended.
 */
export async function createSession(cwd: string, model?: string): Promise<Session> {
  const id = randomUUID()
  const now = Date.now()
  const meta: SessionMeta = {
    id,
    cwd,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    ...(model !== undefined ? { model } : {}),
  }
  pendingSessions.set(id, meta)
  return { meta, messages: [] }
}

export async function appendMessage(sessionId: string, msg: Message): Promise<void> {
  await mkdir(paths.sessions, { recursive: true })

  // Lazy-flush: create files on the very first write for this session
  const pending = pendingSessions.get(sessionId)
  if (pending) {
    pendingSessions.delete(sessionId)
    await writeFile(metaPath(sessionId), JSON.stringify(pending, null, 2), 'utf-8')
    await writeFile(messagesPath(sessionId), '', 'utf-8')
  }

  await writeFile(messagesPath(sessionId), JSON.stringify(msg) + '\n', { flag: 'a', encoding: 'utf-8' })

  const meta = await loadMeta(sessionId)
  if (meta) {
    meta.updatedAt = Date.now()
    meta.messageCount += 1
    if (meta.title === undefined && msg.role === 'user') {
      const text = msg.content.find(c => c.type === 'text')?.text ?? ''
      if (text) meta.title = text.slice(0, 60)
    }
    await writeFile(metaPath(sessionId), JSON.stringify(meta, null, 2), 'utf-8')
  }
}

export async function loadSession(id: string): Promise<Session | null> {
  const meta = await loadMeta(id)
  if (!meta) return null
  return { meta, messages: await loadMessages(id) }
}

async function loadMeta(id: string): Promise<SessionMeta | null> {
  try {
    return JSON.parse(await readFile(metaPath(id), 'utf-8')) as SessionMeta
  } catch { return null }
}

async function loadMessages(id: string): Promise<Message[]> {
  try {
    const raw = await readFile(messagesPath(id), 'utf-8')
    return raw.split('\n').filter(Boolean).map(line => JSON.parse(line) as Message)
  } catch { return [] }
}

export async function listSessions(): Promise<SessionMeta[]> {
  try {
    const files = await readdir(paths.sessions)
    const metas = await Promise.all(
      files
        .filter(f => f.endsWith('.meta.json'))
        .map(f => loadMeta(f.replace('.meta.json', ''))),
    )
    return (metas.filter(Boolean) as SessionMeta[])
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch { return [] }
}

export async function replaceMessages(sessionId: string, messages: Message[]): Promise<void> {
  await mkdir(paths.sessions, { recursive: true })
  const content = messages.map(m => JSON.stringify(m)).join('\n') + (messages.length > 0 ? '\n' : '')
  await writeFile(messagesPath(sessionId), content, 'utf-8')
  const meta = await loadMeta(sessionId)
  if (meta) {
    meta.messageCount = messages.length
    meta.updatedAt = Date.now()
    await writeFile(metaPath(sessionId), JSON.stringify(meta, null, 2), 'utf-8')
  }
}

export async function deleteSession(id: string): Promise<void> {
  pendingSessions.delete(id)
  await Promise.allSettled([unlink(metaPath(id)), unlink(messagesPath(id))])
}

export function makeMessage(role: Message['role'], text: string): Message {
  return { id: randomUUID(), role, content: [{ type: 'text', text }], ts: Date.now() }
}
