# kk-agent-frontend

Frontend fuer `kk-agent-backend`.

## Seiten

- `/chat` -> Chat, Streaming, Tool-Cards, Prompt-Debug, Tasks
- `/agent` -> Agent-Editor fuer Prompt, Modes, Tools, MCPs und Variablen
- `/tools` -> Interne Tools anzeigen und konfigurieren
- `/mcp` -> Externe Nutzer-MCPs anzeigen und konfigurieren
- `/provider` -> Lokale LLM-Provider und Modelle
- `/settings/defaults` -> Globale Prompt-, Mode- und Runtime-Defaults

## Wichtige UI-Regeln

- Interne Tools und externe MCPs bleiben getrennt.
- Agents arbeiten nur mit `plan` und `edit`.
- Agenten kommen aus der API bereits mit normalisierten `modeConfigs`.
- Der Agent-Editor zeigt Defaults und echte Overrides getrennt an.
- Provider-Optionen richten sich nach gemeldeten Modell-Capabilities.

## Relevante Typen

```ts
type SessionMessage = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  isError?: boolean;
  reasoning?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    category: "image" | "text" | "pdf";
    size: number;
    previewDataUrl?: string;
  }>;
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
      security: string;
      toolUsage: string;
      communication: string;
    };
    modeInstruction: string;
    toolIds: string[];
    mcpIds: string[];
    toolAccessScopes: Record<string, "user" | "system">;
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

type McpListItem = {
  id: string;
  name: string;
  active: boolean;
  running: boolean;
  source?: "system" | "custom";
  systemKey?: "filesystem" | "web-search" | "terminal" | "user-interaction" | "task" | "memory" | "attachment";
};
```

## SSE-Events

- `content`
- `reasoning`
- `content_reset`
- `retry_notice`
- `tool_call`
- `tool_result`
- `loop_state`
- `stats`
- `user_prompt`
- `done`
- `error`

## Start

```bash
npm install
npm run dev
```

Standard-Port: `3000`

Per Default wird das Backend unter `http://localhost:3001` erwartet. Ueberschreiben ueber `NEXT_PUBLIC_API_URL`.
