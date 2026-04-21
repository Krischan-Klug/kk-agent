# kk-agent

Local, self-hosted agent platform for developer workflows.

kk-agent connects a Next.js frontend to a plugin-based backend and routes model calls to local or self-hosted OpenAI-compatible providers such as LM Studio, Ollama, llama.cpp, or vLLM. The system is built around a small wrapper model: providers own connectivity, the backend owns orchestration, and the frontend exposes the parts that matter for agents and chats.

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

## Project Layout

```text
kk-agent/
|-- kk-agent-backend/   Plugin-based Node.js backend
|-- kk-agent-desktop/   Electron desktop shell and packaging
|-- kk-agent-frontend/  Next.js frontend
|-- kk-agent-contract/  Shared types and request/capability helpers published via GitHub Packages
|-- AGENTS.md
`-- CRITICAL_RULES.md
```

- [Backend README](kk-agent-backend/README.md)
- [Frontend README](kk-agent-frontend/README.md)

## Quickstart

Requirements:

- Node.js 18+
- A local or self-hosted OpenAI-compatible provider

Backend:

```bash
cd kk-agent-backend
npm install
npm run dev
```

Frontend:

```bash
cd kk-agent-frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

Workspace:

```bash
npm install
npm run dev
```

Desktop build:

```bash
npm run desktop:dist
```

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

Backend:

```bash
cd kk-agent-backend
npm test
```

Frontend:

```bash
cd kk-agent-frontend
npm run lint
npm run build
```

## License

Proprietary. All rights reserved.
