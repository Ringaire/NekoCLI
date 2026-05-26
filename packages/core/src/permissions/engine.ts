import type { PermissionAction, PermissionEngine, AccessCheck, PermissionRule, ModeName } from './types.js'
import { MODE_RULES } from './modes.js'

function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('*')) return value.startsWith(pattern.slice(0, -1))
  if (pattern.startsWith('*')) return value.endsWith(pattern.slice(1))
  return pattern === value
}

function ruleMatches(rule: PermissionRule, req: AccessCheck): boolean {
  if (!globMatch(rule.tool, req.tool)) return false
  if (rule.path && req.path) {
    if (!globMatch(rule.path, req.path)) return false
  }
  return true
}

export class DefaultPermissionEngine implements PermissionEngine {
  private _mode: ModeName = 'build'
  /** User-defined overrides — evaluated before mode defaults */
  private readonly _custom: PermissionRule[] = []

  get mode(): ModeName { return this._mode }

  setMode(mode: ModeName): void {
    this._mode = mode
  }

  allow(tool: string, path?: string): void {
    this._removeExisting(tool, path)
    this._custom.unshift(path !== undefined ? { tool, path, action: 'allow' } : { tool, action: 'allow' })
  }

  deny(tool: string, path?: string): void {
    this._removeExisting(tool, path)
    this._custom.unshift(path !== undefined ? { tool, path, action: 'deny' } : { tool, action: 'deny' })
  }

  evaluate(req: AccessCheck): PermissionAction {
    // 1. User overrides take highest priority
    for (const rule of this._custom) {
      if (ruleMatches(rule, req)) return rule.action
    }
    // 2. Mode defaults
    for (const rule of MODE_RULES[this._mode]) {
      if (ruleMatches(rule, req)) return rule.action
    }
    // 3. Safe fallback
    return 'ask'
  }

  customRules(): PermissionRule[] {
    return [...this._custom]
  }

  private _removeExisting(tool: string, path?: string): void {
    const idx = this._custom.findIndex(r => r.tool === tool && r.path === path)
    if (idx !== -1) this._custom.splice(idx, 1)
  }
}
