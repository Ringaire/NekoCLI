export type PermissionAction = 'allow' | 'ask' | 'deny'

export type ModeName = 'build' | 'edit' | 'ask'

export interface PermissionRule {
  tool: string
  path?: string
  action: PermissionAction
  reason?: string
}

/** Input to the permission engine — what is being checked */
export interface AccessCheck {
  tool: string
  path?: string
  description: string
  preview?: string
}

export interface PermissionEngine {
  readonly mode: ModeName
  setMode(mode: ModeName): void
  allow(tool: string, path?: string): void
  deny(tool: string, path?: string): void
  evaluate(req: AccessCheck): PermissionAction
  customRules(): PermissionRule[]
}
