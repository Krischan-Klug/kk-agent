# Agents

Quick reference for AI agents working in this repo.

## Project Overview
- `kk-agent-backend`: Plugin-based backend for local / self-hosted LLM agents
- `kk-agent-desktop`: Electron application containing the Next.js renderer and desktop host
- `kk-agent-contract`: Private local workspace for shared TypeScript types and request/capability helpers

## Backend at a Glance
- `agent`: Agent definitions, variables, prompts, and capability selections
- `loop`: Agent loop, committed steps, attempts, retry logic
- `systemprompt`: Builds the final LLM prompt
- `tools`: Internal system tools, tool state APIs, task and memory state
- `mcp`: External / user-added MCPs only
- `skills`: Agent Skills discovered from workspace/user roots plus managed imports, separate from tools and MCPs
- `session`: Sessions, chat, streaming
- `provider`: Models and providers
- `provider/lib/model-profiles`: Stable model-specific inference recipes and canonical request translation

Backend features register through a fixed, explicit initializer list. There is no dynamic plugin discovery, dependency graph, or lifecycle layer.

## Desktop at a Glance
- `electron`: Electron main process and preload bridge
- `src`: Next.js renderer for chat, agents, tools, MCPs, providers, and defaults
- Electron main forks the backend bundle as a Node process (`ELECTRON_RUN_AS_NODE`)
- Backend binds to a dynamic port; readiness is signaled via a `KK_AGENT_BACKEND_READY` stdout line
- The static renderer is served through a custom `app://` protocol, not `file://`
- Development and packaged desktop share runtime state under `app.getPath("userData")/state`; the repository contains no live state
- Renderer has `contextIsolation`, `sandbox`, and no `nodeIntegration`

## Renderer at a Glance
- `/chat`: Chat and debug
- `/agent`: Agent editor
- `/skills`: Skill bundles
- `/mcp`: External user MCPs only
- `/settings/security`: Global access-scope and approval defaults
- `/settings/appearance`: Theme and UI appearance
- `/settings/tools`: Internal tools configuration
- `/settings/provider`: Providers and models
- Renderer failures use one global, manually dismissed error-toast queue; domain validation and status results may remain local.

## Key Project Rules
- Preserve existing structure; extend an existing plugin, route, component, or helper before adding a new system.
- Internal tools are not user MCPs. Skills are not internal tools or user MCPs.
- Skills use the Agent Skills `SKILL.md` format unchanged; KK-Agent adds no bundle overlays, capability links, or provider-specific adapters.
- Managed skill imports accept any source folder name and install under the canonical frontmatter `name`.
- Skill discovery precedence is workspace `.agents/skills`, managed `state/agent-skills`, then user `~/.agents/skills`.
- Skill metadata is catalog context; full instructions and resources enter request-scoped runtime context only after activation.
- Agents separate `toolIds`, `mcpIds`, and `skillIds`.
- Sessions separate `activeToolIds`, `activeMcpIds`, and `activeSkillIds`.
- Conversation state is one versioned `session.json` snapshot plus its asset directory; incompatible snapshots are deleted instead of migrated. Tool-owned task and memory files remain separate.
- Automatic context compaction keeps the full transcript, streams usage around every model turn, and uses an ephemeral no-tools runner with model-profile-owned transport. It removes redundant tool payloads, compacts the cleaned evidence in one pass whenever it fits the safe window, falls back to hierarchical splitting only on real overflow, and atomically activates only a validated continuation state; invalid summaries fail closed and projection changes reset provider continuation state.
- Task and memory state lives exclusively in the `tools` plugin.
- Chat uploads use an internal `attachment` tool, not the normal filesystem tool.
- Session files use one asset pipeline: transcript input refs contain only `assetId`, generated artifacts belong to runs, and binary/model projections are request-scoped.
- `src/plugins/lib` is utility code only, not a plugin.
- Runtime data belongs in existing `state/*.json` stores unless there is a clear architectural reason.
- Prompt templates are code-owned defaults; Security settings own the editable access-scope and approval defaults.
- New prompt variables must be registered, populated at runtime, and visible in the Agent editor.
- Prompt structure must stay consistent as XML.
- Escape XML attributes and wrap free-form runtime text in CDATA; keep request-scoped runtime context after the stable prompt prefix.
- Loop behavior remains configurable per agent; `simple` loops must work without forced plan/verify steps.
- Providers use a unified capability model and are configured only via `name`, `baseUrl`, and optional `apiKey`.
- Every usable model requires an explicit stable inference profile; the profile ID identifies the model or generic transport recipe and is updated in place. New models receive new profiles. Profiles fix endpoint, transport, modalities, tools, reasoning translation, and manufacturer sampling defaults. Do not infer these from model names or retry across endpoints.
- Harness reasoning uses `reasoning.effort` (`none|low|medium|high|xhigh`) plus a canonical history policy; full reasoning remains in the transcript for debug and compaction, while the Qwen default replays only the latest assistant step.
- Sampling defaults beyond optional user `temperature` and `top_p` overrides belong to stable model profiles.
- User-configurable sampling is limited to optional `temperature` and `top_p` overrides; arbitrary request-body passthrough belongs in the inference provider.
- Internal tools are registered in the `tools` plugin, not the user MCP area.
- Filesystem Read provides model context but never acts as mutation authorization. Edit and Write read current content internally, serialize mutations per path, and replace text files atomically.
- Terminal resolves one stable shell profile at startup (Git Bash, then PowerShell on Windows); unavailable shells remove the tool and its instructions from runtime context. Bash-compatible profiles enable `pipefail`. Background commands are session-owned tasks controlled only through their task IDs, and active tasks are projected request-scoped. Windows commands are assigned to a kill-on-close Job Object before release; Git Bash additionally owns a verified MSYS process group, and `stop` succeeds only after both containment boundaries are empty.
- Verification claims must match exercised behavior; build, typecheck, and HTTP checks do not establish interactive runtime behavior.
- Terminal `accessScope` and `approvalMode` are independent; tool settings provide defaults, sessions persist their approval mode, and effective values are fixed per run. The harness owns approval prompts, while `ask_user` is only for missing user information or decisions.
- MCP `active` is persisted intent; runtime availability is reported separately and connection failures never stop the backend.
- Large tool results must be truncated for model context; keep full output only where UI/debug needs it.
- Runtime context and loaded skill instructions are request-scoped provider instructions, never transcript messages.
- Runs persist typed events and incremental transcript checkpoints; retries advance attempts, only valid model outputs advance steps.
- Run cancellation propagates one signal through providers and tools; discarded work never blocks finalization or commits late results.
- Run events declare debug/user visibility and terminality; frontend debug content stays in debug surfaces, not the main chat transcript.
- Tool-call display labels are generated by the harness and are not exposed in model tool schemas.
- Debug exposes the exact request-scoped model input and conditional harness instructions read-only.

## Maintenance
- Keep this file short and up to date.
- Only record real architecture or behavior changes.
- No to-do lists, no long explanations, no changelog.
