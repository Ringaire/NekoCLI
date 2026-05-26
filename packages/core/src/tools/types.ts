/**
 * NekoCode Core - Tool Type Definitions
 */

// ── JSON Schema subset for LLM tool calling ──────────────────────────────────

export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'

export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[]
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: unknown[]
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  additionalProperties?: boolean | JSONSchema
  oneOf?: JSONSchema[]
  anyOf?: JSONSchema[]
  allOf?: JSONSchema[]
  $ref?: string
}

// ── Tool Result ───────────────────────────────────────────────────────────────

export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string }
  | { type: 'resource'; uri: string; mimeType?: string; text?: string }

export type ToolResult =
  | { ok: true; content: ToolResultContent[]; metadata?: Record<string, unknown> }
  | { ok: false; error: string; code?: string }

// ── Permission ────────────────────────────────────────────────────────────────

export type PermissionLevel =
  | 'none'        // no permission needed (read-only, safe)
  | 'auto'        // auto-approve in permissive modes
  | 'always'      // always ask user

export interface PermissionRequest {
  level: PermissionLevel
  title: string
  description: string
  /** Rendered preview shown to user before approval */
  preview?: string
}

// ── Tool Context ──────────────────────────────────────────────────────────────

export interface ToolContext {
  /** Current working directory */
  cwd: string
  /** Session ID this tool call belongs to */
  sessionId: string
  /** Abort signal - tools must respect this */
  signal: AbortSignal
  /** Emit an event to the session event bus */
  emit: (event: string, payload: unknown) => void
  /** Request user permission - resolves to true if granted */
  requestPermission: (req: PermissionRequest) => Promise<boolean>
  /** Environment variables available to tools */
  env: Record<string, string>
}

// ── Tool Definition ───────────────────────────────────────────────────────────

export interface Tool<TInput = unknown> {
  /** Unique identifier, snake_case (e.g. "bash", "read_file") */
  readonly name: string
  /** Short description shown in listings */
  readonly description: string
  /** Full prompt injected into context when tool is active */
  readonly prompt?: string
  /** JSON Schema for LLM tool-call validation */
  readonly inputSchema: JSONSchema
  /** Permission level - determines when to ask user */
  readonly permission: PermissionLevel
  /** Build permission request from input (called before execute) */
  buildPermissionRequest?: (input: TInput) => PermissionRequest
  /** Execute the tool */
  execute(input: TInput, ctx: ToolContext): Promise<ToolResult>
}

// ── Tool Registry ─────────────────────────────────────────────────────────────

export interface ToolRegistry {
  register(tool: Tool): void
  unregister(name: string): void
  get(name: string): Tool | undefined
  list(): Tool[]
}
