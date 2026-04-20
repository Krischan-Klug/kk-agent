# kk-agent-backend

Plugin-based backend for local or self-hosted LLM agents.

The backend owns agent execution, prompt construction, tool orchestration, MCP integration, skills, chat sessions, and provider routing. It is intentionally thin around model serving details: local backends such as LM Studio or Ollama own runtime configuration, while this backend owns request shaping and orchestration.

## Quickstart

```bash
npm install
npm run dev
```

Other common commands:

```bash
npm run build
npm run lint
npm test
```

## Core Flow

```text
Session -> SystemPrompt -> Loop -> Provider -> Tools/MCPs/Skills -> Loop
```

- `session` resolves the active agent, model, tools, MCPs, and skills
- `systemprompt` builds the XML prompt from defaults, agent config, variables, and runtime instructions
- `loop` handles retries, continuation, budget controls, and tool iteration
- `provider` resolves model settings, endpoint choice, and request payloads
- `tools`, `mcp`, and `skills` execute capability work

## Plugin Overview

- `core`: bootstrap minimum
- `agent`: agent definitions, variables, loop metadata
- `loop`: execution loop and recovery
- `systemprompt`: XML prompt builder
- `session`: chat, streaming, uploads, lifecycle
- `provider`: providers, model discovery, capability observation, request resolution
- `tools`: internal tools plus task and memory state
- `mcp`: external MCP servers only
- `skills`: local curated skill bundles

## Provider Model

Providers are configured only with:

- `name`
- `baseUrl`
- optional `apiKey`

Model settings are request defaults only:

- endpoint
- reasoning effort
- temperature
- max output tokens
- endpoint-specific `Additional Request JSON`

Observed capabilities are stored in `state/providers.json` and currently track only:

- endpoint support
- reasoning support
- responses statefulness
- vision support

The provider layer keeps the wrapper small:

- model discovery probes OpenAI-compatible endpoints such as `/v1/models`, `/api/v1/models`, `/api/tags`, and llama.cpp props
- endpoint fallback from `responses` to `chat-completions` is observed and persisted
- request-level fields are normalized against the model's reported capabilities
- rare backend-specific fields pass through `extraBody`

## API Routes

Agent:

- `GET /agent`
- `POST /agent`
- `GET /agent/:id`
- `PUT /agent/:id`
- `DELETE /agent/:id`
- `GET /agent/system-variables`
- `GET /agent/loop-state/:sessionId`
- `GET /agent/loop-state/:sessionId/stream`

Session:

- `POST /session`
- `GET /session`
- `GET /session/:id`
- `PATCH /session/:id`
- `DELETE /session/:id`
- `POST /session/:id/chat`
- `POST /session/:id/chat/stream`
- `POST /session/:id/abort`
- `POST /session/:id/attachments`
- `GET /session/:id/prompt`
- `POST /session/:id/prompt/respond`

Tools:

- `GET /tools`
- `GET /tools/:id/tools`
- `POST /tools/:id/toggle`
- `PUT /tools/:id/instruction`
- `PUT /tools/:id`
- `GET /tools/task/session/:sessionId`
- `PUT /tools/task/session/:sessionId`
- `GET /tools/memory/user`
- `PUT /tools/memory/user`
- `GET /tools/memory/session/:sessionId`
- `PUT /tools/memory/session/:sessionId`

MCP:

- `GET /mcp`
- `POST /mcp`
- `PUT /mcp/:id`
- `DELETE /mcp/:id`
- `PUT /mcp/:id/instruction`
- `POST /mcp/:id/toggle`
- `POST /mcp/:id/start`
- `POST /mcp/:id/stop`
- `GET /mcp/:id/tools`

Skills:

- `GET /skills`
- `POST /skills`
- `PUT /skills/:id`
- `DELETE /skills/:id`

Provider:

- `GET /provider/models`
- `PUT /provider/models/:modelId/settings`
- `GET /provider/providers`
- `POST /provider/providers`
- `PUT /provider/providers/:id`
- `DELETE /provider/providers/:id`
- `POST /provider/providers/:id/test`

Defaults:

- `GET /defaults`
- `PUT /defaults`

## State

Persistent JSON state lives under `state/`:

- `agents.json`
- `defaults.json`
- `mcps.json`
- `providers.json`
- `system-mcps.json`
- `user-memory.json`
- `skills/`
- `session-attachments/`
- `tool-results/`

Sessions remain in memory and are not restored across restarts.

## Testing

Provider-focused tests intentionally stay small and split by responsibility:

- `service.test.ts`: provider service behavior
- `lib/request-config.test.ts`: request config merge and sanitizing
- `lib/helpers.test.ts`: chat-completions request body shaping
- `lib/endpoints/responses.test.ts`: responses request and continuation behavior
- `lib/transport.test.ts`: stream and tool-call normalization
- `lib/adapters/local.test.ts`: local model discovery and capability inference
- `lib/errors.test.ts`: provider error classification and backoff

Run everything with:

```bash
npm test
```
