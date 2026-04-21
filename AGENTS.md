# Agents

Quick reference for AI agents working in this repo.

## Project Overview
- `kk-agent-backend`: Plugin-based backend for local / self-hosted LLM agents
- `kk-agent-frontend`: Next.js frontend for chat, agents, tools, MCPs, providers, and defaults

## Backend at a Glance
- `core`: Technical bootstrap minimum — no feature logic
- `agent`: Agent definitions, variables, loop modes
- `loop`: Agent loop, iterations, retry logic
- `systemprompt`: Builds the final LLM prompt
- `tools`: Internal system tools, tool state APIs, task and memory state
- `mcp`: External / user-added MCPs only
- `skills`: Local developer-curated skills from `state/skills`, separate from tools and MCPs
- `session`: Sessions, chat, streaming
- `provider`: Models and providers

## Frontend at a Glance
- `/chat`: Chat and debug
- `/agent`: Agent editor
- `/skills`: Skill bundles (local, developer-curated)
- `/mcp`: External user MCPs only
- `/settings/defaults`: Global prompt- and runtime-relevant defaults
- `/settings/appearance`: Theme and UI appearance
- `/settings/tools`: Internal tools configuration
- `/settings/provider`: Providers and models

## Key Project Rules
- Internal tools are not the same as user MCPs.
- Skills are not the same as internal tools or user MCPs.
- Agents separate `toolIds`, `mcpIds`, and `skillIds`.
- Sessions separate `activeToolIds`, `activeMcpIds`, and `activeSkillIds`.
- Skill bundles live in `state/skills/<skill-id>/` with `SKILL.md` and app-specific metadata alongside.
- Task and memory state lives exclusively in the `tools` plugin.
- Chat uploads use an internal `attachment` tool, not the normal filesystem tool.
- `src/plugins/lib` is utility code only, not a plugin.
- Prompt-relevant defaults must be editable in Settings.
- New prompt variables must be registered, populated at runtime, and visible in the Agent editor.
- Prompt structure must stay consistent as XML.
- Loop behavior remains configurable per agent.
- Providers use a unified capability model; UI and runtime follow reported model capabilities.
- Providers are local/self-hosted and configured only via `name`, `baseUrl`, and optional `apiKey`.

## Maintenance
- Keep this file short and up to date.
- Only record real architecture or behavior changes.
- No to-do lists, no long explanations, no changelog.
