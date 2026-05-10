# ◆ Prismovit AI

> **The Ultimate Multi-Provider AI Coding Agent CLI**

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android%20(Termux)-lightgrey?style=flat-square" alt="Cross Platform">
  <img src="https://img.shields.io/badge/MCP-Protocol%20Supported-9333ea?style=flat-square" alt="MCP">
</p>

---

## What is Prismovit AI?

**Prismovit AI** is a powerful, open-source AI coding agent that runs directly in your terminal. It combines the best ideas from **OpenCode**, **Pi**, and **OpenClaude** into one unified, beautiful CLI tool.

Think of it as a **prism** — one input, infinite possibilities. Connect to any LLM provider, use MCP tools, and code with AI assistance right from your terminal or browser.

### Key Highlights

- 🧠 **30+ LLM Providers** — OpenAI, Anthropic, Gemini, Ollama, DeepSeek, Groq, OpenRouter, and custom endpoints
- 🖥️ **Beautiful TUI** — Interactive terminal interface built with React + Ink
- 🌐 **Web Interface** — Browser-based chat at localhost:3141
- 🔌 **MCP Protocol** — Full Model Context Protocol support for external tool servers
- 🛠️ **7 Built-in Tools** — File read/write/edit, shell, glob, grep, directory listing
- 💬 **14 Slash Commands** — /model, /provider, /sessions, /export, /mcp, /theme, and more
- 🎨 **5 Themes** — Dark, Light, Midnight, Nord, Tokyo Night
- 📱 **Cross-Platform** — Windows, macOS, Linux, Android (Termux)
- 💾 **Session Management** — Save, resume, fork, and export conversations
- 🔑 **Provider-Agnostic** — No vendor lock-in, switch providers with one command

---

## Quick Start

### Install via npm

```bash
npm install -g prismovit-ai
```

### Install via GitHub

```bash
npm install -g prismovit/prismovit-ai
```

### Install from source

```bash
git clone https://github.com/prismovit/prismovit-ai.git
cd prismovit-ai
npm install
npm run build
npm link
```

### Verify installation

```bash
prism --version
```

---

## Usage

### Interactive TUI Mode

```bash
prism
```

Opens a full interactive chat interface in your terminal with:
- Real-time streaming responses
- Syntax-highlighted markdown
- Tool execution visualization
- Keyboard shortcuts (Ctrl+H for help)

### Quick Prompt (Non-Interactive)

```bash
prism "Write a Python function to parse JSON"
```

### Web Interface

```bash
prism --web
# Opens http://localhost:3141 in your browser
```

### Specify Provider and Model

```bash
prism --provider anthropic --model claude-sonnet-4-20250514
prism --provider ollama --model llama3
prism --provider openrouter --model anthropic/claude-sonnet-4
```

### Continue Previous Session

```bash
prism --continue      # Resume last session
prism --session <id>  # Resume specific session
```

---

## Configuration

### API Keys

Set API keys as environment variables:

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic (Claude)
export ANTHROPIC_API_KEY="sk-ant-..."

# Google Gemini
export GEMINI_API_KEY="..."

# DeepSeek
export DEEPSEEK_API_KEY="..."

# Groq
export GROQ_API_KEY="..."

# OpenRouter
export OPENROUTER_API_KEY="..."

# Ollama (local, no key needed)
# Make sure Ollama is running: ollama serve
```

### Config File

Configuration is stored at `~/.prism/config.json`:

```json
{
  "version": "1.0.0",
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "theme": "dark",
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@example/mcp-server"],
      "enabled": true
    }
  }
}
```

### Themes

| Theme | Description |
|-------|-------------|
| `dark` | Default dark theme (blue accents) |
| `light` | Clean light theme |
| `midnight` | Deep purple/blue |
| `nord` | Nord palette |
| `tokyo` | Tokyo Night inspired |

Set theme via environment variable:
```bash
export PRISM_THEME=tokyo
prism
```

---

## Supported Providers

| Provider | Models | API Key Env |
|----------|--------|-------------|
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo | `OPENAI_API_KEY` |
| **Anthropic** | Claude Sonnet 4, Claude Opus 4, Claude 3.5 Sonnet/Haiku | `ANTHROPIC_API_KEY` |
| **Google Gemini** | Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash | `GEMINI_API_KEY` |
| **Ollama** | LLaMA 3, CodeLLaMA, Mistral, Qwen, DeepSeek Coder | *(local, no key)* |
| **OpenRouter** | Claude, GPT-4o, Gemini, and 100+ more | `OPENROUTER_API_KEY` |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | `DEEPSEEK_API_KEY` |
| **Groq** | LLaMA 3.3 70B, Mixtral 8x7B | `GROQ_API_KEY` |
| **Custom** | Any OpenAI-compatible endpoint | `CUSTOM_API_KEY` |

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help panel |
| `/model <name>` | Switch AI model |
| `/provider` | List available providers |
| `/new` | Start new session |
| `/clear` | Clear messages |
| `/compact` | Compact context window |
| `/sessions` | List saved sessions |
| `/resume` | Resume a session |
| `/export` | Export session (Markdown/JSON/HTML) |
| `/mcp` | MCP server management |
| `/theme` | Change color theme |
| `/cost` | Token usage statistics |
| `/config` | Configuration info |
| `/web` | Start/stop web interface |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Escape` | Cancel / Close panel |
| `Ctrl+C` | Cancel generation / Quit |
| `Ctrl+N` | New session |
| `Ctrl+M` | Switch model |
| `Ctrl+H` | Toggle help panel |
| `Ctrl+L` | Clear screen |
| `Ctrl+W` | Toggle web interface |
| `Tab` | Autocomplete |

---

## MCP (Model Context Protocol)

Prismovit AI has full MCP support. Connect external tool servers:

```json
// ~/.prism/config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      "enabled": true
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_..." },
      "enabled": true
    }
  }
}
```

---

## Architecture

```
prismovit-ai/
├── bin/
│   └── prism.js              # CLI entry point
├── src/
│   ├── types/index.ts        # Shared type definitions
│   ├── config/index.ts       # Configuration manager (themes, providers, keys)
│   ├── providers/index.ts    # LLM provider abstraction (OpenAI, Anthropic, Gemini, Ollama...)
│   ├── tools/index.ts        # Built-in tools (read, write, edit, bash, glob, grep, ls)
│   ├── mcp/index.ts          # MCP client manager
│   ├── session/index.ts      # Session persistence (JSON-based)
│   ├── agent/index.ts        # Agent loop (tool calling, streaming, events)
│   ├── tui/App.tsx           # Terminal UI (React + Ink)
│   ├── web/index.ts          # Web interface (HTTP server + HTML)
│   ├── cli/index.ts          # CLI entry (Commander.js)
│   └── utils/platform.ts     # Platform detection (Windows/macOS/Linux/Termux)
├── package.json
├── tsconfig.json
├── LICENSE
└── README.md
```

---

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** | ✅ Full | Native support (Intel + Apple Silicon) |
| **Linux** | ✅ Full | All major distributions |
| **Windows** | ✅ Full | PowerShell + CMD + Git Bash |
| **Android** | ✅ Full | Via Termux (auto-detected) |

### Termux (Android)

```bash
pkg install nodejs-lts
npm install -g prismovit-ai
prism
```

---

## Tech Stack

- **Language:** TypeScript 5.9 (strict mode, ESM)
- **Runtime:** Node.js 18+
- **TUI Framework:** React 19 + Ink 5
- **HTTP:** Native fetch API (Node.js 18+)
- **MCP:** @modelcontextprotocol/sdk
- **LLM SDK:** OpenAI SDK + Anthropic SDK + custom providers
- **CLI:** Commander.js
- **Styling:** Chalk v5

---

## Inspiration

Prismovit AI is inspired by and combines the best features of:

- [OpenCode](https://github.com/anomalyco/opencode) — Architecture, OpenTUI design, MCP integration
- [Pi](https://github.com/earendil-works/pi) — Provider abstraction, lazy loading, session management
- [OpenClaude](https://github.com/Gitlawb/openclaude) — React/Ink TUI, tool system, slash commands

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built with ◆ by <strong>Prismovit Team</strong>
</p>
