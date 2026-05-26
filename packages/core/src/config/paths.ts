import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

const appName = 'nekocode'

function xdgConfig(): string {
  return process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')
}
function xdgData(): string {
  return process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share')
}
function xdgCache(): string {
  return process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache')
}
function xdgState(): string {
  return process.env['XDG_STATE_HOME'] ?? join(homedir(), '.local', 'state')
}

export const paths = {
  /** ~/.config/nekocode/settings.jsonc  (or NEKOCODE_CONFIG override) */
  config: process.env['NEKOCODE_CONFIG']
    ?? join(xdgConfig(), appName, 'settings.jsonc'),

  /** ~/.local/share/nekocode/sessions/ */
  sessions: join(xdgData(), appName, 'sessions'),

  /** ~/.cache/nekocode/ */
  cache: join(xdgCache(), appName),

  /** ~/.local/state/nekocode/nekocode.log */
  log: join(xdgState(), appName, 'nekocode.log'),

  /** ~/.local/share/nekocode/skills/ */
  skills: join(xdgData(), appName, 'skills'),

  get configDir(): string {
    return dirname(this.config)
  },

  /** .nekocode/settings.jsonc — project-level config (commit this) */
  projectConfig(cwd: string): string {
    return join(cwd, '.nekocode', 'settings.jsonc')
  },

  /** .nekocode/settings.local.jsonc — local overrides (add to .gitignore) */
  projectLocalConfig(cwd: string): string {
    return join(cwd, '.nekocode', 'settings.local.jsonc')
  },
}
