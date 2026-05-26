import { watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DefaultToolRegistry } from '../tools/registry.js'
import { DefaultEventBus } from '../events/bus.js'
import type { Tool, ToolRegistry } from '../tools/types.js'
import type { EventBus } from '../events/index.js'
import type { NekoConfig, McpServerState, McpServerConfig } from './types.js'

export class NekoRuntime {
  readonly tools: ToolRegistry
  readonly bus: EventBus
  private _skills?: {
    register(s: unknown): void
    unregister(name: string): void
    list(): Array<{ name: string; prompt: string; description: string; tools: readonly string[] }>
    get(name: string): { name: string; prompt: string; description: string } | undefined
    buildListing(): string
    buildPrompt(name: string): string | undefined
  }
  private readonly mcpServers = new Map<string, McpServerState>()
  private configWatcher?: FSWatcher
  private configPath?: string

  constructor() {
    this.tools = new DefaultToolRegistry()
    this.bus = new DefaultEventBus()
  }

  get skills() { return this._skills }

  // ── MCP ────────────────────────────────────────────────────────────────────

  async loadMcpServer(name: string, cfg: McpServerConfig): Promise<void> {
    if (this.mcpServers.has(name)) await this.unloadMcpServer(name)

    // Dynamic imports — widened to string to skip TS module resolution (avoids circular dep)
    const mcpMod = await import('@nekocode/mcp' as string) as {
      loadMcpTools(cfg: McpServerConfig, name: string): Promise<{ tools: Tool[]; close(): void }>
      connectMcp(cfg: McpServerConfig): Promise<{ listTools(): Promise<Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>>; close(): void }>
    }
    const { loadMcpTools, connectMcp } = mcpMod
    const skillsMod = await import('@nekocode/skills' as string) as {
      DefaultSkillRegistry: new () => NonNullable<NekoRuntime['_skills']>
      mcpToolsToSkills(defs: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>, serverName: string): Array<{ name: string; description: string; prompt: string; tools: readonly string[]; source: string }>
    }
    const { DefaultSkillRegistry, mcpToolsToSkills } = skillsMod

    if (!this._skills) this._skills = new DefaultSkillRegistry()

    const { tools, close } = await loadMcpTools(cfg, name)
    const toolNames: string[] = []
    for (const tool of tools) {
      this.tools.register(tool)
      toolNames.push(tool.name)
    }

    const client = await connectMcp(cfg)
    const defs = await client.listTools()
    client.close()

    const skills = mcpToolsToSkills(defs, name)
    const skillNames: string[] = []
    for (const skill of skills) {
      try { this._skills.register(skill); skillNames.push(skill.name) } catch { /* dup */ }
    }

    this.mcpServers.set(name, { name, cfg, close, toolNames, skillNames })
  }

  async unloadMcpServer(name: string): Promise<void> {
    const state = this.mcpServers.get(name)
    if (!state) return
    state.close()
    for (const t of state.toolNames) this.tools.unregister(t)
    for (const s of state.skillNames) this._skills?.unregister(s)
    this.mcpServers.delete(name)
  }

  // ── Config ─────────────────────────────────────────────────────────────────

  async applyConfig(cfg: NekoConfig): Promise<void> {
    for (const name of this.mcpServers.keys()) {
      if (!cfg.mcpServers?.[name]) await this.unloadMcpServer(name)
    }
    for (const [name, serverCfg] of Object.entries(cfg.mcpServers ?? {})) {
      await this.loadMcpServer(name, serverCfg)
    }
  }

  async loadConfigFile(path: string): Promise<void> {
    this.configPath = resolve(path)
    const raw = await readFile(this.configPath, 'utf-8')
    await this.applyConfig(JSON.parse(raw) as NekoConfig)
  }

  watchConfig(path: string): void {
    this.configPath = resolve(path)
    let debounce: ReturnType<typeof setTimeout> | undefined
    this.configWatcher = watch(this.configPath, () => {
      clearTimeout(debounce)
      debounce = setTimeout(async () => {
        try { await this.loadConfigFile(this.configPath!) } catch { /* ignore */ }
      }, 300)
    })
  }

  async dispose(): Promise<void> {
    this.configWatcher?.close()
    for (const name of [...this.mcpServers.keys()]) await this.unloadMcpServer(name)
  }
}

export type { NekoConfig, McpServerConfig } from './types.js'
