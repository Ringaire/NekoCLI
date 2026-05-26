import type { ModelRole, ModelCatalogEntry } from './types.js'

const RE_HEAVY  = /opus|o[13]-|gpt-4(?!o-mini)|gemini.*(?:pro|ultra)|deepseek-r[12]|llama.*(?:70|72|90|110)[bB]|qwen.*max/i
const RE_LIGHT  = /haiku|gpt-3\.5|gemini.*flash.lite|llama.*[3-8][bB](?!\d)|phi-[234]|mistral-7b|qwen.*1\.5[bB]/i
const RE_CODING = /codestral|deepseek-coder|starcoder|codegemma/i

export function classifyModel(modelId: string): ModelRole {
  if (RE_CODING.test(modelId)) return 'coding'
  if (RE_HEAVY.test(modelId))  return 'heavy'
  if (RE_LIGHT.test(modelId))  return 'light'
  return 'balanced'
}

const ROLE_FALLBACKS: Record<ModelRole, ModelRole[]> = {
  heavy:    ['heavy', 'balanced', 'coding', 'light'],
  balanced: ['balanced', 'heavy', 'light', 'coding'],
  light:    ['light', 'balanced', 'coding', 'heavy'],
  coding:   ['coding', 'balanced', 'heavy', 'light'],
}

export function selectModelByRole(
  role: ModelRole,
  catalog: ModelCatalogEntry[],
  fallback: string,
): string {
  for (const r of ROLE_FALLBACKS[role]) {
    const match = catalog.find(m => m.role === r)
    if (match) return match.id
  }
  return fallback
}

export function buildModelCatalog(modelIds: string[]): ModelCatalogEntry[] {
  return modelIds.map(id => ({ id, role: classifyModel(id) }))
}
