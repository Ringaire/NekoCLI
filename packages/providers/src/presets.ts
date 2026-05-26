export interface ProviderPreset {
  name: string
  type: 'anthropic' | 'openai' | 'gemini' | 'openai-compatible'
  baseUrl?: string
  /** Environment variable to fall back to when apiKey is not in config */
  apiKeyEnv?: string
}

/**
 * Built-in provider presets — base URLs pre-configured, user only needs apiKey.
 * Key is used as the provider name in "provider/model" model strings.
 */
export const PRESETS: Record<string, ProviderPreset> = {
  anthropic:   { name: 'Anthropic',    type: 'anthropic',         apiKeyEnv: 'ANTHROPIC_API_KEY' },
  openai:      { name: 'OpenAI',       type: 'openai',            apiKeyEnv: 'OPENAI_API_KEY' },
  gemini:      { name: 'Gemini',       type: 'gemini',            apiKeyEnv: 'GEMINI_API_KEY' },

  deepseek:    { name: 'DeepSeek',     type: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1',             apiKeyEnv: 'DEEPSEEK_API_KEY' },
  groq:        { name: 'Groq',         type: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1',          apiKeyEnv: 'GROQ_API_KEY' },
  siliconflow: { name: 'SiliconFlow',  type: 'openai-compatible', baseUrl: 'https://api.siliconflow.cn/v1',          apiKeyEnv: 'SILICONFLOW_API_KEY' },
  openrouter:  { name: 'OpenRouter',   type: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1',           apiKeyEnv: 'OPENROUTER_API_KEY' },
  mistral:     { name: 'Mistral',      type: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1',              apiKeyEnv: 'MISTRAL_API_KEY' },
  together:    { name: 'Together AI',  type: 'openai-compatible', baseUrl: 'https://api.together.xyz/v1',            apiKeyEnv: 'TOGETHER_API_KEY' },
  moonshot:    { name: 'Moonshot',     type: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1',             apiKeyEnv: 'MOONSHOT_API_KEY' },
  zhipu:       { name: 'Zhipu AI',     type: 'openai-compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',   apiKeyEnv: 'ZHIPU_API_KEY' },
  baidu:       { name: 'Baidu ERNIE',  type: 'openai-compatible', baseUrl: 'https://qianfan.baidubce.com/v2',        apiKeyEnv: 'BAIDU_API_KEY' },

  xai:         { name: 'xAI',          type: 'openai-compatible', baseUrl: 'https://api.x.ai/v1',                    apiKeyEnv: 'XAI_API_KEY' },
  cerebras:    { name: 'Cerebras',     type: 'openai-compatible', baseUrl: 'https://api.cerebras.ai/v1',             apiKeyEnv: 'CEREBRAS_API_KEY' },
  deepinfra:   { name: 'DeepInfra',    type: 'openai-compatible', baseUrl: 'https://api.deepinfra.com/v1/openai',    apiKeyEnv: 'DEEPINFRA_API_KEY' },
  fireworks:   { name: 'Fireworks',    type: 'openai-compatible', baseUrl: 'https://api.fireworks.ai/inference/v1',  apiKeyEnv: 'FIREWORKS_API_KEY' },
  baseten:     { name: 'Baseten',      type: 'openai-compatible', baseUrl: 'https://inference.baseten.co/v1',        apiKeyEnv: 'BASETEN_API_KEY' },
  nvidia:      { name: 'NVIDIA',       type: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1',    apiKeyEnv: 'NVIDIA_API_KEY' },
  perplexity:  { name: 'Perplexity',   type: 'openai-compatible', baseUrl: 'https://api.perplexity.ai',             apiKeyEnv: 'PERPLEXITY_API_KEY' },
  cohere:      { name: 'Cohere',       type: 'openai-compatible', baseUrl: 'https://api.cohere.com/compatibility/v1', apiKeyEnv: 'COHERE_API_KEY' },

  ollama:      { name: 'Ollama',       type: 'openai-compatible', baseUrl: 'http://localhost:11434/v1' },
  lmstudio:    { name: 'LM Studio',    type: 'openai-compatible', baseUrl: 'http://localhost:1234/v1' },

  mimo:        { name: 'MiMo',         type: 'openai-compatible', baseUrl: 'https://token-plan-sgp.xiaomimimo.com/v1', apiKeyEnv: 'MIMO_API_KEY' },
}

export function listPresets(): string {
  const rows = Object.entries(PRESETS).map(([key, p]) => {
    const url = p.baseUrl ?? '(official SDK)'
    const env = p.apiKeyEnv ? `  env: ${p.apiKeyEnv}` : '  (no key needed)'
    return `  ${key.padEnd(14)} ${p.name.padEnd(14)} ${url}${env}`
  })
  return ['Available providers:', ...rows].join('\n')
}
