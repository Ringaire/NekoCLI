import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import chalk from 'chalk'
import { loadConfig, saveConfig } from '@nekocode/core'
import { PRESETS } from '@nekocode/providers'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step =
  | 'select'        // provider list
  | 'apikey'        // key input for preset providers
  | 'custom-name'   // custom provider name
  | 'custom-url'    // custom base URL
  | 'custom-key'    // optional API key for custom
  | 'fetch-models'  // fetching /models endpoint
  | 'select-model'  // pick from fetched model list
  | 'saving'
  | 'done'
  | 'error'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESET_LIST = Object.entries(PRESETS)
const CUSTOM_ENTRY = ['__custom__', {
  name: 'Custom  (OpenAI-compatible)',
  type: 'openai-compatible' as const,
  baseUrl: undefined,
  apiKeyEnv: 'optional',
}] as const

const ALL_ENTRIES = [...PRESET_LIST, CUSTOM_ENTRY]
const VISIBLE = 9
const MODEL_VISIBLE = 10

const DEFAULT_MODELS: Record<string, string> = {
  anthropic:   'claude-sonnet-4-6',
  openai:      'gpt-4o',
  gemini:      'gemini-2.0-flash',
  deepseek:    'deepseek-chat',
  groq:        'llama-3.3-70b-versatile',
  siliconflow: 'Qwen/Qwen2.5-72B-Instruct',
  openrouter:  'anthropic/claude-sonnet-4-6',
  mistral:     'mistral-large-latest',
  together:    'meta-llama/Llama-3-70b-chat-hf',
  moonshot:    'moonshot-v1-8k',
  zhipu:       'glm-4',
  baidu:       'ernie-4.0-turbo-8k',
  ollama:      'llama3.2',
  lmstudio:    'local-model',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (key.length === 0) return ''
  if (key.length <= 8) return '•'.repeat(key.length)
  return key.slice(0, 6) + '•'.repeat(Math.min(key.length - 6, 20))
}

async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = baseUrl.replace(/\/$/, '') + '/models'
  const headers: Record<string, string> = {}
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { data?: Array<{ id: string }> }
  return (data.data ?? []).map(m => m.id).filter(Boolean)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onDone: (configured: boolean) => void
}

export function ProviderSetup({ onDone }: Props) {
  // Provider selection
  const [step, setStep]           = useState<Step>('select')
  const [idx, setIdx]             = useState(0)
  const [scrollTop, setScrollTop] = useState(0)

  // Chosen preset key or custom name
  const [providerKey, setProviderKey] = useState('')
  const [isCustom, setIsCustom]       = useState(false)

  // Text input (shared field — cleared on step change)
  const [textInput, setTextInput] = useState('')

  // Custom provider fields
  const [customUrl, setCustomUrl] = useState('')
  const [apiKey, setApiKey]       = useState('')

  // Model picker
  const [fetchedModels, setFetchedModels]       = useState<string[]>([])
  const [modelIdx, setModelIdx]                 = useState(0)
  const [modelScrollTop, setModelScrollTop]     = useState(0)
  const [selectedModel, setSelectedModel]       = useState('')

  // Status
  const [statusMsg, setStatusMsg] = useState('')

  // ── Save ──────────────────────────────────────────────────────────────────

  const performSave = useCallback(async (
    provider: string,
    url: string,
    key: string,
    model: string,
  ) => {
    setStep('saving')
    try {
      const cfg = await loadConfig()
      cfg.providers ??= {}
      cfg.providers[provider] = {
        ...(key ? { apiKey: key } : {}),
        ...(url ? { baseUrl: url } : {}),
      }
      const finalModel = model || DEFAULT_MODELS[provider] || 'default'
      cfg.model = `${provider}/${finalModel}`
      await saveConfig(cfg)
      setStatusMsg(`${provider} connected  •  model: ${cfg.model}`)
      setStep('done')
      setTimeout(() => onDone(true), 1500)
    } catch (err) {
      setStatusMsg(String(err))
      setStep('error')
    }
  }, [onDone])

  // ── Fetch models side-effect ───────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'fetch-models') return
    let active = true

    void (async () => {
      try {
        const baseUrl = isCustom ? customUrl : (PRESETS[providerKey]?.baseUrl ?? '')
        const models  = await fetchModels(baseUrl, apiKey)
        if (!active) return
        if (models.length > 0) {
          setFetchedModels(models)
          setModelIdx(0)
          setModelScrollTop(0)
          setStep('select-model')
        } else {
          await performSave(providerKey, customUrl, apiKey, DEFAULT_MODELS[providerKey] ?? '')
        }
      } catch (err) {
        if (!active) return
        setStatusMsg(`Could not fetch models: ${String(err)}`)
        setStep('error')
      }
    })()

    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ── Keyboard handler ───────────────────────────────────────────────────────

  useInput((input, key) => {

    // ── Provider list ──────────────────────────────────────────────────────
    if (step === 'select') {
      if (key.upArrow) {
        setIdx(i => {
          const next = Math.max(0, i - 1)
          setScrollTop(t => next < t ? next : t)
          return next
        })
        return
      }
      if (key.downArrow) {
        setIdx(i => {
          const next = Math.min(ALL_ENTRIES.length - 1, i + 1)
          setScrollTop(t => next >= t + VISIBLE ? next - VISIBLE + 1 : t)
          return next
        })
        return
      }
      if (key.return) {
        const entry = ALL_ENTRIES[idx]
        if (!entry) return
        const [name] = entry
        if (name === '__custom__') {
          setIsCustom(true)
          setTextInput('')
          setStep('custom-name')
        } else {
          setIsCustom(false)
          setProviderKey(name)
          const preset = PRESETS[name]!
          if (!preset.apiKeyEnv) {
            void performSave(name, '', '', DEFAULT_MODELS[name] ?? '')
          } else {
            setTextInput('')
            setStep('apikey')
          }
        }
        return
      }
      if (key.escape) { onDone(false); return }
    }

    // ── Preset API key ─────────────────────────────────────────────────────
    if (step === 'apikey') {
      if (key.return) {
        void performSave(providerKey, '', textInput.trim(), DEFAULT_MODELS[providerKey] ?? '')
        return
      }
      if (key.escape) { setStep('select'); setTextInput(''); return }
      handleText(input, key, textInput, setTextInput)
    }

    // ── Custom: name ──────────────────────────────────────────────────────
    if (step === 'custom-name') {
      if (key.return) {
        const name = textInput.trim()
        if (!name) return
        setProviderKey(name)
        setTextInput('')
        setStep('custom-url')
        return
      }
      if (key.escape) { setStep('select'); setTextInput(''); return }
      handleText(input, key, textInput, setTextInput)
    }

    // ── Custom: base URL ──────────────────────────────────────────────────
    if (step === 'custom-url') {
      if (key.return) {
        const url = textInput.trim()
        if (!url) return
        setCustomUrl(url)
        setTextInput('')
        setStep('custom-key')
        return
      }
      if (key.escape) { setStep('custom-name'); setTextInput(providerKey); return }
      handleText(input, key, textInput, setTextInput)
    }

    // ── Custom: API key (optional) ─────────────────────────────────────────
    if (step === 'custom-key') {
      if (key.return) {
        const k = textInput.trim()
        setApiKey(k)
        setStep('fetch-models')
        return
      }
      if (key.escape) { setStep('custom-url'); setTextInput(customUrl); return }
      handleText(input, key, textInput, setTextInput)
    }

    // ── Model picker ───────────────────────────────────────────────────────
    if (step === 'select-model') {
      if (key.upArrow) {
        setModelIdx(i => {
          const next = Math.max(0, i - 1)
          setModelScrollTop(t => next < t ? next : t)
          return next
        })
        return
      }
      if (key.downArrow) {
        setModelIdx(i => {
          const next = Math.min(fetchedModels.length - 1, i + 1)
          setModelScrollTop(t => next >= t + MODEL_VISIBLE ? next - MODEL_VISIBLE + 1 : t)
          return next
        })
        return
      }
      if (key.return) {
        const model = fetchedModels[modelIdx] ?? ''
        setSelectedModel(model)
        void performSave(providerKey, isCustom ? customUrl : '', apiKey, model)
        return
      }
      if (key.escape) { setStep('select'); return }
    }

    // ── Error ──────────────────────────────────────────────────────────────
    if (step === 'error') {
      if (key.escape || key.return) { setStep('select') }
    }
  })

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === 'select') {
    const visible = ALL_ENTRIES.slice(scrollTop, scrollTop + VISIBLE)
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box gap={2} marginBottom={1}>
          <Text bold color="cyan">Connect Provider</Text>
          <Text dimColor>↑↓ navigate  Enter select  Esc cancel</Text>
        </Box>
        <Box flexDirection="column">
          {scrollTop > 0 && <Text dimColor>  ↑ {scrollTop} more</Text>}
          {visible.map(([key, preset], i) => {
            const absIdx = scrollTop + i
            const sel = absIdx === idx
            const isCustomEntry = key === '__custom__'
            const hint = isCustomEntry
              ? chalk.dim('enter name, url, key')
              : preset.apiKeyEnv === 'optional'
                ? chalk.dim('optional key')
                : preset.apiKeyEnv
                  ? chalk.dim(preset.apiKeyEnv)
                  : chalk.dim('no key needed')
            return (
              <Box key={key}>
                {sel
                  ? <Text color="cyan" bold>{'› '}{key === '__custom__' ? 'custom        ' : key.padEnd(13)}{preset.name.padEnd(26)}{hint}</Text>
                  : <Text dimColor>{'  '}{key === '__custom__' ? 'custom        ' : key.padEnd(13)}{preset.name.padEnd(26)}{hint}</Text>
                }
              </Box>
            )
          })}
          {scrollTop + VISIBLE < ALL_ENTRIES.length && (
            <Text dimColor>  ↓ {ALL_ENTRIES.length - scrollTop - VISIBLE} more</Text>
          )}
        </Box>
      </Box>
    )
  }

  if (step === 'apikey') {
    const preset = PRESETS[providerKey]!
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box gap={2} marginBottom={1}>
          <Text bold color="cyan">Connect  —  {preset.name}</Text>
        </Box>
        {preset.baseUrl && <Text dimColor>Endpoint  {preset.baseUrl}</Text>}
        {preset.apiKeyEnv && <Text dimColor>Env var   {preset.apiKeyEnv}</Text>}
        <InputRow label="API Key" value={textInput} mask />
        <Box marginTop={1}><Text dimColor>Enter to save  Esc to go back</Text></Box>
      </Box>
    )
  }

  if (step === 'custom-name') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box gap={2} marginBottom={1}>
          <Text bold color="cyan">Custom Provider</Text>
          <Text dimColor>step 1 / 3</Text>
        </Box>
        <Text dimColor>Give this provider a short name (used in model strings)</Text>
        <InputRow label="Name" value={textInput} />
        <Box marginTop={1}><Text dimColor>Enter to continue  Esc to cancel</Text></Box>
      </Box>
    )
  }

  if (step === 'custom-url') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box gap={2} marginBottom={1}>
          <Text bold color="cyan">Custom Provider  —  {providerKey}</Text>
          <Text dimColor>step 2 / 3</Text>
        </Box>
        <Text dimColor>Base URL of the OpenAI-compatible endpoint</Text>
        <InputRow label="Base URL" value={textInput} placeholder="https://api.example.com/v1" />
        <Box marginTop={1}><Text dimColor>Enter to continue  Esc to go back</Text></Box>
      </Box>
    )
  }

  if (step === 'custom-key') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box gap={2} marginBottom={1}>
          <Text bold color="cyan">Custom Provider  —  {providerKey}</Text>
          <Text dimColor>step 3 / 3</Text>
        </Box>
        <Text dimColor>API key  (press Enter to skip if not required)</Text>
        <InputRow label="API Key" value={textInput} mask optional />
        <Box marginTop={1}><Text dimColor>Enter to continue  Esc to go back</Text></Box>
      </Box>
    )
  }

  if (step === 'fetch-models') {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="cyan">Fetching models from {isCustom ? customUrl : PRESETS[providerKey]?.baseUrl}…</Text>
      </Box>
    )
  }

  if (step === 'select-model') {
    const visible = fetchedModels.slice(modelScrollTop, modelScrollTop + MODEL_VISIBLE)
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box gap={2} marginBottom={1}>
          <Text bold color="cyan">Select Model  —  {providerKey}</Text>
          <Text dimColor>{fetchedModels.length} models found</Text>
        </Box>
        <Box flexDirection="column">
          {modelScrollTop > 0 && <Text dimColor>  ↑ {modelScrollTop} more</Text>}
          {visible.map((id, i) => {
            const absIdx = modelScrollTop + i
            const sel = absIdx === modelIdx
            return (
              <Box key={id}>
                {sel
                  ? <Text color="cyan" bold>{'› '}{id}</Text>
                  : <Text dimColor>{'  '}{id}</Text>
                }
              </Box>
            )
          })}
          {modelScrollTop + MODEL_VISIBLE < fetchedModels.length && (
            <Text dimColor>  ↓ {fetchedModels.length - modelScrollTop - MODEL_VISIBLE} more</Text>
          )}
        </Box>
        <Box marginTop={1}><Text dimColor>↑↓ navigate  Enter select  Esc cancel</Text></Box>
      </Box>
    )
  }

  if (step === 'saving') {
    return <Box paddingX={2} paddingY={1}><Text dimColor>Saving…</Text></Box>
  }

  if (step === 'done') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="green">✓ {statusMsg}</Text>
        <Text dimColor>  Run /reload to apply</Text>
      </Box>
    )
  }

  // error
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="red">✗ {statusMsg}</Text>
      <Text dimColor>Press Esc to go back</Text>
    </Box>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InputRow({
  label,
  value,
  placeholder,
  mask = false,
  optional = false,
}: {
  label: string
  value: string
  placeholder?: string
  mask?: boolean
  optional?: boolean
}) {
  const display = value.length === 0
    ? chalk.dim(placeholder ?? (optional ? '(skip with Enter)' : ''))
    : mask ? maskKey(value) : value

  return (
    <Box marginTop={1} gap={1}>
      <Text dimColor>{(label + ':').padEnd(10)}</Text>
      <Text color="cyan">{display}</Text>
      <Text color="cyan" inverse> </Text>
    </Box>
  )
}

// ── Text field helper ─────────────────────────────────────────────────────────

function handleText(
  input: string,
  key: { ctrl?: boolean; meta?: boolean; backspace?: boolean; delete?: boolean },
  value: string,
  setValue: (v: string) => void,
) {
  if (key.backspace || key.delete) { setValue(value.slice(0, -1)); return }
  if (key.ctrl) {
    if (input === 'u') { setValue(''); return }
    if (input === 'w') { setValue(value.replace(/\S+\s*$/, '')); return }
    return
  }
  if (input && !key.meta) setValue(value + input)
}
