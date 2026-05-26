import type { NekoRuntime } from '@nekocode/core'
import type { Session } from '@nekocode/core'
import { renderStatus } from './status.js'
import { pluginInstall, pluginList, pluginRemove } from './plugin.js'

export interface CommandContext {
  runtime: NekoRuntime
  session: Session
  model: string
  print: (text: string) => void
  /** Clear conversation history */
  clearSession: () => void
  /** Exit the CLI */
  exit: () => void
}

export type CommandResult =
  | { handled: true; output?: string }
  | { handled: false }

export async function handleCommand(
  name: string,
  args: string,
  ctx: CommandContext,
): Promise<CommandResult> {
  switch (name) {
    // ── Session ──────────────────────────────────────────────────────────────
    case 'status': {
      return { handled: true, output: renderStatus(ctx.runtime, ctx.session, ctx.model) }
    }

    case 'clear': {
      ctx.clearSession()
      return { handled: true, output: 'Conversation cleared.' }
    }

    case 'exit':
    case 'quit':
    case 'q': {
      ctx.exit()
      return { handled: true }
    }

    // ── Skills ───────────────────────────────────────────────────────────────
    case 'skills': {
      const listing = ctx.runtime.skills?.buildListing()
      return { handled: true, output: listing || 'No skills loaded.' }
    }

    // ── Plugins ──────────────────────────────────────────────────────────────
    case 'plugin': {
      const [subCmd, ...rest] = args.split(/\s+/)
      const pkg = rest.join(' ').trim()

      if (subCmd === 'install' && pkg) {
        const msg = await pluginInstall(pkg)
        return { handled: true, output: msg }
      }
      if (subCmd === 'list' || subCmd === 'ls' || !subCmd) {
        const msg = await pluginList()
        return { handled: true, output: msg }
      }
      if (subCmd === 'remove' && pkg) {
        const msg = await pluginRemove(pkg)
        return { handled: true, output: msg }
      }
      return {
        handled: true,
        output: 'Usage: /plugin install <pkg> | /plugin list | /plugin remove <pkg>',
      }
    }

    // ── Help ─────────────────────────────────────────────────────────────────
    case 'help': {
      const lines = [
        '─'.repeat(40),
        ' NekoCode — Commands',
        '─'.repeat(40),
        ' /status              Session info & token usage',
        ' /skills              List loaded skills',
        ' /plugin install <p>  Install plugin from npm',
        ' /plugin list         List installed plugins',
        ' /plugin remove <p>   Remove a plugin',
        ' /clear               Clear conversation history',
        ' /exit                Exit NekoCode',
        '─'.repeat(40),
        ' @ Mentions',
        ' @path/to/file.ts     Attach file content',
        ' @src/                Attach directory tree',
        '─'.repeat(40),
      ]
      return { handled: true, output: lines.join('\n') }
    }

    // ── Skill invocation ─────────────────────────────────────────────────────
    default: {
      // Check if it's a skill name
      const skill = ctx.runtime.skills?.get(name)
      if (skill) {
        return {
          handled: true,
          output: `[skill: ${skill.name}]\n${skill.prompt}`,
        }
      }
      return { handled: false }
    }
  }
}
