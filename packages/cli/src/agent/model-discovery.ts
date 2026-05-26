import type { ResolvedConfig } from '@nekocode/core/config/schema'
import { PRESETS } from '@nekocode/providers'
import { buildModelCatalog } from '@nekocode/core/agent/model-selector'
import type { ModelCatalogEntry } from '@nekocode/core/agent/types'

// ── models.dev/api.json types (best-effort) ───────────────────────────────────

interface ModelsDevModel {
  id: string
  name?: string
}

interface ModelsDevProvider {
  id?: string
  models?: ModelsDevModel[]
  [key: string]: unknown
}

type ModelsDevResponse = Record<string, ModelsDevProvider | ModelsDevModel[]>

async function fetchFromModelsDev(providerName: string): Promise<string[] | null> {
  try {
    const res = await fetch('https://models.dev/api.json', {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const data = await res.json() as ModelsDevResponse

    // Try to find models for the given provider
    // models.dev structure can vary — try common shapes
    const providerData = data[providerName]
    if (!providerData) {
      // Try aliases: e.g. "openai-compatible" → "openai"
      const aliased = data[providerName.replace(/-compatible$/, '')]
      if (!aliased) return null
      return extractModelIds(aliased)
    }
    return extractModelIds(providerData)
  } catch {
    return null
  }
}

function extractModelIds(entry: ModelsDevProvider | ModelsDevModel[]): string[] {
  if (Array.isArray(entry)) {
    return entry.map(m => m.id).filter((id): id is string => typeof id === 'string')
  }
  const models = entry.models ?? []
  return models.map(m => m.id).filter((id): id is string => typeof id === 'string')
}

async function fetchFromProviderEndpoint(
  baseUrl: string,
  apiKey: string | undefined,
): Promise<string[] | null> {
  try {
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const res = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json() as
      | { data: Array<{ id: string }> }
      | Array<{ id: string }>
    const items = Array.isArray(data) ? data : (data.data ?? [])
    const ids = items
      .map(m => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    return ids.length > 0 ? ids : null
  } catch {
    return null
  }
}

export async function discoverModels(
  config: ResolvedConfig,
  currentModelFull: string,
): Promise<ModelCatalogEntry[]> {
  const modelStr = config.model ?? currentModelFull
  const providerName = modelStr.split('/')[0] ?? 'anthropic'
  const preset = PRESETS[providerName]

  // 1. Try models.dev canonical catalog
  const fromModelsDev = await fetchFromModelsDev(providerName)
  if (fromModelsDev && fromModelsDev.length > 0) {
    return buildModelCatalog(fromModelsDev)
  }

  // 2. Try provider's own /models endpoint (OpenAI-compatible)
  if (preset?.baseUrl) {
    const entry = config.providers?.[providerName]
    const apiKey = entry?.apiKey ?? (preset.apiKeyEnv ? process.env[preset.apiKeyEnv] : undefined)
    const fromEndpoint = await fetchFromProviderEndpoint(preset.baseUrl, apiKey)
    if (fromEndpoint) return buildModelCatalog(fromEndpoint)
  }

  // 3. Minimal fallback — only the current model
  const currentId = currentModelFull.includes('/')
    ? currentModelFull.split('/').slice(1).join('/')
    : currentModelFull
  return buildModelCatalog([currentId])
}
