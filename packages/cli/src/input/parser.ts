// Parse raw user input into structured form before sending to model

export type ParsedInput =
  | { kind: 'command'; name: string; args: string }
  | { kind: 'message'; text: string; mentions: Mention[] }

export interface Mention {
  raw: string        // e.g. "@src/tools.ts"
  path: string       // resolved path
  type: 'file' | 'dir'
  /** Position in original text */
  start: number
  end: number
}

const COMMAND_RE = /^\/(\S+)\s*(.*)/s
const MENTION_RE = /@([\w./\\-]+)/g

export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim()

  // Slash command
  const cmdMatch = COMMAND_RE.exec(trimmed)
  if (cmdMatch) {
    return { kind: 'command', name: cmdMatch[1]!.toLowerCase(), args: cmdMatch[2]!.trim() }
  }

  // Regular message — extract @ mentions
  const mentions: Mention[] = []
  let m: RegExpExecArray | null
  MENTION_RE.lastIndex = 0
  while ((m = MENTION_RE.exec(trimmed)) !== null) {
    const rawMention = m[0]!
    const mentionPath = m[1]!
    const isDir = mentionPath.endsWith('/') || !mentionPath.includes('.')
    mentions.push({
      raw: rawMention,
      path: mentionPath,
      type: isDir ? 'dir' : 'file',
      start: m.index,
      end: m.index + rawMention.length,
    })
  }

  return { kind: 'message', text: trimmed, mentions }
}
