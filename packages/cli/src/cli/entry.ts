import React from 'react'
import { render } from 'ink'
import { parseCliArgs } from './args.js'
import { NekoRuntime, initDirs, loadConfig, createSession, loadSession, listSessions, makeMessage, appendMessage } from '@nekocode/core'
import { DefaultPermissionEngine } from '@nekocode/core/permissions'
import { ProviderRegistry } from '@nekocode/providers'
import { ALL_TOOLS } from '@nekocode/tools'
import { App } from '../tui/App.js'

const SYSTEM_PROMPT = `You are NekoCode, an expert AI coding assistant. You have access to tools for reading and editing files, running shell commands, searching the web, and more. Always be direct and helpful. When using tools, prefer reading before editing.`

export async function main(): Promise<void> {
  const args = parseCliArgs()
  if (!args) return

  await initDirs()

  const config = await loadConfig(args.cwd)

  // Apply proxy — all major AI SDKs honour these env vars
  if (config.proxy) {
    process.env['HTTPS_PROXY'] = config.proxy
    process.env['HTTP_PROXY']  = config.proxy
    process.env['ALL_PROXY']   = config.proxy
  }

  const permissions = new DefaultPermissionEngine()
  permissions.setMode(args.mode)

  const runtime = new NekoRuntime()
  await runtime.applyConfig({ mcpServers: config.mcpServers })

  for (const tool of ALL_TOOLS) {
    runtime.tools.register(tool as never)
  }

  const providerRegistry = new ProviderRegistry()
  const resolved = await providerRegistry.fromConfig(config)
  const provider = resolved.provider
  const model = args.model ?? resolved.model

  let session = await createSession(args.cwd, model)

  // Resume existing session if --session was provided
  if (args.session) {
    const all = await listSessions()
    const match = all.find(m => m.id.startsWith(args.session!))
    if (!match) {
      console.error(`No session found matching: ${args.session}`)
      process.exit(1)
    }
    const loaded = await loadSession(match.id)
    if (!loaded) {
      console.error(`Failed to load session: ${match.id.slice(0, 8)}`)
      process.exit(1)
    }
    session = loaded
  }

  // One-shot (non-interactive)
  if (args.prompt) {
    const { runAgentTurn } = await import('../agent/turn.js')
    const userMsg = makeMessage('user', args.prompt)
    session.messages.push(userMsg)
    await appendMessage(session.meta.id, userMsg)

    process.stdout.write('\n')
    runtime.bus.on('agent:text', ({ delta }) => { process.stdout.write(delta) })
    runtime.bus.on('agent:tool_call', ({ toolName }) => { process.stdout.write(`\n[tool] ${toolName}\n`) })
    runtime.bus.on('tool:end', ({ toolName, result, durationMs }) => {
      process.stdout.write(`  ${result.ok ? '[ok]' : '[err]'} ${toolName} (${durationMs}ms)\n`)
    })

    await runAgentTurn({ provider, session, tools: runtime.tools, bus: runtime.bus, permissions, systemPrompt: SYSTEM_PROMPT })
    process.stdout.write('\n')
    await runtime.dispose()
    return
  }

  // Interactive TUI
  const { waitUntilExit } = render(
    React.createElement(App, {
      runtime,
      session,
      permissions,
      model,
      provider,
      systemPrompt: SYSTEM_PROMPT,
      config,
      providerRegistry,
    }),
    { exitOnCtrlC: false },
  )

  await waitUntilExit()
  await runtime.dispose()

  // Print resume info if the session had any messages
  if (session.messages.length > 0) {
    const firstUserText = session.messages
      .find(m => m.role === 'user')
      ?.content.find(b => b.type === 'text')?.text
    const title = session.meta.title ?? firstUserText?.slice(0, 60) ?? '(no title)'
    const shortId = session.meta.id.slice(0, 8)
    process.stderr.write('\n')
    process.stderr.write(`  Session   ${title}\n`)
    process.stderr.write(`  Resume    nekocode --session ${shortId}\n`)
    process.stderr.write('\n')
  }
}
