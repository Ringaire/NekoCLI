import { useState, useCallback, useEffect, useRef } from 'react'
import chalk from 'chalk'
import type { Key } from 'ink'
import { useInput } from 'ink'

export interface TextInputState {
  cursorOffset: number
  renderedValue: string
  cursorLine: number
  cursorColumn: number
}

interface Options {
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  onHistoryUp?: (() => void) | undefined
  onHistoryDown?: (() => void) | undefined
  onTabPress?: (() => void) | undefined
  onCtrlC?: (() => void) | undefined
  focus?: boolean | undefined
  /** Inline ghost text shown at cursor (dimmed). Right-arrow accepts first char. */
  inlineGhostText?: string | undefined
  /** Width of the terminal for viewport calculation */
  columns?: number | undefined
}

export function useTextInput({
  value,
  onChange,
  onSubmit,
  onHistoryUp,
  onHistoryDown,
  onTabPress,
  onCtrlC,
  focus = true,
  inlineGhostText = '',
  columns = 80,
}: Options): TextInputState {
  const [cursorOffset, setCursorOffset] = useState(value.length)

  // Track whether cursor was set internally (typing) vs externally (history/reset)
  const internalRef = useRef(false)

  // Sync cursor to end on external value changes (history nav, clear, etc.)
  useEffect(() => {
    if (internalRef.current) {
      internalRef.current = false
      return
    }
    setCursorOffset(value.length)
  }, [value])

  const insert = useCallback((chars: string, offset: number, current: string) => {
    const next = current.slice(0, offset) + chars + current.slice(offset)
    internalRef.current = true
    onChange(next)
    return offset + chars.length
  }, [onChange])

  const deleteBack = useCallback((offset: number, current: string) => {
    if (offset === 0) return offset
    const next = current.slice(0, offset - 1) + current.slice(offset)
    internalRef.current = true
    onChange(next)
    return offset - 1
  }, [onChange])

  const killWord = useCallback((offset: number, current: string) => {
    let i = offset - 1
    while (i > 0 && current[i] === ' ') i--
    while (i > 0 && current[i - 1] !== ' ') i--
    const next = current.slice(0, i) + current.slice(offset)
    internalRef.current = true
    onChange(next)
    return i
  }, [onChange])

  const handler = useCallback((input: string, key: Key) => {
    if (key.return) {
      if (value.trim()) onSubmit(value)
      return
    }

    if (key.upArrow) {
      onHistoryUp?.()
      return
    }

    if (key.downArrow) {
      onHistoryDown?.()
      return
    }

    if (key.tab) {
      onTabPress?.()
      return
    }

    if (key.leftArrow) {
      setCursorOffset(o => Math.max(0, o - 1))
      return
    }

    if (key.rightArrow) {
      if (cursorOffset < value.length) {
        setCursorOffset(o => o + 1)
      } else if (inlineGhostText.length > 0) {
        // Accept first ghost character on right arrow
        const accepted = value + inlineGhostText[0]!
        internalRef.current = true
        onChange(accepted)
        setCursorOffset(cursorOffset + 1)
      }
      return
    }

    if (key.backspace || key.delete) {
      const next = deleteBack(cursorOffset, value)
      setCursorOffset(next)
      return
    }

    if (key.ctrl) {
      switch (input) {
        case 'a': setCursorOffset(0); return
        case 'e': setCursorOffset(value.length); return
        case 'u': {
          internalRef.current = true
          onChange(value.slice(cursorOffset))
          setCursorOffset(0)
          return
        }
        case 'k': {
          internalRef.current = true
          onChange(value.slice(0, cursorOffset))
          return
        }
        case 'w': {
          const next = killWord(cursorOffset, value)
          setCursorOffset(next)
          return
        }
        case 'c': {
          if (value.length > 0) {
            internalRef.current = true
            onChange('')
            setCursorOffset(0)
          } else {
            onCtrlC?.()
          }
          return
        }
      }
      return
    }

    if (key.escape) {
      internalRef.current = true
      onChange('')
      setCursorOffset(0)
      return
    }

    if (input && !key.meta) {
      const next = insert(input, cursorOffset, value)
      setCursorOffset(next)
    }
  }, [value, cursorOffset, onChange, onSubmit, onHistoryUp, onHistoryDown, onTabPress, onCtrlC, inlineGhostText, insert, deleteBack, killWord])

  useInput(handler, { isActive: focus })

  // Render: text with chalk cursor + inline ghost text
  const renderedValue = renderWithCursor(value, cursorOffset, inlineGhostText)

  // Calculate cursor line/column for terminal cursor parking
  const linesBefore = renderedValue.slice(0, cursorOffset).split('\n')
  const cursorLine = (linesBefore.length ?? 1) - 1
  const cursorColumn = (linesBefore[linesBefore.length - 1] ?? '').length

  return { cursorOffset, renderedValue, cursorLine, cursorColumn }
}

function renderWithCursor(value: string, offset: number, ghost: string): string {
  if (offset < value.length) {
    // Cursor in the middle
    return (
      value.slice(0, offset) +
      chalk.inverse(value[offset]!) +
      value.slice(offset + 1)
    )
  }
  // Cursor at end
  if (ghost.length > 0) {
    return value + chalk.inverse(ghost[0]!) + chalk.dim(ghost.slice(1))
  }
  return value + chalk.inverse(' ')
}
