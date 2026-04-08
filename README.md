# 🖥️ kk-agent-frontend

Next.js 16 frontend for [kk-agent-backend](../kk-agent-backend/). React 19, styled-components, TypeScript.

---

## 🚀 Quickstart

```bash
npm install
npm run dev     # Start dev server with hot-reload on port 3000
```

```bash
npm run build   # Production build
```

### Environment Variables

Create a `.env.local` file in the frontend root:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Backend API base URL |

> The frontend expects the backend to be running at the configured URL.

---

## 📄 Pages

| Route | Purpose |
|-------|---------|
| `/chat` | Main chat interface — streaming, tool cards, debug panel, tasks, memory |
| `/agent` | Agent editor — prompt sections, mode configs, tools, MCPs, skills, variables |
| `/mcp` | External MCP server management (add, edit, start/stop) |
| `/skills` | Skills catalog — create, edit, and manage skill bundles |
| `/settings/appearance` | Theme and visual customization |
| `/settings/defaults` | Global prompt sections, mode instructions, and runtime defaults |
| `/settings/provider` | LLM provider and model configuration |
| `/settings/tools` | Internal tool configuration and access scopes |

---

## 🏗️ Architecture

```
src/
├── pages/              Next.js pages (one per route above)
├── components/         UI components organized by feature
│   ├── agent/            Agent editor components
│   ├── chat/             Chat messages, composer, debug panel
│   ├── mcp/              MCP configuration components
│   ├── provider/         Provider settings components
│   └── settings/         Settings page components
├── hooks/              React hooks
│   ├── useChatStreaming      SSE stream handling and event dispatch
│   ├── useChatSessionData    Session state, debug data, bootstrap
│   ├── useChatAutoScroll     Auto-scroll on new messages
│   └── useAttachments        File upload and attachment management
├── lib/                Utilities
│   ├── api                 API client (typed wrappers for all backend endpoints)
│   ├── appEvents           Cross-component event bus
│   ├── sessionState        Persistent session state (localStorage + useSyncExternalStore)
│   ├── modelCapabilities   Model capability resolution for UI controls
│   └── uiLogger            Centralized UI error logging
├── types/
│   └── api.ts              All TypeScript types matching backend API responses
└── styles/             Global CSS and theme variables
```

---

## 🔗 API Client

The API client in `lib/api.ts` provides typed access to all backend endpoints:

| Namespace | Covers |
|-----------|--------|
| `agent` | CRUD for agent definitions, system variables, loop state |
| `session` | Session lifecycle, chat (sync + SSE stream), attachments, prompt |
| `tools` | Internal tools, tasks, memory (session + user) |
| `mcp` | External MCP servers, tools, start/stop |
| `skills` | Skill CRUD |
| `provider` | Providers, models, model settings |
| `settings` | Global defaults |

---

## ⚡ SSE Event Handling

Chat streaming is handled by `useChatStreaming`. It connects to `/session/:id/chat/stream` and processes events:

| Event | Behavior |
|-------|----------|
| `content` / `reasoning` | Appended to current assistant message |
| `content_reset` | Clears accumulated content (on retry) |
| `tool_call` / `tool_result` | Rendered as collapsible tool cards |
| `loop_state` | Updates the loop status indicator |
| `stats` | Token usage display |
| `done` | Finalizes the message and refreshes session state |
| `error` | Displays error in chat |

---

## 🗂️ State Management

| State | Where | How |
|-------|-------|-----|
| Session state (active ID, sidebar) | `localStorage` | `sessionState.ts` + `useSyncExternalStore` |
| Chat data (session, messages, debug) | React hook state | `useChatSessionData` |
| Streaming state (current message, tool status) | React hook state | `useChatStreaming` |

No external state library (Redux, Zustand) — pure React hooks and component state.

---

## 🎨 Styling

- **styled-components** for all component styling
- CSS custom properties for theming: `--bg-*`, `--text-*`, `--accent-*`, `--border-*`, `--radius-*`, `--space-*`, `--font-*`
- Appearance page allows runtime theme customization
- Monospace font throughout for code-focused UI

---

## 🧩 Key UI Patterns

- **Chat debug panel** — Expandable panel showing system prompt, meta messages, active tools/MCPs/skills, session info, raw messages, tasks editor, and memory editor. Inline model and capability switching.
- **Agent editor** — Two-column layout with agent list + full editor. Per-mode tabs for prompt sections, tool selections, and instructions.
- **Tool cards** — Collapsible cards showing tool name, arguments, execution status, and result preview.
