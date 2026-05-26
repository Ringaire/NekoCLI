import { randomUUID } from 'node:crypto'
import { DefaultEventBus } from '@nekocode/core'
import type { Tool, ToolContext, ToolResult, ToolRegistry } from '@nekocode/core'
import type { Session } from '@nekocode/core'
import type { Provider } from '@nekocode/providers/types'
import type { DefaultPermissionEngine } from '@nekocode/core/permissions'
import type { ModelCatalogEntry, ModelRole } from '@nekocode/core/agent/types'
import { selectModelByRole } from '@nekocode/core/agent/model-selector'
import { runAgentTurn } from './turn.js'

// ── Filtered registry — strips specified tools from a registry view ──────────

class SubToolRegistry implements ToolRegistry {
  constructor(
    private readonly inner: ToolRegistry,
    private readonly exclude: ReadonlySet<string>,
  ) {}
  register(tool: Tool): void     { this.inner.register(tool) }
  unregister(name: string): void { this.inner.unregister(name) }
  get(name: string): Tool | undefined {
    return this.exclude.has(name) ? undefined : this.inner.get(name)
  }
  list(): Tool[] { return this.inner.list().filter(t => !this.exclude.has(t.name)) }
}

// ── Input / Options ───────────────────────────────────────────────────────────

interface SpawnInput {
  task: string
  model?: string
  role?: ModelRole
  systemPrompt?: string
  maxTurns?: number
}

export interface SpawnToolOptions {
  provider: Provider
  tools: ToolRegistry
  permissions: DefaultPermissionEngine
  catalog: ModelCatalogEntry[]
  currentModel: string
  depth: number
  maxDepth: number
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSpawnAgentTool(opts: SpawnToolOptions): Tool<SpawnInput> {
  return {
    name: 'spawn_agent',
    description: [
      'Delegate a self-contained sub-task to a sub-agent that runs independently.',
      'Specify `model` (exact model ID) or `role` for automatic selection:',
      '  heavy   — large reasoning model: complex logic, deep analysis, architecture',
      '  balanced — general-purpose (default if omitted)',
      '  light   — fast & cheap: simple edits, lookups, formatting',
      '  coding  — code-specialized model',
      '',
      'Sub-agents have their own isolated message history and access to all tools.',
      'Always pass ALL context needed in the `task` field — sub-agents share no memory.',
    ].join('\n'),
    permission: 'auto' as const,
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Complete task description including all context the sub-agent needs',
        },
        model: {
          type: 'string',
          description: 'Exact model ID to use (e.g. "claude-haiku-4-5", "gpt-4o-mini"). Overrides role.',
        },
        role: {
          type: 'string',
          enum: ['heavy', 'balanced', 'light', 'coding'],
          description: 'Auto-select best available model by capability level',
        },
        systemPrompt: {
          type: 'string',
          description: 'Optional custom system prompt for the sub-agent',
        },
        maxTurns: {
          type: 'integer',
          description: 'Maximum agentic turns (default 10)',
          minimum: 1,
          maximum: 30,
        },
      },
      required: ['task'],
    },

    async execute(input: SpawnInput, ctx: ToolContext): Promise<ToolResult> {
      if (opts.depth >= opts.maxDepth) {
        return {
          ok: false,
          error: `Sub-agent depth limit (${opts.maxDepth}) reached — cannot spawn further`,
          code: 'MAX_DEPTH',
        }
      }

      const modelId = input.model
        ?? (input.role
          ? selectModelByRole(input.role, opts.catalog, opts.currentModel)
          : opts.currentModel)

      const subBus = new DefaultEventBus()
      const textParts: string[] = []
      subBus.on('agent:text_done', (ev: { full: string }) => { textParts.push(ev.full) })

      const now = Date.now()
      const subSession: Session = {
        meta: {
          id: randomUUID(),
          cwd: ctx.cwd,
          model: modelId,
          title: `[sub] ${input.task.slice(0, 50)}`,
          createdAt: now,
          updatedAt: now,
          messageCount: 1,
        },
        messages: [{
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: input.task }],
          ts: Date.now(),
        }],
      }

      // At max depth - 1, prevent the sub-agent from spawning further
      const subTools: ToolRegistry = opts.depth + 1 >= opts.maxDepth
        ? new SubToolRegistry(opts.tools, new Set(['spawn_agent']))
        : opts.tools

      try {
        await runAgentTurn({
          provider: opts.provider,
          session: subSession,
          tools: subTools,
          bus: subBus,
          permissions: opts.permissions,
          ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
          maxTurns: input.maxTurns ?? 10,
          persist: false,
        })
      } catch (err) {
        return { ok: false, error: `Sub-agent error: ${String(err)}`, code: 'SUB_AGENT_ERROR' }
      }

      const output = textParts.join('\n\n').trim() || '(sub-agent completed with no text output)'
      return {
        ok: true,
        content: [{ type: 'text', text: `[sub-agent model=${modelId}]\n\n${output}` }],
      }
    },
  }
}
