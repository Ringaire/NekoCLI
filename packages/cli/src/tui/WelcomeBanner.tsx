import React from 'react'
import { Box, Text } from 'ink'
import type { ModeName } from '@nekocode/core/permissions'
import { AsciiPet } from './AsciiPet.js'

const VERSION = '0.1.0'

const MODE_COLOR: Record<ModeName, string> = {
  build: 'green',
  edit:  'yellow',
  ask:   'blue',
}

const MODE_DESC: Record<ModeName, string> = {
  build: 'all tools allowed',
  edit:  'no shell execution',
  ask:   'read-only, no writes',
}

interface Props {
  model: string
  mode: ModeName
  cwd: string
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <Box gap={2}>
      <Text dimColor>{label.padEnd(7)}</Text>
      {valueColor
        ? <Text color={valueColor}>{value}</Text>
        : <Text>{value}</Text>
      }
    </Box>
  )
}

function Section({ title }: { title: string }) {
  return (
    <Box marginTop={1}>
      <Text dimColor bold>{title}</Text>
    </Box>
  )
}

function Tip({ keys, desc }: { keys: string; desc: string }) {
  return (
    <Box gap={2}>
      <Text color="cyan">{keys.padEnd(20)}</Text>
      <Text dimColor>{desc}</Text>
    </Box>
  )
}

function Cmd({ name, desc }: { name: string; desc: string }) {
  return (
    <Box gap={2}>
      <Text color="cyan">{name.padEnd(10)}</Text>
      <Text dimColor>{desc}</Text>
    </Box>
  )
}

export function WelcomeBanner({ model, mode, cwd }: Props) {
  const modeColor = MODE_COLOR[mode]!

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1} paddingBottom={1}>

      {/* Header: pet on left, title + info on right */}
      <Box flexDirection="row" gap={3}>
        <AsciiPet />

        <Box flexDirection="column" justifyContent="center">
          {/* Title */}
          <Box flexDirection="row" gap={1}>
            <Text bold color="cyan">NekoCode</Text>
            <Text dimColor>v{VERSION}</Text>
            <Text dimColor>—</Text>
            <Text dimColor>AI coding assistant</Text>
          </Box>

          <Box flexDirection="column" marginTop={1}>
            <Row label="Model"  value={model} />
            <Row label="Mode"   value={`${mode.toUpperCase()}  ${MODE_DESC[mode]!}`} valueColor={modeColor} />
            <Row label="CWD"    value={cwd} />
          </Box>
        </Box>
      </Box>

      {/* Quick start */}
      <Section title="Quick start" />
      <Box flexDirection="column" paddingLeft={2}>
        <Tip keys="Tab"             desc="cycle mode: build → edit → ask" />
        <Tip keys="↑ / ↓"          desc="browse input history" />
        <Tip keys="@file.ts"        desc="attach file or directory" />
        <Tip keys="Ctrl+A / Ctrl+E" desc="line start / end" />
        <Tip keys="Ctrl+C"          desc="clear input or exit" />
      </Box>

      {/* Commands */}
      <Section title="Commands  (/ to see all)" />
      <Box flexDirection="row" gap={4} paddingLeft={2}>
        <Box flexDirection="column">
          <Cmd name="/help"   desc="full command list" />
          <Cmd name="/model"  desc="show or switch model" />
          <Cmd name="/new"    desc="new session" />
          <Cmd name="/reload" desc="reload config & MCP" />
        </Box>
        <Box flexDirection="column">
          <Cmd name="/review" desc="code review (git diff)" />
          <Cmd name="/init"   desc="generate AGENTS.md" />
          <Cmd name="/diff"   desc="show git diff in chat" />
          <Cmd name="/skills" desc="list loaded skills" />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{'─'.repeat(50)}</Text>
      </Box>
      <Text dimColor>  Start typing to chat  ·  / for commands  ·  Tab to switch mode</Text>
    </Box>
  )
}
