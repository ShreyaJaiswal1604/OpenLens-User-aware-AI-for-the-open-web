# OpenLens — Getting Data Closer to You

> **See what your AI sees. The first browser extension that reveals what AI models infer about you.**

[![Mozilla x Hack-Nation](https://img.shields.io/badge/Mozilla%20x%20Hack--Nation-Global%20AI%20Hackathon%202026-orange)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)]()
[![Open Source AI](https://img.shields.io/badge/AI-Local%20First-blue)]()

---

## The Problem

Every browser AI builds a profile of you — your budget, your schedule, your habits, your relationships. It infers things you never explicitly shared. And today, **you can't see any of it.**

Websites tracking you? There are tools for that. But your **own AI** tracking you? Nobody's watching. Until now.

## The Solution

OpenLens is a Chrome/Firefox browser extension that monitors AI activity in real-time, requires explicit user consent for every action, and reveals your **Shadow Profile** — the hidden data your AI has inferred about you.

**Local-first. Open source. Your data, visible.**

---

## Architecture — Four Layers

```
+---------------------------------------------------------------+
|  LAYER 4: SHADOW PROFILE  — "Know Your Shadow"                |
|  What has your AI inferred about you? See it. Control it.      |
|----------------------------------------------------------------|
|  LAYER 3: TRANSPARENT AGENT  — "See It Work"                  |
|  MCP-style tool calling with step-by-step transparency.        |
|----------------------------------------------------------------|
|  LAYER 2: INSIGHTS BAR  — "Know Your Context"                 |
|  Seven real-time modules monitoring AI activity on every page.  |
|  [Permissions] [Data Flow] [Cross-Origin] [Context] [Privacy]  |
|  [Audit Trail] [MCP Tools]                                     |
|----------------------------------------------------------------|
|  LAYER 1: INFORMED SETUP — "Know Your Machine"                 |
|  Hardware profiling. Local model selection. Privacy-first.      |
+---------------------------------------------------------------+
```

---

## Features

### Layer 1: Know Your Machine
- **Hardware scan** — CPU, RAM, GPU, VRAM, storage via browser APIs (WebGPU, `navigator.hardwareConcurrency`)
- **Ollama detection** — checks `localhost:11434`, lists installed models
- **Model recommendation** — suggests models by VRAM fit with compatibility badges
- **Multi-provider support** — Ollama (local), OpenAI, Anthropic, OpenRouter (cloud)
- **Dynamic host permissions** — no hardcoded URLs, asks the user at runtime

### Layer 2: Insights Bar (Always Visible)
Seven real-time pills injected on every page via Shadow DOM:

| Pill | What it shows |
|------|--------------|
| **Permissions** | Access state — locked, asking, or granted |
| **Data Flow** | Total tokens entering AI context |
| **Cross-Origin** | Warning when data from different sites merges |
| **Context Monitor** | Context window capacity (green/yellow/red) |
| **Privacy Router** | Local vs cloud processing indicator |
| **Audit Trail** | Event count with full session log |
| **MCP Tools** | Connected tool count + active call status |

Click any pill to expand its detail panel.

### Layer 3: Transparent Agent
- **MCP-style tool calling** — LLM dynamically decides which tools to call
- **6 built-in page tools** — read_page, extract_data, find_on_page, navigate, fill_form, click_element
- **MCP server support** — connect external tool servers via JSON-RPC (Model Context Protocol)
- **Step-by-step visibility** — every tool call shown with name, arguments, and results
- **Permission-gated** — page reads auto-granted for local; cloud sends and write actions require explicit consent
- **Markdown-rendered answers** — formatted final responses from the LLM

### Layer 4: Shadow Profile
- **Inference engine** — LLM analyzes session activity to reveal what it inferred about you
- **8 categories** — financial, schedule, preferences, relationships, habits, work, location, health
- **Confidence levels** — high/medium/low with exact derivation sources
- **User controls** — clear profile, export as JSON
- **Privacy banner** — confirms whether processing was local or cloud

### Permission System
| Type | Description | Auto-grant |
|------|------------|------------|
| `page_read` | Read page content | Yes (local providers) |
| `page_action` | Click, fill, navigate | No |
| `data_send` | Send data to cloud | No |

Scopes: **this page** (revoked on navigation), **this site**, **this session** (30 min)

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Ollama](https://ollama.ai/) (for local AI inference)

### Install & Build

```bash
git clone https://github.com/YOUR_USERNAME/OpenLens.git
cd OpenLens
npm install
npm run build              # Chrome MV3
npm run build:firefox      # Firefox MV2
```

### Load the Extension

**Chrome:**
1. Go to `chrome://extensions/` → Enable Developer Mode
2. Click "Load unpacked" → Select `.output/chrome-mv3/`

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on" → Select any file in `.output/firefox-mv2/`

### Set Up Ollama
```bash
# Install Ollama from https://ollama.ai
ollama pull gemma3:1b      # Small, fast model (recommended for demo)
ollama pull llama3.1:8b    # Larger, more capable (needs 6GB+ VRAM)
```

---

## MCP Server Support

OpenLens can connect to any MCP-compatible tool server. Example with the included weather server:

```bash
# Python FastMCP server
cd MCP
pip install fastmcp uvicorn starlette
python weather_server.py   # Runs on localhost:3001
```

```bash
# Node.js server
node mcp-servers/weather-server.js  # Runs on localhost:3001
```

Then in the OpenLens popup → MCP tab → enter `http://localhost:3001/mcp` → Connect.

---

## Project Structure

```
OpenLens/
├── src/
│   ├── entrypoints/
│   │   ├── background.ts              # Service worker — message routing, tool loop, LLM calls
│   │   ├── content.ts                 # Content script — Insights Bar (Shadow DOM)
│   │   ├── popup/                     # Popup UI — setup wizard, dashboard, shadow profile, MCP config
│   │   │   ├── App.tsx
│   │   │   ├── SetupWizard.tsx
│   │   │   └── ShadowProfileView.tsx
│   │   └── sidepanel/                 # Side panel — transparent agent task execution
│   │       └── App.tsx
│   ├── agent/
│   │   ├── page-tools.ts             # 6 built-in page tool definitions
│   │   ├── tool-schemas.ts           # Ollama-compatible tool JSON schemas
│   │   └── task-engine.ts            # Task decomposition engine
│   ├── components/
│   │   └── ToolConfigPanel.tsx        # MCP server management UI
│   ├── hardware/
│   │   ├── hardware-scanner.ts        # Browser API hardware detection
│   │   ├── model-catalog.ts          # Known model database with sizes/licenses
│   │   └── model-recommender.ts      # VRAM-fit recommendation logic
│   ├── lib/
│   │   ├── permissions.ts            # Permission manager (grant/check/revoke)
│   │   ├── host-permissions.ts       # Dynamic browser host permission requests
│   │   ├── page-context.ts           # Page content extraction + summarization
│   │   ├── custom-tools.ts           # MCP server CRUD + JSON-RPC client
│   │   ├── sensitivity.ts            # Data sensitivity classifier
│   │   ├── tokenizer.ts              # Token estimation (text.length / 4)
│   │   ├── ollama.ts                 # Ollama REST API client
│   │   ├── llm-provider.ts           # Multi-provider LLM abstraction
│   │   └── storage.ts                # chrome.storage.local helpers
│   ├── modules/
│   │   ├── types.ts                  # Shared interfaces (InsightModule, EventType, etc.)
│   │   └── event-bus.ts              # Central event system
│   ├── shadow/
│   │   └── shadow-engine.ts          # Shadow Profile inference generation
│   └── styles/
│       └── global.css                # Tailwind base styles
├── public/
│   └── logo.webp                     # OpenLens logo
├── MCP/
│   └── weather_server.py             # Example FastMCP server (Python)
├── mcp-servers/
│   └── weather-server.js             # Example MCP server (Node.js)
├── asset/
│   └── OpenLens.webp                 # Logo asset
├── wxt.config.ts                     # WXT extension configuration
├── package.json
├── tsconfig.json
├── CLAUDE.md                         # AI assistant instructions
└── DEMO_SCRIPT.md                    # 60-second demo video script
```

---

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Extension framework | [WXT](https://wxt.dev) | Vite-based, hot reload, MV3/MV2 support |
| UI | React 18 + TypeScript | Component-based, type-safe |
| Styling | Tailwind CSS v4 | Utility-first, fast iteration |
| Local LLM | Ollama REST API | Standard for local inference |
| Storage | `chrome.storage.local` | Extension-native, persists across sessions |
| Bar isolation | Shadow DOM | Site CSS cannot interfere |
| MCP | JSON-RPC over HTTP | Model Context Protocol for tool servers |

---

## Build Commands

```bash
npm install              # Install dependencies
npm run dev              # Dev server with hot reload (Chrome)
npm run dev:firefox      # Dev server (Firefox)
npm run build            # Production build → .output/chrome-mv3/
npm run build:firefox    # Production build → .output/firefox-mv2/
npm run zip              # Package for distribution
```

---

## How It Works

1. **Setup** — OpenLens scans your hardware, detects Ollama, and recommends a model that fits your VRAM
2. **Browse** — The Insights Bar appears on every page, monitoring AI activity in real-time
3. **Ask** — Open the side panel, type a question, and watch the LLM call tools step-by-step
4. **Consent** — Every data access goes through the permission system. Local reads are auto-granted; cloud sends require approval
5. **Reveal** — After each task, the Shadow Profile shows what the AI inferred about you — categorized, sourced, and deletable

---

## Hackathon Criteria Alignment

| Criterion | How OpenLens Delivers |
|-----------|----------------------|
| **Execution Boundaries** | Every tool call visible. Permission-gated. Pause/skip/stop at any point. |
| **Browser Context** | Real page content extraction, cross-tab data awareness, MCP integration. |
| **Permission Design** | Per-action consent with scopes. Auto-grant for local (no cloud risk). Cross-origin awareness. |
| **Legibility & Control** | 7 real-time insight modules. Shadow Profile reveals hidden inferences. Full audit trail. |
| **Judgment & Restraint** | Local-first by default. Cloud only with explicit consent. Write actions require approval. |

---

## License

MIT

---

Built for the [Mozilla x Hack-Nation Global AI Hackathon 2026](https://hacknation.io).
