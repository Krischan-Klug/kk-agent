# kk-agent-frontend

Frontend fuer `kk-agent-backend`.

## Seiten

- `/chat` -> Streaming-Chat mit Markdown-Rendering, Tool-Cards und Loop-State
- `/agent` -> Agent-Editor fuer Prompt, `maxIterations`, MCP-Zuordnung, Variablen sowie Agent-Defaults fuer Model, Reasoning und Temperature
- `/mcp` -> System- und Custom-MCPs anzeigen und konfigurieren
- `/provider` -> Modelle und Provider-Settings
- `/settings/defaults` -> App-Defaults

## Aktueller API-Vertrag

Wichtige Punkte:

- Assistant-Messages trennen `content` und `reasoning`
- Nur strukturierte `tool_calls` sind echte Tool-Aufrufe
- Das Chatfenster rendert Assistant-Text als Markdown
- `/mcp` zeigt System- und Custom-MCPs in einer gemeinsamen Liste

### Relevante Typen

```ts
type SessionMessage = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  reasoning?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
};

type AgentDefinition = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  maxIterations: number;
  mcpIds: string[];
  mcpInstructions: Record<string, string>;
  variables: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: string;
  temperature?: number;
  createdAt: string;
  updatedAt: string;
};

type McpListItem = {
  id: string;
  name: string;
  active: boolean;
  running: boolean;
  source?: "system" | "custom";
  systemKey?: "filesystem" | "web-search" | "terminal" | "user-interaction";
};
```

## SSE-Events im Chat

- `content`
- `reasoning`
- `retry_notice`
- `tool_call`
- `tool_result`
- `loop_state`
- `stats`
- `done`
- `error`

## Quick Start

```bash
npm install
npm run dev
```

Standard-Port: `3000`

Per Default wird das Backend unter `http://localhost:3001` erwartet.
Ueberschreiben ueber `NEXT_PUBLIC_API_URL`.
