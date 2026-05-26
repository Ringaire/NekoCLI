import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ModeName } from '@nekocode/core/permissions'
import { useTextInput } from './input/useTextInput.js'
import { Suggestions } from './input/Suggestions.js'
import { getCommandSuggestions, getArgumentHint, getInlineGhost } from '../input/completion.js'

const MODE_COLOR: Record<ModeName, string> = {
  build: 'green',
  edit:  'yellow',
  ask:   'blue',
}

interface Props {
  mode: ModeName
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  onTabEmpty: () => void
  onCtrlC?: () => void
  disabled: boolean
  skillNames?: string[]
  onHistoryUp?: () => void
  onHistoryDown?: () => void
}

export function PromptInput({
  mode,
  value,
  onChange,
  onSubmit,
  onTabEmpty,
  onCtrlC,
  disabled,
  skillNames,
  onHistoryUp,
  onHistoryDown,
}: Props) {
  const color = MODE_COLOR[mode]!

  const [suggestionIdx, setSuggestionIdx] = useState(0)

  const suggestions = useMemo(
    () => getCommandSuggestions(value, skillNames),
    [value, skillNames],
  )

  // Suggestions auto-show whenever there are matches while typing a command prefix
  const showSuggestions = suggestions.length > 0

  // Clamp + reset index whenever the list length changes
  useEffect(() => {
    setSuggestionIdx(prev => Math.min(prev, Math.max(0, suggestions.length - 1)))
  }, [suggestions.length])

  const selectedSuggestion = showSuggestions ? suggestions[suggestionIdx] : undefined

  // Ghost text only when suggestions are NOT open (it would overlap)
  const ghost = useMemo(
    () => showSuggestions ? '' : getInlineGhost(value, suggestions),
    [value, suggestions, showSuggestions],
  )

  const argHint = useMemo(() => getArgumentHint(value), [value])

  // Accept the currently highlighted suggestion
  const acceptSuggestion = useCallback(() => {
    if (selectedSuggestion) {
      onChange(selectedSuggestion.value + ' ')
    }
  }, [selectedSuggestion, onChange])

  const handleTabPress = useCallback(() => {
    // Completion only applies while typing a /command prefix
    if (value.startsWith('/') && showSuggestions) {
      acceptSuggestion()
      return
    }
    // Any other context: Tab cycles mode
    onTabEmpty()
  }, [value, showSuggestions, acceptSuggestion, onTabEmpty])

  const handleSubmit = useCallback((v: string) => {
    // If a partial /command prefix is typed with suggestions showing, complete instead of submit
    if (showSuggestions && selectedSuggestion && !v.includes(' ') && v !== selectedSuggestion.value) {
      onChange(selectedSuggestion.value + ' ')
      return
    }
    onSubmit(v)
  }, [showSuggestions, selectedSuggestion, onChange, onSubmit])

  // ↑ / ↓: navigate suggestion list when open, else history
  const handleUp = useCallback(() => {
    if (showSuggestions) {
      setSuggestionIdx(i => (i - 1 + suggestions.length) % suggestions.length)
    } else {
      onHistoryUp?.()
    }
  }, [showSuggestions, suggestions.length, onHistoryUp])

  const handleDown = useCallback(() => {
    if (showSuggestions) {
      setSuggestionIdx(i => (i + 1) % suggestions.length)
    } else {
      onHistoryDown?.()
    }
  }, [showSuggestions, suggestions.length, onHistoryDown])

  // Ctrl+C must still fire while busy (disabled) so the user can abort a running turn
  useInput((input, key) => {
    if (key.ctrl && input === 'c') onCtrlC?.()
  }, { isActive: disabled })

  const { renderedValue } = useTextInput({
    value,
    onChange,
    onSubmit: handleSubmit,
    onHistoryUp: handleUp,
    onHistoryDown: handleDown,
    onTabPress: handleTabPress,
    onCtrlC,
    focus: !disabled,
    inlineGhostText: ghost,
  })

  return (
    <Box flexDirection="column">
      {/* Suggestions popup — rendered above input */}
      {showSuggestions && (
        <Suggestions
          items={suggestions}
          selectedIndex={suggestionIdx}
        />
      )}

      {/* Input row */}
      <Box
        borderStyle="single"
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
        flexDirection="row"
        gap={1}
      >
        <Text color={color}>{'>'}</Text>

        {disabled
          ? <Text dimColor italic>working...  <Text color="gray">(Ctrl+C to abort)</Text></Text>
          : (
            <Box flexDirection="row">
              <Text>{renderedValue}</Text>
              {argHint !== undefined && (
                <Text dimColor> {argHint}</Text>
              )}
            </Box>
          )
        }
      </Box>
    </Box>
  )
}
