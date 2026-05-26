import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'

const EARS  = '  /\\  /\\'
const OPEN  = ' ( o  o )'
const BLINK = ' ( -  - )'
const WINK  = ' ( o  ^ )'
const NOSE  = '  \\ ^^ /'

// frame = [ears, eyes, nose]
const SEQ: readonly [string, string, string][] = [
  [EARS, OPEN,  NOSE],
  [EARS, OPEN,  NOSE],
  [EARS, OPEN,  NOSE],
  [EARS, BLINK, NOSE],
  [EARS, OPEN,  NOSE],
  [EARS, OPEN,  NOSE],
  [EARS, OPEN,  NOSE],
  [EARS, OPEN,  NOSE],
  [EARS, WINK,  NOSE],
  [EARS, OPEN,  NOSE],
  [EARS, OPEN,  NOSE],
  [EARS, BLINK, NOSE],
  [EARS, OPEN,  NOSE],
  [EARS, OPEN,  NOSE],
]

export function AsciiPet() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % SEQ.length), 450)
    return () => clearInterval(id)
  }, [])

  const frame = SEQ[tick] ?? SEQ[0]!

  return (
    <Box flexDirection="column">
      {frame.map((line, i) => (
        <Text key={i} color="cyan">{line}</Text>
      ))}
    </Box>
  )
}
