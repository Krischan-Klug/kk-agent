# Agents

Quick reference for AI agents working in this repo.

## Project Overview
- `kk-agent-backend`: Plugin-based backend for local / self-hosted LLM agents
- `kk-agent-frontend`: Next.js frontend for chat, agents, tools, MCPs, providers, and defaults
- `kk-agent-desktop`: Electron shell that bundles the static frontend and backend runtime
- `kk-agent-contract`: Private local workspace for shared TypeScript types and request/capability helpers

## Backend at a Glance
- `core`: Technical bootstrap minimum - no feature logic
- `agent`: Agent definitions, variables, loop modes
- `loop`: Agent loop, iterations, retry logic
- `systemprompt`: Builds the final LLM prompt
- `tools`: Internal system tools, tool state APIs, task and memory state
- `mcp`: External / user-added MCPs only
- `skills`: Local developer-curated skills from `state/skills`, separate from tools and MCPs
- `session`: Sessions, chat, streaming
- `provider`: Models and providers

## Desktop at a Glance
- Electron main forks the backend bundle as a Node process (`ELECTRON_RUN_AS_NODE`)
- Backend binds to a dynamic port; readiness is signaled via a `KK_AGENT_BACKEND_READY` stdout line
- Static frontend is served through a custom `app://` protocol, not `file://`
- Runtime state lives under `app.getPath("userData")/kk-agent/state`
- Renderer has `contextIsolation`, `sandbox`, and no `nodeIntegration`

## Frontend at a Glance
- `/chat`: Chat and debug
- `/agent`: Agent editor
- `/skills`: Skill bundles
- `/mcp`: External user MCPs only
- `/settings/defaults`: Global prompt- and runtime-relevant defaults
- `/settings/appearance`: Theme and UI appearance
- `/settings/tools`: Internal tools configuration
- `/settings/provider`: Providers and models

## Key Project Rules
- Preserve existing structure; extend an existing plugin, route, component, or helper before adding a new system.
- Internal tools are not user MCPs. Skills are not internal tools or user MCPs.
- Agents separate `toolIds`, `mcpIds`, and `skillIds`.
- Sessions separate `activeToolIds`, `activeMcpIds`, and `activeSkillIds`.
- Task and memory state lives exclusively in the `tools` plugin.
- Chat uploads use an internal `attachment` tool, not the normal filesystem tool.
- `src/plugins/lib` is utility code only, not a plugin.
- Runtime data belongs in existing `state/*.json` stores unless there is a clear architectural reason.
- Prompt-relevant defaults must be editable in Settings.
- New prompt variables must be registered, populated at runtime, and visible in the Agent editor.
- Prompt structure must stay consistent as XML.
- Loop behavior remains configurable per agent; `simple` loops must work without forced plan/verify steps.
- Providers use a unified capability model and are configured only via `name`, `baseUrl`, and optional `apiKey`.
- Internal tools are registered in the `tools` plugin, not the user MCP area.
- Large tool results must be truncated for model context; keep full output only where UI/debug needs it.
- Frontend debug content stays in debug surfaces, not the main chat transcript.
- Settings > Defaults contains only values that affect the final LLM prompt or LLM behavior.

## Maintenance
- Keep this file short and up to date.
- Only record real architecture or behavior changes.
- No to-do lists, no long explanations, no changelog.
