# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OpenLens** is a Chrome/Firefox browser extension that monitors and visualizes what AI models infer about users during browsing sessions. Built for the Mozilla x Hack-Nation Global AI Hackathon 2026. MIT licensed.

The core insight: every browser AI builds a "shadow profile" of users through inferred data, but users can't see it. OpenLens reveals this.

## Tech Stack

- **Extension framework:** WXT (wxt.dev) — Vite-based, Manifest V3, hot reload
- **UI:** React 18 + TypeScript
- **Styling:** Tailwind CSS
- **Local LLM:** Ollama REST API at `localhost:11434`
- **Storage:** `chrome.storage.local`
- **Bar isolation:** Shadow DOM (prevents site CSS interference)
- **Build targets:** Chrome MV3 (primary), Firefox (secondary)

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # WXT dev server with hot reload
npm run build        # Production build → .output/chrome-mv3/
npm run build:firefox  # Firefox build
npm run zip          # Package for distribution
```

## Loading the Extension

1. `npm run build`
2. Open `chrome://extensions/` → Enable Developer Mode
3. Click "Load unpacked" → Select `.output/chrome-mv3/`

## Architecture — Four Layers

Each layer depends on the one below it:

1. **Layer 1 — Informed Setup ("Know Your Machine"):** Hardware profiling via browser APIs (WebGPU, `navigator.hardwareConcurrency`, `navigator.deviceMemory`), Ollama detection, model recommendation by VRAM fit, local-first privacy setup. UI lives in `src/entrypoints/popup/`.

2. **Layer 2 — Insights Bar ("Know Your Context"):** Persistent top-of-page bar injected via content script into Shadow DOM. Five agentic modules sharing an `InsightModule` interface, communicating via an event bus through the background service worker. UI pills show real-time status. Modules in `src/modules/`.

3. **Layer 3 — Transparent Agent ("See It Work"):** Step-by-step LLM task execution with user approval at each step. Side panel UI in `src/entrypoints/sidepanel/`. Task engine and explainer in `src/agent/`.

4. **Layer 4 — Shadow Profile ("Know Your Shadow"):** Analyzes accumulated session data to reveal what the AI has inferred about the user (budget, schedule, preferences, relationships). Engine and store in `src/shadow/`, UI in popup.

## Five Insight Modules (Layer 2)

All implement `InsightModule` interface (defined in `src/modules/types.ts`), subscribe to `EventType` events via the event bus (`src/modules/event-bus.ts`):

| Module | File | Purpose |
|---|---|---|
| Data Flow Tracker | `data-flow-tracker.ts` | Token counting per origin, sensitivity classification |
| Cross-Origin Alert | `cross-origin-alert.ts` | Detects when data from different origins merge in LLM context |
| Context Monitor | `context-monitor.ts` | Real-time context window capacity (color-coded 🟢🟡🔴) |
| Privacy Router | `privacy-router.ts` | Shows local vs cloud processing, blocks sensitive cloud sends |
| Audit Trail | `audit-trail.ts` | Session record of all AI events, exportable as JSON |

## Source Structure

```
src/
├── entrypoints/
│   ├── background.ts          # Service worker (message routing, event bus)
│   ├── content.ts             # Content script (injects Insights Bar via Shadow DOM)
│   ├── sidepanel/             # Layer 3 transparent agent UI
│   └── popup/                 # Layer 1 setup + Layer 4 shadow profile UI
├── modules/                   # Layer 2 insight modules + shared types
├── shadow/                    # Layer 4 shadow profile engine + store
├── agent/                     # Layer 3 task engine, mock-MCP, explainer
├── hardware/                  # Layer 1 hardware scanner, Ollama client, model recommender
├── components/                # Shared React components
├── lib/                       # Utilities
└── styles/
```

## Ollama Integration

All local LLM inference goes through Ollama at `http://localhost:11434`:
- `GET /api/tags` — list installed models
- `POST /api/show` — model details (params, context length)
- `POST /api/generate` — inference / benchmarking
- `GET /api/ps` — running models with VRAM usage
- `POST /api/chat` — chat completion for explanations

VRAM fit rule: `model fits if estimated_vram_gb > (model_size_gb + 2 GB overhead)`

## Key Design Decisions

- **Shadow DOM isolation** for the Insights Bar so site CSS cannot interfere
- **Content script ↔ Background service worker** communication via `chrome.runtime` messaging
- **Token estimation** uses `text.length / 4` (no tokenizer dependency)
- **Sensitivity classification** is hardcoded rules (no LLM needed) — LLM is only used for plain-English explanations
- **Plugin architecture** — modules share `InsightModule` interface for extensibility
- **Local-first by default** — cloud is opt-in with explicit privacy warnings
