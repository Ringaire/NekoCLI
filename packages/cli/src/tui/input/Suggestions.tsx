import React from 'react'
import { Box, Text } from 'ink'

export interface SuggestionItem {
  id: string
  value: string
  label: string
  description?: string
  icon?: string
}

export const MAX_SUGGESTIONS = 6

interface Props {
  items: SuggestionItem[]
  selectedIndex: number
}

export function Suggestions({ items, selectedIndex }: Props) {
  if (items.length === 0) return null

  // Sliding window — keep selectedIndex visible at the bottom of the window
  const windowStart = Math.min(
    Math.max(0, selectedIndex - MAX_SUGGESTIONS + 1),
    Math.max(0, items.length - MAX_SUGGESTIONS),
  )
  const windowEnd = Math.min(windowStart + MAX_SUGGESTIONS, items.length)
  const visible = items.slice(windowStart, windowEnd)

  const hiddenAbove = windowStart
  const hiddenBelow = items.length - windowEnd

  return (
    <Box flexDirection="column" paddingX={2} paddingY={0}>
      {hiddenAbove > 0 && (
        <Text dimColor>  ↑ {hiddenAbove} more</Text>
      )}
      {visible.map((item, i) => {
        const isSelected = windowStart + i === selectedIndex
        return (
          <Box key={item.id} flexDirection="row" gap={2}>
            {isSelected
              ? <Text color="cyan" bold>{'›'} {item.label}</Text>
              : <Text dimColor>{'  '}{item.label}</Text>
            }
            {item.description !== undefined && (
              <Text dimColor>{item.description}</Text>
            )}
          </Box>
        )
      })}
      {hiddenBelow > 0 && (
        <Text dimColor>  ↓ {hiddenBelow} more</Text>
      )}
      <Text dimColor>  ↑↓ navigate  Tab accept  Esc clear</Text>
    </Box>
  )
}
