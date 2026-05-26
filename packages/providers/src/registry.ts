import type { Provider } from './types.js'
import type { ResolvedConfig } from '@nekocode/core/config/schema'
import { PRESETS } from './presets.js'

export interface ResolvedProvider {
  provider: Provider
  /** Final model ID to pass to the API (without the "provider/" prefix) */
  model: string
}

function parseModel(model: string): { providerName: string; modelId: string } {
  const slash = model.indexOf('/')
  if (slash === -1) {
    // Legacy: bare model name, assume anthropic
    return { providerName: 'anthropic', modelId: model }
  }
  return { providerName: model.slice(0, slash), modelId: model.slice(slash + 1) }
}

export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>()

  register(provider: Provider): void {
    this.providers.set(provider.id, provider)
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id)
  }

  /**
   * Resolve provider + model from config.
   * Supports both new format (providers + model) and legacy (provider).
   */
  async fromConfig(cfg: ResolvedConfig): Promise<ResolvedProvider> {
    // ── New format: model = "provider/model-id" ───────────────────────────
    if (cfg.model) {
      const { providerName, modelId } = parseModel(cfg.model)
      const preset = PRESETS[providerName]
      const entry  = cfg.providers?.[providerName]

      if (!preset && !entry?.baseUrl) {
        throw new Error(
          `Unknown provider "${providerName}". ` +
          `Available: ${Object.keys(PRESETS).join(', ')}, ` +
          `or add baseUrl to your provider entry for custom providers.`
        )
      }

      const resolvedType = preset?.type ?? 'openai-compatible'
      const apiKey = entry?.apiKey ?? (preset?.apiKeyEnv ? process.env[preset.apiKeyEnv] : undefined)
      const baseUrl = entry?.baseUrl ?? preset?.baseUrl

      const provider = await this.instantiate(providerName, resolvedType, apiKey, baseUrl)
      return { provider, model: modelId }
    }

    // ── Legacy format: provider.type + provider.model ─────────────────────
    const legacy = cfg.provider ?? { type: 'anthropic' as const }
    const provider = await this.instantiateLegacy(legacy)
    const model = legacy.model ?? 'claude-sonnet-4-6'
    return { provider, model }
  }

  private async instantiate(
    id: string,
    type: string,
    apiKey: string | undefined,
    baseUrl: string | undefined,
  ): Promise<Provider> {
    const cached = this.providers.get(id)
    if (cached) return cached

    let provider: Provider

    switch (type) {
      case 'anthropic': {
        const { AnthropicProvider } = await import('./anthropic/index.js')
        provider = new AnthropicProvider(apiKey)
        break
      }
      case 'gemini': {
        const { GeminiProvider } = await import('./gemini/index.js')
        provider = new GeminiProvider(apiKey)
        break
      }
      case 'openai': {
        const { OpenAIProvider } = await import('./openai/index.js')
        provider = new OpenAIProvider(apiKey)
        break
      }
      default: {
        const { OpenAICompatibleProvider } = await import('./openai-compatible/index.js')
        provider = new OpenAICompatibleProvider(id, {
          ...(apiKey !== undefined ? { apiKey } : {}),
          ...(baseUrl !== undefined ? { baseURL: baseUrl } : {}),
        })
      }
    }

    this.register(provider)
    return provider
  }

  private async instantiateLegacy(cfg: { type: string; apiKey?: string; baseUrl?: string }): Promise<Provider> {
    switch (cfg.type) {
      case 'anthropic': {
        const { AnthropicProvider } = await import('./anthropic/index.js')
        const p = new AnthropicProvider(cfg.apiKey)
        this.register(p)
        return p
      }
      case 'openai': {
        const { OpenAIProvider } = await import('./openai/index.js')
        const p = new OpenAIProvider(cfg.apiKey)
        this.register(p)
        return p
      }
      case 'gemini': {
        const { GeminiProvider } = await import('./gemini/index.js')
        const p = new GeminiProvider(cfg.apiKey)
        this.register(p)
        return p
      }
      default: {
        const { OpenAICompatibleProvider } = await import('./openai-compatible/index.js')
        const p = new OpenAICompatibleProvider(cfg.type, {
          ...(cfg.apiKey !== undefined ? { apiKey: cfg.apiKey } : {}),
          ...(cfg.baseUrl !== undefined ? { baseURL: cfg.baseUrl } : {}),
        })
        this.register(p)
        return p
      }
    }
  }
}
