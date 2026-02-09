# OpenLens

**User-aware AI for the open web.**

OpenLens is a browser extension that gives you real-time visibility into what AI agents learn about you while browsing. It reveals the invisible "shadow profile" that every browser AI builds — your budget, your schedule, your habits — and puts you in control.

Built for the [Mozilla x Hack-Nation Global AI Hackathon 2026](https://hacknation.io) — solving the **"Bring Your Own AI to Every Website"** challenge.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Firefox](https://img.shields.io/badge/Firefox-supported-FF7139.svg?logo=firefox-browser&logoColor=white)]()
[![Chrome](https://img.shields.io/badge/Chrome-supported-4285F4.svg?logo=google-chrome&logoColor=white)]()
[![AI Local First](https://img.shields.io/badge/AI-Local%20First-8B5CF6.svg)]()
[![Ollama](https://img.shields.io/badge/Ollama-supported-000000.svg?logo=ollama&logoColor=white)]()
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg?logo=typescript&logoColor=white)]()
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-06B6D4.svg?logo=tailwindcss&logoColor=white)]()
[![WXT](https://img.shields.io/badge/WXT-0.20-F59E0B.svg)]()
[![MCP](https://img.shields.io/badge/MCP-supported-10B981.svg)]()

---

## Table of Contents

- [The Problem](#the-problem)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [Permission Model](#permission-model)
- [MCP Server Support](#mcp-server-support)
- [Project Structure](#project-structure)
- [Hackathon Criteria Alignment](#hackathon-criteria-alignment)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## The Problem

Every browser AI — every sidebar, every assistant — is quietly building a profile of you. Your spending patterns, your schedule gaps, your preferences, your relationships. All inferred from your browsing. And right now, you have **zero visibility** into any of it.

There are tools to block website trackers. But nobody is watching the AI itself.

**OpenLens changes that.**
---

## Quick Demo

https://github.com/user-attachments/assets/cd13a19d-62b4-43e6-a94c-d639c9c9987b


*Click to watch the demo*

*You can also watch it on YouTube - [click here](https://youtu.be/cZkjrHSwVbU)*


---

## Tech Stack

![Open Source](https://img.shields.io/badge/100%25-Open%20Source-22C55E.svg)
![AI Local First](https://img.shields.io/badge/AI-Local%20First-8B5CF6.svg)
![No Proprietary Dependencies](https://img.shields.io/badge/Proprietary%20Deps-Zero-22C55E.svg)

All open source. AI local first. Cloud providers are optional — OpenLens works fully offline with Ollama. Your data never leaves your machine unless you explicitly allow it.

### Core Framework

| | Technology | Version | Role |
|---|---|---|---|
| ![WXT](https://img.shields.io/badge/WXT-F59E0B.svg?style=flat-square) | [WXT](https://wxt.dev/) | `0.20.14` | Browser extension framework (Vite-based, MV3 + MV2) |
| ![React](https://img.shields.io/badge/React-61DAFB.svg?style=flat-square&logo=react&logoColor=black) | [React](https://react.dev/) | `19.2.4` | UI components for popup and side panel |
| ![TypeScript](https://img.shields.io/badge/TS-3178C6.svg?style=flat-square&logo=typescript&logoColor=white) | [TypeScript](https://www.typescriptlang.org/) | `5.9.3` | Type-safe development |
| ![Tailwind](https://img.shields.io/badge/TW-06B6D4.svg?style=flat-square&logo=tailwindcss&logoColor=white) | [Tailwind CSS](https://tailwindcss.com/) | `4.1.18` | Utility-first styling |
| ![Vite](https://img.shields.io/badge/Vite-646CFF.svg?style=flat-square&logo=vite&logoColor=white) | [Vite](https://vite.dev/) | via WXT | Build tool and dev server |

### AI & LLM Integration

| | Technology | Role |
|---|---|---|
| ![Ollama](https://img.shields.io/badge/Ollama-000000.svg?style=flat-square&logo=ollama&logoColor=white) | [Ollama](https://ollama.com/) | Local LLM inference (REST API at `localhost:11434`) |
| ![MCP](https://img.shields.io/badge/MCP-10B981.svg?style=flat-square) | [MCP](https://modelcontextprotocol.io/) | Model Context Protocol — extensible tool servers via JSON-RPC 2.0 |
| ![Anthropic](https://img.shields.io/badge/Anthropic-D4A574.svg?style=flat-square) | [Anthropic SDK](https://docs.anthropic.com/) | Optional cloud provider SDK |

### Supported LLM Providers

| | Provider | Type | Notes |
|---|---|---|---|
| ![Local](https://img.shields.io/badge/LOCAL-22C55E.svg?style=flat-square) | **Ollama** (any model) | Local | Native tool calling, recommended default |
| ![Cloud](https://img.shields.io/badge/CLOUD-EF4444.svg?style=flat-square) | **OpenAI** | Optional | `/v1/chat/completions` |
| ![Cloud](https://img.shields.io/badge/CLOUD-EF4444.svg?style=flat-square) | **Anthropic** | Optional | `/v1/messages` |
| ![Cloud](https://img.shields.io/badge/CLOUD-EF4444.svg?style=flat-square) | **OpenRouter** | Optional | Multi-model gateway |

---


## Architecture

<img width="8192" height="3281" alt="Architecture-diagram" src="https://github.com/user-attachments/assets/f5038742-1608-4bfb-ac2a-6c0e09f884b1" />

```
┌───────────────────────────────────────────────────────────┐
│  LAYER 4: SHADOW PROFILE  — "Know Your Shadow"             │
│  What has your AI inferred about you? See it. Control it.  │
│────────────────────────────────────────────────────────────│
│  LAYER 3: TRANSPARENT AGENT  — "See It Work"              │
│  MCP-style tool calling with step-by-step transparency.    │
│────────────────────────────────────────────────────────────│
│  LAYER 2: INSIGHTS BAR  — "Know Your Context"             │
│  7 real-time modules monitoring AI activity on every page. │
│────────────────────────────────────────────────────────────│
│  LAYER 1: INFORMED SETUP — "Know Your Machine"             │
│  Hardware profiling. Local model selection. Privacy-first.  │
└───────────────────────────────────────────────────────────┘
```





---

## Features

### Layer 1: Informed Setup — Know Your Machine
- Hardware scan — CPU, RAM, GPU, VRAM via browser APIs (WebGPU, `navigator.hardwareConcurrency`)
- Ollama detection — checks `localhost:11434`, lists installed models
- Model recommendation — suggests models by VRAM fit with compatibility badges
- Multi-provider support — Ollama (local), OpenAI, Anthropic, OpenRouter (cloud)

### Layer 2: Insights Bar — Know Your Context
Seven real-time modules injected on every page via Shadow DOM:

| Module | What it shows |
|---|---|
| **Permissions** | Access state — locked, asking, or granted |
| **Data Flow** | Token count entering AI context |
| **Cross-Origin** | Warning when data from different sites merges |
| **Context Monitor** | Context window capacity (green/yellow/red) |
| **Privacy Router** | Local vs cloud processing |
| **Audit Trail** | Event count with full session log |
| **MCP Tools** | Connected tool servers and active calls |

### Layer 3: Transparent Agent — See It Work
- MCP-style tool calling — LLM dynamically decides which tools to call
- 6 built-in page tools: `read_page`, `extract_data`, `find_on_page`, `navigate`, `fill_form`, `click_element`
- MCP server support — connect external tool servers via JSON-RPC 2.0
- Step-by-step visibility — every tool call shown with name, arguments, and results
- Permission-gated — local reads auto-granted; cloud sends and write actions need explicit consent

### Layer 4: Shadow Profile — Know Your Shadow
- Inference engine — LLM analyzes session activity to reveal what it inferred about you
- 8 categories — financial, schedule, preferences, relationships, habits, work, location, health
- Confidence levels — high/medium/low with exact derivation sources
- User controls — inspect, export as JSON, or delete

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Ollama](https://ollama.com/) running locally with at least one model

```bash
# Install a small, fast model
ollama pull gemma3:1b
```

### Install & Build

```bash
git clone https://github.com/AgniveshChaubey/OpenLens.git
cd OpenLens
npm install
```

### Development

```bash
npm run dev              # Chrome with hot reload
npm run dev:firefox      # Firefox with hot reload
```

### Production Build

```bash
npm run build            # Chrome MV3 → .output/chrome-mv3/
npm run build:firefox    # Firefox MV2 → .output/firefox-mv2/
npm run zip              # Package for distribution
```

### Load the Extension

**Chrome:**
1. Go to `chrome://extensions/` → Enable Developer Mode
2. Click "Load unpacked" → select `.output/chrome-mv3/`

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on" → select any file in `.output/firefox-mv2/`

---

## Permission Model

| Type | Controls | Default |
|---|---|---|
| `page_read` | Read page content | Auto-granted for local (Ollama) |
| `data_send` | Send data to cloud | Always asks |
| `page_action` | Click, fill, navigate | Always asks |

| Scope | Duration |
|---|---|
| `page` | Revoked on navigation |
| `site` | Same origin, expires in 30 min |
| `session` | All sites, expires in 30 min |

**Lifecycle:** Tab closed = all permissions revoked. URL changed = page-scoped permissions revoked.

---

## MCP Server Support

OpenLens connects to any MCP-compatible tool server via JSON-RPC 2.0.

```bash
# Example: Python FastMCP server
cd MCP
pip install fastmcp uvicorn starlette
python weather_server.py   # Runs on localhost:3001
```

Then in OpenLens popup → MCP tab → enter `http://localhost:3001/mcp` → Connect.

---

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts              # Central orchestrator — message routing, LLM, permissions
│   ├── content.ts                 # Page injection — Insights Bar, tools, permission dialogs
│   ├── popup/                     # Setup wizard + Dashboard + Shadow Profile
│   │   ├── App.tsx
│   │   ├── SetupWizard.tsx
│   │   └── ShadowProfileView.tsx
│   └── sidepanel/                 # Transparent agent — task execution UI
│       └── App.tsx
├── agent/
│   ├── page-tools.ts              # 6 built-in tool definitions
│   └── tool-schemas.ts            # Ollama-compatible JSON schemas
├── shadow/
│   └── shadow-engine.ts           # Inference generation from audit trail
├── hardware/
│   ├── hardware-scanner.ts        # WebGPU + navigator API detection
│   └── model-recommender.ts       # VRAM fit calculation
├── lib/
│   ├── permissions.ts             # Permission manager (3 types x 3 scopes)
│   ├── page-context.ts            # Page content extraction + summarization
│   ├── custom-tools.ts            # MCP server CRUD + JSON-RPC client
│   ├── ollama.ts                  # Ollama REST API wrapper
│   ├── llm-provider.ts            # Multi-provider LLM abstraction
│   └── sensitivity.ts             # Data sensitivity classifier
├── modules/
│   ├── types.ts                   # Shared type definitions
│   └── event-bus.ts               # Session state pub/sub
├── components/
│   └── ToolConfigPanel.tsx        # MCP server management UI
└── styles/
    └── globals.css
```

---

## Hackathon Criteria Alignment

| Criterion | How OpenLens Delivers |
|---|---|
| **Execution Boundaries** | Every tool call visible. Permission-gated. Pause/skip/stop at any point. |
| **Browser Context** | Real page content extraction, cross-tab data awareness, MCP integration. |
| **Permission Design** | Per-action consent with scopes. Auto-grant for local. Cross-origin detection. |
| **Legibility & Control** | 7 real-time modules. Shadow Profile reveals hidden inferences. Full audit trail. |
| **Judgment & Restraint** | Local-first by default. Cloud only with explicit consent. Write actions require approval. |

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Please make sure to update tests as appropriate.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Acknowledgments

- [Mozilla](https://mozilla.org/) for the "Bring Your Own AI to Every Website" challenge
- [Hack-Nation](https://hacknation.io/) for organizing the Global AI Hackathon 2026
- [Ollama](https://ollama.com/) for making local LLM inference accessible
- [WXT](https://wxt.dev/) for the browser extension framework
- [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/) — the open-source ecosystem that made this possible

---

**Built by [Shreya Jaiswal] for Mozilla x Hack-Nation Global AI Hackathon 2026**
