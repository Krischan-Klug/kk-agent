# kk-agent-frontend

Next.js frontend for `kk-agent-backend`.

The frontend is the control surface for chats, agents, providers, tools, MCPs, skills, and defaults. It stays intentionally thin around provider complexity: the provider page edits only wrapper-owned request defaults, while heavy model/runtime configuration stays in LM Studio, Ollama, or the serving backend.

## Quickstart

```bash
npm install
npm run dev
```

Other common commands:

```bash
npm run lint
npm run build
npm run build:desktop
```

## Main Routes

- `/chat`: main chat UI with streaming, debug, tasks, and memory
- `/agent`: agent editor
- `/mcp`: external MCP management
- `/skills`: skill bundle management
- `/settings/appearance`: theme settings
- `/settings/defaults`: global prompt/runtime defaults
- `/settings/provider`: providers and per-model request defaults
- `/settings/tools`: internal tool configuration

## Frontend Architecture

```text
src/
|-- pages/
|-- components/
|-- hooks/
|-- lib/
|-- types/
`-- styles/
```

Important areas:

- `components/chat`: composer, transcript, debug panel, tool cards
- `components/agent`: agent editing UI
- `components/provider`: provider and model settings UI
- `hooks/useChatStreaming`: SSE handling
- `hooks/useChatSessionData`: session bootstrap and refresh
- `lib/api.ts`: typed backend client
- `lib/modelCapabilities.ts`: UI-side capability resolution

## Provider UI Model

The provider page edits only wrapper-owned model defaults:

- endpoint
- reasoning effort
- temperature
- max output tokens
- `Additional Request JSON` for rare request fields

The same request-config editor is also reused in the chat debug panel for session-scoped overrides. That editor is not a full model-runtime configuration UI.

Context size, KV cache, backend launch parameters, and similar runtime details are expected to be managed in the actual serving backend.

## Streaming

Chat streaming is handled through `useChatStreaming` against `/session/:id/chat/stream`.

Main UI event handling:

- `content` and `reasoning`: append to the active assistant message
- `tool_call` and `tool_result`: update collapsible tool cards
- `loop_state`: update loop status UI
- `stats`: show token usage
- `done`: finalize the turn and refresh session data
- `error`: show the error in chat

## State

- session selection and sidebar state: `localStorage`
- chat/session data: React hook state
- streaming turn state: React hook state

No external state library is used.

## Styling

- styled-components
- CSS custom properties for theme tokens
- code-focused UI with monospace-heavy presentation

## Backend Contract

The frontend consumes the backend through the shared contract package and typed API wrappers. Provider-related UI follows the backend capability model rather than maintaining a separate frontend-only model description.

Package dependency:

- `@krischan-klug/kk-agent-contract` from GitHub Packages
