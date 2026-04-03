# kk-agent-frontend

Frontend fuer `kk-agent-backend`.

## Seiten

- `/chat` -> Streaming-Chat mit Markdown-Rendering, Tool-Cards und Loop-State
- `/agent` -> Agent-Editor fuer Modus, Prompt-Sektionen, Tool-/MCP-Zuordnung und Variablen
- `/tools` -> interne Tools anzeigen und konfigurieren
- `/mcp` -> nur externe Nutzer-MCPs anzeigen und konfigurieren
- `/provider` -> lokale LLM-Provider und Modelle
- `/settings/defaults` -> globale Prompt-, Modus- und Runtime-Defaults

## Aktueller API-Vertrag

Wichtige Punkte:

- Assistant-Messages trennen `content` und `reasoning`
- Nur strukturierte `tool_calls` sind echte Tool-Aufrufe
- Das Chatfenster rendert Assistant-Text als Markdown
- `/tools` und `/mcp` sind getrennt
- `/provider` ist capability-basiert: Reasoning-Optionen erscheinen nur, wenn das Modell sie unterstuetzt
- Provider werden nur ueber `name`, `baseUrl` und optionalen `apiKey` gepflegt

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
  defaultChatMode: "plan" | "edit";
  modeConfigs: Record<"plan" | "edit", {
    promptSections: {
      identity: string;
      system: string;
      riskyActions: string;
      toolUsage: string;
      communication: string;
    };
    modeInstruction: string;
    toolIds: string[];
    mcpIds: string[];
    toolInstructions: Record<string, string>;
    mcpInstructions: Record<string, string>;
    allowedToolNames: string[];
  }>;
  maxIterations: number;
  variables: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: string;
  temperature?: number;
  createdAt: string;
  updatedAt: string;
};

type SessionState = {
  id: string;
  agentId: string;
  providerId: string;
  activeToolIds: string[];
  activeMcpIds: string[];
  messages: SessionMessage[];
};

type ModelInfo = {
  id: string;
  providerId: string;
  capabilities: {
    supportsTools: boolean;
    supportsReasoning: boolean;
    supportsStreaming: boolean;
    supportedEndpoints: Array<"chat-completions" | "responses">;
  };
};

type McpListItem = {
  id: string;
  name: string;
  active: boolean;
  running: boolean;
  source?: "system" | "custom";
  systemKey?: "filesystem" | "web-search" | "terminal" | "user-interaction" | "task" | "memory";
};
```

## SSE-Events im Chat

- `content`
- `reasoning`
- `content_reset`
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
