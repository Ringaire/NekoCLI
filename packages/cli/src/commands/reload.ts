import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { loadConfig, paths } from '@nekocode/core'
import type { NekoRuntime } from '@nekocode/core'

interface SkillFile {
  name?: string
  description?: string
  prompt?: string
  tools?: string[]
}

/**
 * Load user skill files from ~/.local/share/nekocode/skills/
 * Each .json file defines one skill.
 */
async function loadUserSkills(runtime: NekoRuntime): Promise<{ loaded: string[]; errors: string[] }> {
  const loaded: string[] = []
  const errors: string[] = []

  let entries: string[] = []
  try {
    entries = (await readdir(paths.skills)).filter(f => extname(f) === '.json')
  } catch {
    return { loaded, errors }  // dir doesn't exist yet
  }

  // We need the skill registry — access it via the skills interface
  if (!runtime.skills) return { loaded, errors }

  for (const file of entries) {
    try {
      const raw = await readFile(join(paths.skills, file), 'utf-8')
      const def = JSON.parse(raw) as SkillFile
      if (!def.name || !def.description || !def.prompt) {
        errors.push(`${file}: missing required fields (name, description, prompt)`)
        continue
      }
      try {
        runtime.skills.register({
          name: def.name,
          description: def.description,
          prompt: def.prompt,
          tools: def.tools ?? [],
          source: 'plugin',
        })
        loaded.push(def.name)
      } catch {
        // Already registered — skip (not an error)
      }
    } catch (err) {
      errors.push(`${file}: ${String(err)}`)
    }
  }
  return { loaded, errors }
}

export interface ReloadResult {
  mcpReloaded: string[]
  skillsLoaded: string[]
  errors: string[]
}

/**
 * Hot-reload config.json → re-apply MCP servers + load user skills.
 */
export async function reloadAll(runtime: NekoRuntime): Promise<ReloadResult> {
  const errors: string[] = []
  const mcpReloaded: string[] = []

  // 1. Re-read config
  let config
  try {
    config = await loadConfig()
  } catch (err) {
    return { mcpReloaded, skillsLoaded: [], errors: [`Config load failed: ${String(err)}`] }
  }

  // 2. Re-apply MCP servers
  try {
    await runtime.applyConfig({ mcpServers: config.mcpServers })
    mcpReloaded.push(...Object.keys(config.mcpServers ?? {}))
  } catch (err) {
    errors.push(`MCP reload failed: ${String(err)}`)
  }

  // 3. Load user skills from disk
  const { loaded: skillsLoaded, errors: skillErrors } = await loadUserSkills(runtime)
  errors.push(...skillErrors)

  return { mcpReloaded, skillsLoaded, errors }
}
