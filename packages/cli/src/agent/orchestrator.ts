import type { Tool, ToolRegistry, EventBus } from '@nekocode/core'
import type { Session } from '@nekocode/core'
import type { Provider } from '@nekocode/providers/types'
import type { DefaultPermissionEngine } from '@nekocode/core/permissions'
import type { ModelCatalogEntry, ModelRole } from '@nekocode/core/agent/types'
import { createSpawnAgentTool } from './spawn.js'
import { runAgentTurn } from './turn.js'

const DEFAULT_MAX_DEPTH = 2

// ── Augmented registry — injects extra tools on top of an existing one ────────

class AugmentedToolRegistry implements ToolRegistry {
  private readonly extras: Map<string, Tool>

  constructor(private readonly inner: ToolRegistry, extras: Tool[]) {
    this.extras = new Map(extras.map(t => [t.name, t as Tool]))
  }

  register(tool: Tool): void     { this.inner.register(tool) }
  unregister(name: string): void {
    this.extras.delete(name)
    this.inner.unregister(name)
  }
  get(name: string): Tool | undefined {
    return this.extras.get(name) ?? this.inner.get(name)
  }
  list(): Tool[] {
    return [...this.inner.list(), ...this.extras.values()]
  }
}

// ── System prompt builder ─────────────────────────────────────────────────────

const ROLE_DESCRIPTIONS: Record<ModelRole, string> = {
  heavy:    'complex reasoning, multi-step planning, architecture decisions',
  balanced: 'general-purpose coding and analysis',
  light:    'fast lookups, simple edits, formatting, quick summarization',
  coding:   'code generation, refactoring, code explanation',
}

function buildOrchestratorPrompt(
  catalog: ModelCatalogEntry[],
  currentModel: string,
  basePrompt: string | undefined,
): string {
  const byRole = new Map<ModelRole, string[]>()
  for (const entry of catalog) {
    const list = byRole.get(entry.role) ?? []
    list.push(entry.id)
    byRole.set(entry.role, list)
  }

  const catalogLines: string[] = ['## Available sub-agent models']
  for (const role of ['heavy', 'balanced', 'light', 'coding'] as ModelRole[]) {
    const models = byRole.get(role)
    if (models && models.length > 0) {
      catalogLines.push(`**${role}** (${ROLE_DESCRIPTIONS[role]}):`)
      catalogLines.push(`  ${models.slice(0, 4).join(', ')}`)
    }
  }
  catalogLines.push(`\nYou are running as: **${currentModel}**`)

  const orchestratorSection = `\
You are an orchestrator agent. You can delegate self-contained sub-tasks to specialized sub-agents using the \`spawn_agent\` tool.

${catalogLines.join('\n')}

## Orchestration guidelines
- Break complex tasks into independent sub-tasks and delegate them to appropriate models
- Choose model role based on task complexity: \`heavy\` for deep reasoning, \`light\` for simple lookups, \`coding\` for code work
- Pass ALL necessary context in the \`task\` field — sub-agents have no shared memory or conversation history
- Synthesize sub-agent outputs into a single cohesive final response
- If a task is straightforward, handle it yourself without spawning sub-agents
- Prefer \`role\` over explicit \`model\` unless you need a specific model's capabilities`

  return basePrompt !== undefined
    ? `${basePrompt}\n\n---\n\n${orchestratorSection}`
    : orchestratorSection
}

// ── Options / Entry point ─────────────────────────────────────────────────────

export interface OrchestratorTurnOptions {
  provider: Provider
  session: Session
  tools: ToolRegistry
  bus: EventBus
  permissions: DefaultPermissionEngine
  systemPrompt?: string
  signal?: AbortSignal
  catalog: ModelCatalogEntry[]
  currentModel: string
  maxDepth?: number
}

export async function runOrchestratorTurn(opts: OrchestratorTurnOptions): Promise<void> {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH

  const spawnTool = createSpawnAgentTool({
    provider: opts.provider,
    tools: opts.tools,
    permissions: opts.permissions,
    catalog: opts.catalog,
    currentModel: opts.currentModel,
    depth: 0,
    maxDepth,
  })

  const augTools = new AugmentedToolRegistry(opts.tools, [spawnTool as Tool])

  const orchestratorPrompt = buildOrchestratorPrompt(
    opts.catalog,
    opts.currentModel,
    opts.systemPrompt,
  )

  await runAgentTurn({
    provider: opts.provider,
    session: opts.session,
    tools: augTools,
    bus: opts.bus,
    permissions: opts.permissions,
    systemPrompt: orchestratorPrompt,
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  })
}
