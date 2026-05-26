# NekoCode

AI coding assistant with multi-provider support, running in your terminal.

## Features

- **Multi-provider support** — Anthropic, OpenAI, Gemini, DeepSeek, Groq, SiliconFlow, and 20+ OpenAI-compatible providers
- **15 built-in tools** — bash, file operations, search, web fetch/search, LSP, todo, token counting, session management
- **TUI interface** — React/ink based terminal UI with markdown rendering, streaming output, reasoning display
- **Orchestrator mode** — Multi-model sub-agent delegation with automatic model role selection
- **Extended thinking** — Reasoning/thinking support across providers (Anthropic, OpenAI o-series, DeepSeek)
- **Session management** — Persistent conversation history with JSONL storage
- **Permission system** — Configurable tool permissions with build/edit/ask modes
- **MCP support** — Model Context Protocol integration
- **Plugin system** — Extensible via npm packages

## Quick Start

```bash
# Install
pnpm install

# Build
pnpm build

# Run
pnpm dev
```

## Architecture

```
packages/
├── cli/          — Command-line interface & TUI
├── core/         — Runtime, events, sessions, permissions, config
├── providers/    — LLM provider adapters (Anthropic, OpenAI, Gemini, etc.)
├── tools/        — 15 built-in tools
├── mcp/          — MCP protocol bridge
├── skills/       — Skill registry
├── server/       — HTTP API server
└── vscode/       — VSCode extension
```

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/model` | Switch model |
| `/sessions` | List/load sessions |
| `/new` | New session |
| `/compact` | Summarize history to save tokens |
| `/think` | Toggle extended thinking |
| `/review` | Code review (git diff) |
| `/connect` | Configure provider |

## License

AGPL-3.0 — See [LICENSE](LICENSE) for details.
