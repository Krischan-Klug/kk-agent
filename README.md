# kk-agent

Monorepo for the KK-Agent desktop and web stack.

`kk-agent` is the canonical repository for the project. It keeps the desktop shell, frontend, backend, and shared contract package in one workspace so changes across the app can be versioned and released together.

The platform connects a Next.js frontend to a plugin-based backend and routes model calls to local or self-hosted OpenAI-compatible providers such as LM Studio, Ollama, llama.cpp, or vLLM. Electron packages the frontend and backend into a local desktop app.

## What It Does

- Runs chat, edit, and autonomous agent loops against local models
- Separates internal tools, external MCPs, and curated skills
- Streams assistant text, reasoning, tool activity, and loop state live
- Persists lightweight JSON state without a database

## Provider Model

Providers are configured only with:

- `name`
- `baseUrl`
- optional `apiKey`

Per model, kk-agent keeps only request-level defaults:

- endpoint: `chat-completions` or `responses`
- reasoning effort
- temperature
- max output tokens
- `Additional Request JSON` for rare provider-specific request fields

Runtime topics such as context window, KV cache, quantization, and backend load settings stay in LM Studio, Ollama, or the serving backend itself.

## Workspace Layout

```text
kk-agent/
|-- kk-agent-backend/   Plugin-based Node.js backend
|-- kk-agent-desktop/   Electron desktop shell and packaging
|-- kk-agent-frontend/  Next.js frontend
|-- kk-agent-contract/  Shared types and request/capability helpers
|-- scripts/            Root workspace scripts
|-- AGENTS.md
`-- CRITICAL_RULES.md
```

- [Backend README](kk-agent-backend/README.md)
- [Frontend README](kk-agent-frontend/README.md)

## Monorepo Commands

Install all workspace dependencies once from the root:

```bash
npm install
```

Start the backend and frontend together:

```bash
npm run dev
```

Build the contract, backend, and frontend:

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

Run a workspace-specific command from the root:

```bash
npm --workspace kk-agent-backend run test
npm --workspace kk-agent-frontend run build
```

## Quickstart

Requirements:

- Node.js 18+
- A local or self-hosted OpenAI-compatible provider

Backend only:

```bash
cd kk-agent-backend
npm install
npm run dev
```

Frontend only:

```bash
cd kk-agent-frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## First Setup

1. Open `Settings -> Provider`.
2. Add a provider with `name` and `baseUrl` and optional `apiKey`.
3. Pick a discovered model and set only the defaults you want the wrapper to own.
4. Put rare provider-specific request fields into `Additional Request JSON` if needed.

## Tech Stack

- Backend: Node.js, Express 5, TypeScript
- Frontend: Next.js 16, React 19, styled-components
- Desktop: Electron, electron-builder
- Contracts: shared TypeScript package
- Streaming: Server-Sent Events
- State: JSON files under `state/`

## Testing

Run checks from the root workspace:

```bash
npm --workspace kk-agent-contract run lint
npm --workspace kk-agent-backend run test
npm --workspace kk-agent-frontend run build
```

## License

Proprietary. All rights reserved.
