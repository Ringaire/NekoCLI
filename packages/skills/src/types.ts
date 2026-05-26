export interface Skill {
  /** Unique identifier, also used as slash-command name */
  readonly name: string
  /** One-line description shown in skill listing (system prompt budget) */
  readonly description: string
  /** Full prompt injected on demand when skill is invoked */
  readonly prompt: string
  /** Tool names this skill exposes (registered in ToolRegistry) */
  readonly tools: readonly string[]
  /** Source — built-in, mcp, or plugin */
  readonly source: 'builtin' | 'mcp' | 'plugin'
}

export interface SkillRegistry {
  register(skill: Skill): void
  unregister(name: string): void
  get(name: string): Skill | undefined
  list(): Skill[]
  /** One-line listing for system prompt (all skills, compact) */
  buildListing(): string
  /** Full prompt block for a single skill */
  buildPrompt(name: string): string | undefined
}
