import chalk from 'chalk'

/**
 * Render Markdown to ANSI-styled terminal string.
 * Handles common LLM output patterns: headings, bold/italic, inline code,
 * fenced code blocks, lists, blockquotes, links, HR.
 */
export function renderMarkdown(input: string): string {
  const lines = input.split('\n')
  const out: string[] = []

  let inCodeBlock = false
  let codeLang = ''
  let codeLines: string[] = []

  for (const line of lines) {
    // ── Fenced code block ─────────────────────────────────────────────────
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        out.push(renderCodeBlock(codeLines, codeLang))
        codeLines = []
        codeLang = ''
        inCodeBlock = false
      } else {
        inCodeBlock = true
        codeLang = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // ── Headings ──────────────────────────────────────────────────────────
    const h1 = line.match(/^# (.+)/)
    if (h1) { out.push('\n' + chalk.bold.underline(h1[1]!) + '\n'); continue }

    const h2 = line.match(/^## (.+)/)
    if (h2) { out.push('\n' + chalk.bold(h2[1]!) + '\n'); continue }

    const h3 = line.match(/^### (.+)/)
    if (h3) { out.push(chalk.bold(h3[1]!)); continue }

    const h4 = line.match(/^#{4,} (.+)/)
    if (h4) { out.push(chalk.underline(h4[1]!)); continue }

    // ── Horizontal rule ───────────────────────────────────────────────────
    if (/^[-*_]{3,}\s*$/.test(line)) {
      out.push(chalk.dim('─'.repeat(60)))
      continue
    }

    // ── Blockquote ────────────────────────────────────────────────────────
    if (line.startsWith('> ')) {
      out.push(chalk.dim('│') + ' ' + chalk.dim(renderInline(line.slice(2))))
      continue
    }
    if (line === '>') {
      out.push(chalk.dim('│'))
      continue
    }

    // ── Unordered list ────────────────────────────────────────────────────
    const ul = line.match(/^(\s*)[*\-+] (.*)/)
    if (ul) {
      const pad = ul[1]!
      out.push(`${pad}${chalk.dim('•')} ${renderInline(ul[2]!)}`)
      continue
    }

    // ── Ordered list ──────────────────────────────────────────────────────
    const ol = line.match(/^(\s*)(\d+)\. (.*)/)
    if (ol) {
      const pad = ol[1]!
      out.push(`${pad}${chalk.bold(ol[2]! + '.')} ${renderInline(ol[3]!)}`)
      continue
    }

    // ── Normal line ───────────────────────────────────────────────────────
    out.push(renderInline(line))
  }

  // Unclosed code block — render what we have
  if (inCodeBlock && codeLines.length > 0) {
    out.push(renderCodeBlock(codeLines, codeLang))
  }

  return out.join('\n')
}

function renderCodeBlock(lines: string[], lang: string): string {
  const header = lang ? chalk.dim('  ' + lang) : ''
  const body = lines.map(l => '  ' + chalk.green(l)).join('\n')
  return (header ? header + '\n' : '') + body
}

function renderInline(text: string): string {
  return text
    // Inline code — process first so inner content is not further styled
    .replace(/`([^`]+)`/g, (_, c: string) => chalk.cyan(c))
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, (_, t: string) => chalk.bold.italic(t))
    // Bold
    .replace(/\*\*(.+?)\*\*/g, (_, t: string) => chalk.bold(t))
    // Italic (* or _)
    .replace(/\*([^*\n]+)\*/g, (_, t: string) => chalk.italic(t))
    .replace(/_([^_\n]+)_/g, (_, t: string) => chalk.italic(t))
    // Strikethrough
    .replace(/~~(.+?)~~/g, (_, t: string) => chalk.strikethrough(t))
    // Links — show label in cyan, URL dim
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) =>
      chalk.cyan(label) + chalk.dim(` (${url})`)
    )
}
