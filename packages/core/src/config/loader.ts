import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { paths } from './paths.js'
import { defaultConfig, type NekoUserConfig, type ResolvedConfig } from './schema.js'

// ── JSONC parser — strips // and /* */ comments before JSON.parse ─────────────

export function parseJsonc(raw: string): unknown {
  // State machine to strip comments without breaking strings
  let out = ''
  let i = 0
  let inString = false
  let escape = false

  while (i < raw.length) {
    const ch = raw[i]!

    if (escape) {
      out += ch
      escape = false
      i++
      continue
    }

    if (inString) {
      if (ch === '\\') { escape = true; out += ch; i++; continue }
      if (ch === '"')  { inString = false }
      out += ch
      i++
      continue
    }

    // Outside string
    if (ch === '"') {
      inString = true
      out += ch
      i++
      continue
    }

    // Single-line comment
    if (ch === '/' && raw[i + 1] === '/') {
      while (i < raw.length && raw[i] !== '\n') i++
      continue
    }

    // Multi-line comment
    if (ch === '/' && raw[i + 1] === '*') {
      i += 2
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++
      i += 2
      continue
    }

    // Trailing comma before } or ] — JSONC allows, standard JSON does not
    // We handle this by not stripping (JSON.parse will error, which is intentional
    // for now — full trailing-comma support would need more state)

    out += ch
    i++
  }

  return JSON.parse(out)
}

// ── Deep merge (right wins for scalars, recursive for objects) ────────────────

function merge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base }
  for (const key of Object.keys(override) as (keyof T)[]) {
    const v = override[key]
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof result[key] === 'object') {
      result[key] = merge(result[key] as object, v as object) as T[keyof T]
    } else if (v !== undefined) {
      result[key] = v as T[keyof T]
    }
  }
  return result
}

// ── Single-file loader ────────────────────────────────────────────────────────

async function tryReadConfig(filePath: string): Promise<Partial<NekoUserConfig> | null> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return parseJsonc(raw) as Partial<NekoUserConfig>
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

// ── Project config discovery — walks up from cwd ─────────────────────────────

async function findProjectConfig(
  cwd: string,
): Promise<{ project: Partial<NekoUserConfig> | null; local: Partial<NekoUserConfig> | null }> {
  // Check cwd itself, then parent directories up to fs root
  let dir = resolve(cwd)
  const root = resolve('/')

  while (true) {
    const projectPath = paths.projectConfig(dir)
    const localPath   = paths.projectLocalConfig(dir)

    const [project, local] = await Promise.all([
      tryReadConfig(projectPath),
      tryReadConfig(localPath),
    ])

    if (project !== null || local !== null) {
      return { project, local }
    }

    if (dir === root) break
    dir = dirname(dir)
  }

  return { project: null, local: null }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load config with three-layer merge:
 *   global (~/.config/nekocode/settings.jsonc)
 *   → project (.nekocode/settings.jsonc found by walking up from cwd)
 *   → local   (.nekocode/settings.local.jsonc, not committed)
 *
 * @param cwd Working directory to search for project config (default: process.cwd())
 */
export async function loadConfig(cwd?: string): Promise<ResolvedConfig> {
  const globalCfg = await tryReadConfig(paths.config) ?? {}
  let merged = merge(defaultConfig, globalCfg) as ResolvedConfig

  if (cwd !== undefined) {
    const { project, local } = await findProjectConfig(cwd)
    if (project) merged = merge(merged, project) as ResolvedConfig
    if (local)   merged = merge(merged, local) as ResolvedConfig
  }

  return merged
}

/**
 * Save to the global config file.
 * Writes clean JSON (valid JSONC subset — user comments are preserved externally).
 */
export async function saveConfig(cfg: NekoUserConfig): Promise<void> {
  await mkdir(dirname(paths.config), { recursive: true })
  await writeFile(paths.config, JSON.stringify(cfg, null, 2) + '\n', 'utf-8')
}

/**
 * Ensure all required directories exist.
 */
export async function initDirs(): Promise<void> {
  await Promise.all([
    mkdir(paths.configDir, { recursive: true }),
    mkdir(paths.sessions, { recursive: true }),
    mkdir(paths.cache, { recursive: true }),
    mkdir(paths.skills, { recursive: true }),
  ])
}

/**
 * Watch the global config file for changes.
 */
export function watchConfig(onChange: (cfg: ResolvedConfig) => void): FSWatcher {
  let debounce: NodeJS.Timeout | undefined
  return watch(paths.config, () => {
    clearTimeout(debounce)
    debounce = setTimeout(async () => {
      try {
        const cfg = await loadConfig()
        onChange(cfg)
      } catch { /* ignore parse errors during edit */ }
    }, 300)
  })
}

/**
 * Initialize .nekocode/ project config directory with empty settings.jsonc.
 * Creates a commented template if not already present.
 */
export async function initProjectConfig(cwd: string): Promise<string> {
  const configPath = join(cwd, '.nekocode', 'settings.jsonc')
  try {
    await readFile(configPath, 'utf-8')
    return configPath // already exists
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }

  await mkdir(join(cwd, '.nekocode'), { recursive: true })
  const template = `\
{
  // Project-level NekoCode settings — commit this file.
  // Local overrides go in settings.local.jsonc (add to .gitignore).

  // Override active model for this project:
  // "model": "anthropic/claude-sonnet-4-6",

  // Project-specific MCP servers:
  // "mcpServers": {},

  // Orchestrator max sub-agent depth:
  // "orchestrator": { "maxDepth": 2 }
}
`
  await writeFile(configPath, template, 'utf-8')
  return configPath
}
