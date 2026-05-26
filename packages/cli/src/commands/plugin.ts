import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { paths } from '@nekocode/core/config/paths'

const execAsync = promisify(exec)

const PLUGIN_DIR = join(paths.sessions.replace('/sessions', ''), 'plugins')
const PLUGIN_MANIFEST = join(PLUGIN_DIR, 'installed.json')

export interface PluginEntry {
  name: string
  version: string
  installedAt: string
  path: string
}

async function readManifest(): Promise<PluginEntry[]> {
  try {
    return JSON.parse(await readFile(PLUGIN_MANIFEST, 'utf-8')) as PluginEntry[]
  } catch {
    return []
  }
}

async function writeManifest(plugins: PluginEntry[]): Promise<void> {
  await mkdir(PLUGIN_DIR, { recursive: true })
  await writeFile(PLUGIN_MANIFEST, JSON.stringify(plugins, null, 2), 'utf-8')
}

export async function pluginInstall(pkg: string): Promise<string> {
  await mkdir(PLUGIN_DIR, { recursive: true })

  // npm install into plugin dir
  try {
    await execAsync(`npm install --prefix ${PLUGIN_DIR} ${pkg} --save`)
  } catch (err) {
    return `Failed to install ${pkg}: ${String(err)}`
  }

  // Read installed version from node_modules
  const pkgName = pkg.includes('@') && !pkg.startsWith('@')
    ? pkg.split('@')[0]!
    : pkg.replace(/@[\d.]+$/, '')

  let version = 'unknown'
  try {
    const pkgJson = JSON.parse(
      await readFile(join(PLUGIN_DIR, 'node_modules', pkgName, 'package.json'), 'utf-8'),
    ) as { version: string }
    version = pkgJson.version
  } catch { /* ignore */ }

  const plugins = await readManifest()
  const existing = plugins.findIndex(p => p.name === pkgName)
  const entry: PluginEntry = {
    name: pkgName,
    version,
    installedAt: new Date().toISOString(),
    path: join(PLUGIN_DIR, 'node_modules', pkgName),
  }

  if (existing !== -1) {
    plugins[existing] = entry
  } else {
    plugins.push(entry)
  }
  await writeManifest(plugins)

  return `Installed ${pkgName}@${version} → ${entry.path}`
}

export async function pluginList(): Promise<string> {
  const plugins = await readManifest()
  if (plugins.length === 0) return 'No plugins installed.'
  return plugins.map(p => `  ${p.name}@${p.version}  (${p.installedAt.slice(0, 10)})`).join('\n')
}

export async function pluginRemove(name: string): Promise<string> {
  const plugins = await readManifest()
  const idx = plugins.findIndex(p => p.name === name)
  if (idx === -1) return `Plugin not found: ${name}`

  const entry = plugins[idx]!
  try {
    await rm(entry.path, { recursive: true, force: true })
    await execAsync(`npm uninstall --prefix ${PLUGIN_DIR} ${name}`)
  } catch { /* ignore partial failures */ }

  plugins.splice(idx, 1)
  await writeManifest(plugins)
  return `Removed ${name}`
}

export async function loadPlugins(): Promise<unknown[]> {
  const plugins = await readManifest()
  const loaded: unknown[] = []
  for (const p of plugins) {
    try {
      const mod = await import(resolve(p.path))
      loaded.push(mod)
    } catch (err) {
      console.warn(`[plugin] Failed to load ${p.name}: ${String(err)}`)
    }
  }
  return loaded
}
