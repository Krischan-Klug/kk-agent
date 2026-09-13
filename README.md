# kk-agent

Monorepo for the KK-Agent desktop and web stack.

`kk-agent` is the canonical repository for the project. It keeps the desktop application, reusable backend, and shared contract package in one workspace so changes across the app can be versioned and released together.

The Electron application uses a Next.js renderer and connects to the plugin-based backend, which routes model calls to local or self-hosted OpenAI-compatible providers such as LM Studio, Ollama, llama.cpp, or vLLM.

## What It Does

- Runs plan and edit agent loops against local models
- Separates internal tools, external MCPs, and standard Agent Skills
- Provides deterministic calculation and isolated Python execution for compute and artifact generation
- Streams assistant text, reasoning, tool activity, and loop state live
- Persists lightweight JSON state without a database

## Provider Model

Providers are configured only with:

- `name`
- `baseUrl`
- optional `apiKey`

Every usable model has an explicitly selected, stable inference profile. Existing model profiles are updated in place; new models receive new profiles. The profile owns:

- the fixed `chat-completions` or `responses` endpoint
- input/output modalities and native tool support
- manufacturer prompt/template translations and sampling recipes

Per model, users may override only:

- the effective context limit when discovery does not expose it
- reasoning effort and history policy
- two optional OpenAI sampling overrides: `temperature` and `top_p`

Unprofiled models are discoverable in Provider Settings but cannot be selected for agents or sessions. There is no fuzzy capability detection or endpoint fallback.

Runtime topics such as KV cache, quantization, and model loading stay in the serving backend. KK-Agent uses discovered context metadata or an explicit per-model context limit for proactive compaction.

## Workspace Layout

```text
kk-agent/
|-- kk-agent-backend/   Plugin-based Node.js backend
|-- kk-agent-desktop/   Electron host and Next.js renderer
|-- kk-agent-contract/  Shared types and request/capability helpers
|-- scripts/            Root workspace scripts
`-- AGENTS.md
```

- [Backend README](kk-agent-backend/README.md)
- [Desktop README](kk-agent-desktop/README.md)

Contract and desktop notes:

- `kk-agent-contract` is a private local workspace package. It is not published or installed from an external registry.
- `kk-agent-desktop` owns both the Electron host and renderer and embeds its generated `out` directory, `kk-agent-backend/desktop-dist`, and the pinned `uvx` launcher for managed Python MCPs in packaged builds.
- Desktop and workspace development share one runtime state under the OS app-data `KK-Agent/state` directory. The repository contains no live state.

## Monorepo Commands

Install all workspace dependencies once from the root:

```bash
npm install
```

Start backend, renderer, and Electron together:

```bash
npm run dev
```

Build the contract, backend, and renderer:

```bash
npm run build
```

Build the desktop app and bundled assets:

```bash
npm run desktop:build
```

Create the Windows desktop installer:

```bash
npm run desktop:dist
```

Run Electron against an already running local backend and renderer:

```bash
npm run dev:desktop
```

Run a workspace-specific command from the root:

```bash
npm --workspace kk-agent-backend run lint
npm --workspace kk-agent-desktop run build:renderer
```

## Quickstart

Requirements:

- Node.js 22.13.0, Node.js 20.19.0+, or Node.js 24+
- A local or self-hosted OpenAI-compatible provider

Backend only from the root workspace:

```bash
npm run dev:backend
```

Renderer only from the root workspace:

```bash
npm run dev:renderer
```

Open `http://localhost:3000`.

## First Setup

1. Open `Settings -> Provider`.
2. Add a provider with `name` and `baseUrl` and optional `apiKey`.
3. Pick a discovered model and explicitly select its inference profile.
4. Override `temperature` or `top_p` only when the inference provider default is not suitable.

## Tech Stack

- Backend: Node.js, Express 5, TypeScript
- Desktop renderer: Next.js 16, React 19, styled-components
- Desktop host: Electron, electron-builder
- Contracts: shared TypeScript package
- Streaming: Server-Sent Events
- State: JSON files under `state/`

## Validation

Run the local checks directly:

```bash
npm run check
npm run build
npm run deadcode
```

Build the complete desktop runtime:

```bash
npm run desktop:build
```

## License

Proprietary. All rights reserved.
