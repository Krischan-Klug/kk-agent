# ⚙️ kk-agent-backend

Modular backend for local or self-hosted LLM agents. Built on Express 5, TypeScript, and a custom plugin system.

---

## 🚀 Quickstart

```bash
npm install
npm run dev     # Start with hot-reload (tsx watch) on port 3001
```

```bash
npm run build   # Compile to dist/
npm test        # Run test suite (Node.js built-in test runner)
```

### Environment Variables

Create a `.env` file in the backend root:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |

---

## 🧩 How the Agent Works

The backend assembles an autonomous agent from independent plugins. Each plugin contributes a specific capability. Together they form an execution pipeline:

```
Agent Definition
    │
    ▼
System Prompt Builder  ◄── prompt sections + variables + tool instructions
    │
    ▼
Agent Loop  ◄── iterates: prompt → LLM call → tool execution → repeat
    │
    ▼
Tool Layer  ◄── system tools + external MCPs + skills
    │
    ▼
Provider  ◄── sends requests to local LLM via OpenAI-compatible API
```

A chat request flows through: **Session** receives the user message, resolves the agent config, and builds runtime tool definitions. The **Loop** constructs the system prompt via **SystemPrompt**, calls the **Provider** to get an LLM response, and if the response contains tool calls, executes them through **Tools** / **MCP** / **Skills**. This repeats until the model stops calling tools or the iteration limit is reached.

### Loop resilience

The loop is built for long, unattended runs:

- **AbortSignal** — every session owns an `AbortController`; `POST /session/:id/abort` cancels the active turn, discards in-flight tool calls with synthetic `tool_result` errors, and returns with status `"aborted"`.
- **Recovery** — provider errors are classified into `prompt_too_long | max_output_tokens | rate_limit | transient | fatal`. The loop reacts by (a) snipping the oldest assistant/tool-result pairs on PTL, (b) re-injecting a `Continue exactly where you stopped` instruction up to 3x on `finish_reason=length`, (c) exponential-backoff retry on 429/5xx/network (1s, 3s, 9s + jitter).
- **Token-budget auto-continue** — when `autonomous: true`, the loop tracks input/output usage and keeps going past natural stop points until the model emits `TASK_COMPLETE`, a hard cap fires (iterations, wall-clock, consecutive auto-continues), or a diminishing-returns / budget-exhausted signal is hit.
- **Tool-result budget** — large tool outputs are persisted to `state/tool-results/<toolUseId>.txt` and replaced inline with a preview + pointer, so context does not explode on long runs.

---

## 🧩 Plugin System

Plugins are self-contained modules registered in `plugins.config.json`. Each plugin implements the `ModulePlugin` interface:

```typescript
interface ModulePlugin {
  name: string;
  version: string;
  deps?: PluginDependency[];
  init(app: Express, context: PluginLifecycleContext): void | Promise<void>;
  beforeInit?(app: Express, context: PluginLifecycleContext): void | Promise<void>;
  afterInit?(app: Express, context: PluginLifecycleContext): void | Promise<void>;
}
```

The plugin loader analyzes dependencies, resolves load order, and initializes plugins sequentially.

### Plugin Overview

| Plugin | Purpose |
|--------|---------|
| **core** | Bootstrap minimum. Ensures the server can start. |
| **provider** | LLM providers, model discovery, capability detection, streaming, token estimation. |
| **tools** | Internal system tools (filesystem, terminal, web-search, etc.) plus task and memory state. |
| **mcp** | External MCP server management — start, stop, tool discovery, execution. |
| **skills** | Developer-curated skill bundles with instructions, recommended tools, and metadata. |
| **loop** | Agent execution loop — orchestrates LLM calls and tool execution across iterations. |
| **systemprompt** | Builds the final XML-based system prompt from sections, variables, and instructions. |
| **session** | Chat sessions, SSE streaming, uploads, and session lifecycle. |
| **agent** | Agent definitions, mode configs, loop state tracking, system variable registration. |

---

## 🔧 Three Tool Systems

The agent separates tools into three independent layers:

### 1. Internal System Tools (`tools` plugin)

Built-in tools that ship with the agent:

| Tool ID | Capability |
|---------|-----------|
| `filesystem` | Read, write, edit, glob, grep files |
| `terminal` | Execute shell commands |
| `web-search` | Search the web |
| `user-interaction` | Ask the user questions |
| `task` | Create and manage structured task lists |
| `memory` | Read and write session and user memory |
| `attachment` | Handle uploaded files (images, text, PDFs) |

Each tool has configurable access scopes (`user` or `system`) and per-tool instructions injected into the system prompt.

### 2. External MCPs (`mcp` plugin)

User-added MCP servers (stdio or SSE transport). Each MCP exposes its own tools which the agent can call. MCPs are started/stopped at runtime and their tools are discovered dynamically.

### 3. Skills (`skills` plugin)

Curated instruction bundles in `state/skills/<skill-id>/`. Each skill has a `SKILL.md` with frontmatter and a markdown body. Skills can recommend specific tools and MCPs and are injected into the system prompt as a catalog.

---

## 🔀 Chat Modes

Three modes control what the agent can do:

| Mode | Purpose | Tools |
|------|---------|-------|
| **`plan`** | Read-only analysis | filesystem (read), terminal (read-only), web-search, user-interaction, task, attachment, skill |
| **`edit`** | Full execution | All plan tools + filesystem (write), terminal (write), memory |
| **`autonomous`** | Long-running, self-driving execution | Same tool set as `edit`, but the loop keeps running until the model emits `TASK_COMPLETE` or a budget cap fires |

Each agent defines `modeConfigs` with per-mode prompt sections, tool selections, access scopes, and instructions.

Any mode can additionally be flagged `autonomous: true` with an optional `autonomousBudget` (`maxInputTokens`, `maxOutputTokens`, `maxWallClockMs`, `maxConsecutiveAutoContinues`). When set, the loop auto-continues past turns where the model would otherwise stop, guarded by hard caps on iterations, wall-clock time, consecutive auto-continues, and token budget (with a diminishing-returns check).

---

## 📝 System Prompt Pipeline

The final prompt is assembled from four layers:

1. **Global Defaults** (`state/defaults.json`) — Base prompt sections, mode instructions, tool configs.
2. **Agent Overrides** — Per-agent customizations of prompt sections, tool access, and instructions.
3. **System Variables** — Runtime-resolved placeholders substituted into the prompt:
   - `{{CURRENT_DATE}}`, `{{CURRENT_TIME}}`, `{{CURRENT_TIMESTAMP}}`
   - `{{CURRENT_MODEL}}`
   - `{{TASK_SUMMARY}}`, `{{SESSION_MEMORY}}`, `{{USER_MEMORY}}`
   - `{{FILESYSTEM_ACCESS_SCOPE}}`, `{{FILESYSTEM_BASE_PATH}}`, `{{FILESYSTEM_ALLOWED_ROOT}}`
   - `{{TERMINAL_ACCESS_SCOPE}}`, `{{TERMINAL_WORKING_DIRECTORY}}`, `{{TERMINAL_ALLOWED_ROOT}}`, `{{TERMINAL_ELEVATION}}`
   - Plus agent-defined custom variables.
4. **Tool/MCP/Skill Instructions** — Per-tool and per-MCP instruction blocks appended to the prompt.

The output is an XML-structured document wrapped in `<agent_runtime_prompt>` tags.

---

## ⚡ SSE Streaming

Chat streaming uses Server-Sent Events. Event types:

| Event | Description |
|-------|-------------|
| `content` | Text token delta |
| `reasoning` | Reasoning token delta |
| `content_reset` | Clear accumulated content (retry) |
| `retry_notice` | Retry notification |
| `tool_call` | Tool invocation started |
| `tool_result` | Tool execution completed |
| `loop_state` | Agent loop status update |
| `stats` | Token usage statistics |
| `done` | Stream completed |
| `error` | Error occurred |

---

## 💾 State Management

Persistent state lives in `state/`:

| File / Directory | Content |
|---|---|
| `agents.json` | Agent definitions |
| `defaults.json` | Global prompt and runtime defaults |
| `mcps.json` | External MCP server configs |
| `providers.json` | Provider configs and model settings |
| `system-mcps.json` | System MCP overrides |
| `user-memory.json` | Persistent user memory facts |
| `skills/` | Skill bundles (SKILL.md + metadata) |
| `session-attachments/` | Uploaded files per session |
| `tool-results/` | Persisted large tool outputs |

> Sessions are runtime-only (in-memory). They are not persisted across server restarts.

---

## 🌐 API Routes

<details>
<summary><strong>Agent</strong></summary>

| Method | Route | Description |
|---|---|---|
| GET | `/agent` | List all agents |
| POST | `/agent` | Create agent |
| GET | `/agent/:id` | Get agent |
| PUT | `/agent/:id` | Update agent |
| DELETE | `/agent/:id` | Delete agent |
| GET | `/agent/system-variables` | List available prompt variables |
| GET | `/agent/loop-state/:sessionId` | Get current loop state |
| GET | `/agent/loop-state/:sessionId/stream` | Stream loop state via SSE |

</details>

<details>
<summary><strong>Session</strong></summary>

| Method | Route | Description |
|---|---|---|
| POST | `/session` | Create session |
| GET | `/session` | List sessions |
| GET | `/session/:id` | Get session |
| PATCH | `/session/:id` | Update session (mode, model, tools, MCPs, skills) |
| DELETE | `/session/:id` | Delete session |
| POST | `/session/:id/chat` | Non-streaming chat |
| POST | `/session/:id/chat/stream` | SSE streaming chat |
| POST | `/session/:id/abort` | Abort the active chat turn |
| POST | `/session/:id/attachments` | Upload file attachment |
| GET | `/session/:id/prompt` | Get current system prompt |
| POST | `/session/:id/prompt/respond` | Respond to `ask_user` prompt |

</details>

<details>
<summary><strong>Tools</strong></summary>

| Method | Route | Description |
|---|---|---|
| GET | `/tools` | List internal tools |
| GET | `/tools/:id/tools` | Get tool definitions |
| POST | `/tools/:id/toggle` | Toggle tool active state |
| PUT | `/tools/:id/instruction` | Update tool instruction |
| PUT | `/tools/:id` | Update tool config |
| GET | `/tools/task/session/:sessionId` | Get session tasks |
| PUT | `/tools/task/session/:sessionId` | Replace session tasks |
| GET | `/tools/memory/user` | Get user memory |
| PUT | `/tools/memory/user` | Replace user memory |
| GET | `/tools/memory/session/:sessionId` | Get session memory |
| PUT | `/tools/memory/session/:sessionId` | Replace session memory |

</details>

<details>
<summary><strong>MCP</strong></summary>

| Method | Route | Description |
|---|---|---|
| GET | `/mcp` | List external MCPs |
| POST | `/mcp` | Create MCP |
| PUT | `/mcp/:id` | Update MCP |
| PUT | `/mcp/:id/instruction` | Update MCP instruction |
| POST | `/mcp/:id/toggle` | Toggle MCP active state |
| POST | `/mcp/:id/start` | Start MCP server |
| POST | `/mcp/:id/stop` | Stop MCP server |
| DELETE | `/mcp/:id` | Delete MCP |
| GET | `/mcp/:id/tools` | Get MCP tools |

</details>

<details>
<summary><strong>Skills</strong></summary>

| Method | Route | Description |
|---|---|---|
| GET | `/skills` | List all skills |
| POST | `/skills` | Create skill |
| PUT | `/skills/:id` | Update skill |
| DELETE | `/skills/:id` | Delete skill |

</details>

<details>
<summary><strong>Provider</strong></summary>

| Method | Route | Description |
|---|---|---|
| GET | `/provider/models` | List models and settings |
| PUT | `/provider/models/:modelId/settings` | Update model settings |
| GET | `/provider/providers` | List providers |
| POST | `/provider/providers` | Create provider |
| PUT | `/provider/providers/:id` | Update provider |
| DELETE | `/provider/providers/:id` | Delete provider |
| POST | `/provider/providers/:id/activate` | Set active provider |
| POST | `/provider/providers/:id/test` | Test provider connection |

</details>

---

## 🔌 Provider Model

- Providers are configured with `name`, `baseUrl`, and optional `apiKey`.
- Model discovery uses OpenAI-compatible endpoints (`/v1/models`, `/api/v1/models`, `/api/tags`).
- Models report capabilities: tools, reasoning, streaming, vision, and endpoint support.
- The runtime normalizes reasoning effort, temperature, and max output tokens based on reported capabilities.

---

## 🧪 Testing

```bash
npm test
```

Tests are co-located with source files (`*.test.ts`) and run with the Node.js built-in test runner. Test files:

- `plugins/provider/lib/transport.test.ts`
- `plugins/provider/lib/endpoints/responses.test.ts`
- `plugins/provider/lib/errors.test.ts`
- `plugins/loop/lib/tool-executor.test.ts`
- `plugins/loop/lib/tool-result-storage.test.ts`
- `plugins/loop/lib/recovery.test.ts`
- `plugins/loop/lib/token-budget.test.ts`
- `plugins/lib/transcript.test.ts`
- `plugins/tools/lib/read-output.test.ts`
- `plugins/tools/lib/filesystem/runtime.test.ts`
- `plugins/tools/lib/terminal/command-policy.test.ts`
- `plugins/tools/lib/skill/runtime.test.ts`
- `plugins/skills/lib/loader.test.ts`
- `plugins/skills/service.test.ts`
- `plugins/systemprompt/lib/builder.test.ts`
