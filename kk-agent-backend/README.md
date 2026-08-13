# kk-agent-backend

Plugin-based backend for local or self-hosted LLM agents.

The backend owns agent execution, prompt construction, tool orchestration, MCP integration, skills, chat sessions, and provider routing. It is intentionally thin around model serving details: local backends such as LM Studio or Ollama own runtime configuration, while this backend owns request shaping and orchestration.

## Quickstart

```bash
npm --workspace kk-agent-backend run dev
```

Other common commands:

```bash
npm run build
npm run build:desktop
npm run lint
```

Runtime configuration:

- `PORT`: API port, `0` allowed for an ephemeral port
- `KK_AGENT_STATE_DIR`: optional absolute override for persisted state; by default desktop and development share the OS app-data `KK-Agent/state` directory

Shared contract dependency:

- `kk-agent-contract` from the local workspace

## Core Flow

```text
Session -> SystemPrompt -> Loop -> Provider -> Tools/MCPs/Skills -> Loop
```

- `session` resolves the active agent, model, tools, MCPs, and skills
- `systemprompt` builds the XML prompt from defaults, agent config, variables, and runtime instructions
- `loop` handles retries, continuation, budget controls, and committed tool steps
- `provider` resolves model settings, endpoint choice, and request payloads
- `tools`, `mcp`, and `skills` execute capability work

## Plugin Overview

- `agent`: agent definitions, variables, loop metadata
- `loop`: execution loop and recovery
- `systemprompt`: XML prompt builder
- `session`: chat, streaming, uploads, lifecycle
- `provider`: providers, model discovery, capability observation, request resolution
- `tools`: internal tools plus task and memory state
- `mcp`: external MCP servers only
- `skills`: standard Agent Skills discovery, import, and progressive activation

Features are initialized in one fixed order. There is no dynamic discovery, dependency graph, semver negotiation, or plugin lifecycle framework.

## Provider Model

Providers are configured only with:

- `name`
- `baseUrl`
- optional `apiKey`

Model settings are request defaults only:

- endpoint
- reasoning effort
- compact `temperature` and `top_p` overrides

Standard sampling fields use the canonical request config; arbitrary provider fields remain in the same editable JSON projection. Default values are omitted from persisted state and outbound requests.

Observed capabilities are stored in `state/providers.json` and currently track only:

- endpoint support
- reasoning support
- responses statefulness
- vision support

The provider layer keeps the wrapper small:

- model discovery probes OpenAI-compatible endpoints such as `/v1/models`, `/api/v1/models`, `/api/tags`, and llama.cpp props
- endpoint fallback from `responses` to `chat-completions` is observed and persisted
- request-level fields are normalized against the model's reported capabilities
- all other inference settings belong in the inference provider

## API Routes

Agent:

- `GET /agent`
- `POST /agent`
- `PUT /agent/:id`
- `DELETE /agent/:id`
- `GET /agent/system-variables`

Session:

- `POST /session`
- `GET /session`
- `GET /session/:id`
- `PATCH /session/:id`
- `DELETE /session/:id`
- `POST /session/:id/chat/stream`
- `POST /session/:id/abort`
- `POST /session/:id/assets`
- `GET /session/:id/assets/:assetId`
- `GET /session/:id/assets/:assetId/preview/:page`
- `DELETE /session/:id/assets/:assetId`
- `GET /session/:id/prompt`
- `POST /session/:id/prompt/respond`

Tools:

- `GET /tools`
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

Skills:

- `GET /skills`
- `POST /skills/import`
- `DELETE /skills/:id`

Skills are unmodified Agent Skills bundles with a root `SKILL.md`. Discovery precedence is workspace `.agents/skills`, managed imports, then `~/.agents/skills`; duplicate names use the first discovered bundle. The prompt receives only catalog metadata until the `Skill` tool loads full instructions into request-scoped runtime context.

Provider:

- `GET /provider/models`
- `PUT /provider/models/:modelId/settings`
- `GET /provider/providers`
- `POST /provider/providers`
- `PUT /provider/providers/:id`
- `DELETE /provider/providers/:id`
- `POST /provider/providers/:id/test`

Defaults:

- `GET /settings/defaults`
- `PUT /settings/defaults`

## State

Persistent JSON state lives under `state/`:

- `agents.json`
- `defaults.json`
- `mcps.json`
- `providers.json`
- `system-mcps.json`
- `user-memory.json`
- `agent-skills/`
- `sessions/<sessionId>/session.json`
- `sessions/<sessionId>/tasks.json`
- `sessions/<sessionId>/facts.json`
- `sessions/<sessionId>/assets/`

Each session uses one atomically replaced, versioned JSON snapshot. A snapshot with an unknown schema is deleted on startup; there are no session migrations or compatibility bridges. Large tool output is bounded before it enters model context and is not written to a separate global store.
