import type { Skill, SkillRegistry } from './types.js'

export class DefaultSkillRegistry implements SkillRegistry {
  private readonly skills = new Map<string, Skill>()

  register(skill: Skill): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill already registered: ${skill.name}`)
    }
    this.skills.set(skill.name, skill)
  }

  unregister(name: string): void {
    this.skills.delete(name)
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  list(): Skill[] {
    return [...this.skills.values()]
  }

  buildListing(): string {
    const lines = this.list().map(s => `- /${s.name}: ${s.description}`)
    if (lines.length === 0) return ''
    return `## Available Skills\n${lines.join('\n')}`
  }

  buildPrompt(name: string): string | undefined {
    const skill = this.skills.get(name)
    if (!skill) return undefined
    return `## Skill: ${skill.name}\n\n${skill.prompt}`
  }
}
