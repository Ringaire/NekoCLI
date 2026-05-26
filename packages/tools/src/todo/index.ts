import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Tool, ToolContext, ToolResult } from '@nekocode/core/tools/types'

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TodoPriority = 'high' | 'medium' | 'low'

export interface TodoItem {
  id: string
  content: string
  status: TodoStatus
  priority: TodoPriority
  createdAt: number
  updatedAt: number
}

// ── Persistence (per session) ─────────────────────────────────────────────────

function todoPath(sessionId: string): string {
  const { paths } = require('@nekocode/core/config/paths') as typeof import('@nekocode/core/config/paths')
  return join(paths.sessions, `${sessionId}.todos.json`)
}

async function readTodos(sessionId: string): Promise<TodoItem[]> {
  try {
    const raw = await readFile(todoPath(sessionId), 'utf-8')
    return JSON.parse(raw) as TodoItem[]
  } catch {
    return []
  }
}

async function writeTodos(sessionId: string, todos: TodoItem[]): Promise<void> {
  const p = todoPath(sessionId)
  await mkdir(p.replace(/\/[^/]+$/, ''), { recursive: true })
  await writeFile(p, JSON.stringify(todos, null, 2), 'utf-8')
}

// ── Input union ───────────────────────────────────────────────────────────────

type TodoInput =
  | { op: 'list' }
  | { op: 'create'; content: string; priority?: TodoPriority }
  | { op: 'update'; id: string; status?: TodoStatus; content?: string; priority?: TodoPriority }
  | { op: 'delete'; id: string }

// ── Tool ──────────────────────────────────────────────────────────────────────

export const todoTool: Tool<TodoInput> = {
  name: 'todo',
  description:
    'Manage a per-session TODO list. Use to track tasks, sub-tasks, or progress. ' +
    'Always keep the list up-to-date: mark items in_progress while working, completed when done.',
  permission: 'none',

  inputSchema: {
    type: 'object',
    properties: {
      op: {
        type: 'string',
        enum: ['list', 'create', 'update', 'delete'],
        description: 'Operation to perform',
      },
      content: { type: 'string', description: 'Todo item text (required for create)' },
      id: { type: 'string', description: 'Todo item ID (required for update/delete)' },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
        description: 'New status (for update)',
      },
      priority: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Priority level (default: medium)',
      },
    },
    required: ['op'],
  },

  async execute(input: TodoInput, ctx: ToolContext): Promise<ToolResult> {
    const todos = await readTodos(ctx.sessionId)
    const now = Date.now()

    switch (input.op) {
      case 'list': {
        if (todos.length === 0) {
          return { ok: true, content: [{ type: 'text', text: 'No todos.' }] }
        }
        const icons: Record<TodoStatus, string> = {
          pending: '○',
          in_progress: '◐',
          completed: '●',
          cancelled: '✕',
        }
        const priorityOrder: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 }
        const sorted = [...todos].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
        const lines = sorted.map(t =>
          `${icons[t.status]} [${t.priority}] ${t.content}  (id: ${t.id.slice(0, 8)})`,
        )
        return { ok: true, content: [{ type: 'text', text: lines.join('\n') }], metadata: { count: todos.length } }
      }

      case 'create': {
        if (!('content' in input) || !input.content) {
          return { ok: false, error: 'content is required for create', code: 'INVALID_INPUT' }
        }
        const item: TodoItem = {
          id: randomUUID(),
          content: input.content,
          status: 'pending',
          priority: ('priority' in input && input.priority) ? input.priority : 'medium',
          createdAt: now,
          updatedAt: now,
        }
        todos.push(item)
        await writeTodos(ctx.sessionId, todos)
        return { ok: true, content: [{ type: 'text', text: `Created: ${item.id.slice(0, 8)} — ${item.content}` }] }
      }

      case 'update': {
        if (!('id' in input) || !input.id) {
          return { ok: false, error: 'id is required for update', code: 'INVALID_INPUT' }
        }
        const idx = todos.findIndex(t => t.id.startsWith(input.id))
        if (idx === -1) return { ok: false, error: `Todo not found: ${input.id}`, code: 'NOT_FOUND' }
        const todo = todos[idx]!
        if ('status' in input && input.status) todo.status = input.status
        if ('content' in input && input.content) todo.content = input.content
        if ('priority' in input && input.priority) todo.priority = input.priority
        todo.updatedAt = now
        await writeTodos(ctx.sessionId, todos)
        return { ok: true, content: [{ type: 'text', text: `Updated: ${todo.id.slice(0, 8)} → ${todo.status}` }] }
      }

      case 'delete': {
        if (!('id' in input) || !input.id) {
          return { ok: false, error: 'id is required for delete', code: 'INVALID_INPUT' }
        }
        const before = todos.length
        const next = todos.filter(t => !t.id.startsWith(input.id))
        if (next.length === before) return { ok: false, error: `Todo not found: ${input.id}`, code: 'NOT_FOUND' }
        await writeTodos(ctx.sessionId, next)
        return { ok: true, content: [{ type: 'text', text: `Deleted ${before - next.length} item(s)` }] }
      }
    }
  },
}
