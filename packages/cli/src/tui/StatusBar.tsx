import React from 'react'
import { Box, Text } from 'ink'
import type { ModeName } from '@nekocode/core/permissions'
import { MODE_DESCRIPTIONS } from '@nekocode/core/permissions'

const MODE_COLOR: Record<ModeName, string> = {
  build: 'green',
  edit:  'yellow',
  ask:   'blue',
}

interface Props {
  mode: ModeName
  model: string
  tokens: number
  contextWindow: number
  orchestrator?: boolean
  thinking?: boolean
}

export function StatusBar({ mode, model, tokens, contextWindow, orchestrator, thinking }: Props) {
  const color = MODE_COLOR[mode]!
  const pct = contextWindow > 0 ? ((tokens / contextWindow) * 100).toFixed(1) : '0.0'
  const desc = MODE_DESCRIPTIONS[mode]!.split('—')[0]!.trim()

  return (
    <Box
      borderStyle="single"
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderTop={true}
      paddingX={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      <Box gap={2}>
        <Text color={color} bold>[{mode.toUpperCase()}]</Text>
        <Text dimColor>{desc}</Text>
        {orchestrator && <Text color="magenta" bold>[ORCH]</Text>}
        {thinking && <Text color="yellow" bold>[THINK]</Text>}
      </Box>
      <Box gap={2}>
        <Text dimColor>{model}</Text>
        <Text dimColor>~{tokens.toLocaleString()} / {(contextWindow / 1000).toFixed(0)}k ({pct}%)</Text>
        <Text dimColor>Tab: mode  /help: commands</Text>
      </Box>
    </Box>
  )
}
