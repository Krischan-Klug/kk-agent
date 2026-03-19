# kk-agent-backend

Modulares Backend fuer lokale oder selbst gehostete LLMs mit Agenten, MCP-Tools, Sessions, Streaming und einem generischen phasenbasierten Loop.

## Architektur

```text
HTTP / SSE
  |
  +-- provider      -> Modellzugriff, Streaming, Model-Settings
  +-- mcp           -> MCP-Registry, Tool-Lifecycle, Tool-Execution
  +-- agent         -> Agent-Definitionen, Loop-Strategien, Runtime-Loop-State
  +-- systemprompt  -> Prompt-Building mit Variablen und MCP-Instructions
  +-- loop          -> Generischer Agent-Loop, Compaction, Tool-Retry, Verifikation
  `-- session       -> Persistenz, Chat, Stream, Session-Kontext
```

Runtime-State liegt unter `state/`. Die zentrale Konfiguration sitzt in:

- `state/agents.json`
- `state/mcps.json`
- `state/provider.json`

## Agent-System

Agenten definieren Prompt, Phasen und MCP-Zuordnung. Der aktuelle `coding-agent` nutzt einen generischen Dev-Loop:

`discover -> execute -> verify -> finalize`

Wichtige Eigenschaften:

- Phasenabschluss ueber `completionCriteria`
- optionales Weiterlaufen in derselben Phase ueber `continueOnStop`
- Ruecksprung bei Tool-Fehlern ueber `tool_result_error`
- Abschluss ueber `phase_complete` statt rein ueber fehlende Tool-Calls

### Kern-Typen

```ts
type AgentDefinition = {
  id: string;
  name: string;
  description: string;
  loopStrategy: LoopStrategy;
  promptTemplates: {
    base: string;
    phases: Record<string, string>;
  };
  mcpIds: string[];
  mcpInstructions: Record<string, string>;
  variables: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: string;
  compactionPrompt?: string;
  createdAt: string;
  updatedAt: string;
};

type LoopPhase = {
  name: string;
  description: string;
  maxIterations: number;
  toolFilter?: { mode: "include" | "exclude"; toolNames: string[] };
  completionCriteria?: {
    mode: "stop" | "signal";
    signal?: string;
    requiresToolCall?: boolean;
  };
  continueOnStop?: boolean;
  transitions: Array<{
    to: string;
    condition:
      | { type: "max_iterations" }
      | { type: "no_tool_calls" }
      | { type: "tool_called"; toolName: string }
      | { type: "tool_result_error" }
      | { type: "phase_complete" }
      | { type: "keyword"; keyword: string }
      | { type: "always" };
  }>;
  autoAdvance: boolean;
};
```

## Prompt-Building

Der System-Prompt wird pro Iteration neu aufgebaut aus:

1. Agent-Base-Prompt
2. aktueller Phasen-Erweiterung
3. MCP-Instructions der wirklich laufenden MCPs
4. Template-Variablen

Standard-Variablen:

- `{{CURRENT_DATE}}`
- `{{CURRENT_TIME}}`
- `{{CURRENT_TIMESTAMP}}`
- `{{phase}}`
- `{{iteration}}`
- `{{maxIterations}}`

`GET /session/:id/prompt` liefert den aktuell aufgeloesten Prompt fuer Session und Phase.

## Reasoning und Tool-Protokoll

Assistant-Antwort und Thinking sind getrennt gespeichert.

```ts
type SessionMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  reasoning?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
};
```

Regeln:

- `content` ist sichtbare Antwort und einziger Assistant-Text im Dialogkontext
- `reasoning` bleibt fuer UI und Verlauf erhalten, wird aber nicht erneut ans Modell geschickt
- Streaming liefert getrennte `content`- und `reasoning`-Events
- nur strukturierte `tool_calls` aus der Provider-Antwort werden ausgefuehrt
- pseudo-formatierte Tool-Aufrufe in Text oder Thinking werden nicht geparst, sondern intern mit begrenztem Retry korrigiert

Provider-seitige `<think>`-Kompatibilitaet existiert nur noch als interner Parser-Fallback.

## Context Compaction

Compaction ist intern und automatisch. Sie reduziert nur den Modellkontext im Loop, nicht den sichtbaren Session-Verlauf.

Prioritaet fuer den Compaction-Prompt:

1. Agent `compactionPrompt`
2. Provider-Model-Setting `compactionPrompt`
3. interner Default

Wichtig:

- historisches `reasoning` geht nicht in den Compaction-Input
- finaler sichtbarer Verlauf mit Assistant-`content` und `reasoning` bleibt erhalten

## MCP-System

MCPs werden in `state/mcps.json` verwaltet.

Verhalten:

- Auto-Start beim Boot
- manueller Start/Stop pro MCP
- Tool-Discovery pro laufendem MCP
- MCP-Instructions nur fuer `active && running`
- geloeschte MCPs werden aus Agents und Sessions entfernt

Die Default-Instructions beschreiben Faehigkeiten generisch und binden sich nicht an konkrete Toolnamen.

## Provider-Settings

```ts
type ModelSettings = {
  reasoningEffort?: string;
  reasoningOnOff?: boolean;
  levels?: Record<string, { temperature?: number; maxOutputTokens?: number }>;
  compactionPrompt?: string;
};
```

Prioritaeten:

- `reasoningEffort`: Session > Model-Setting > Agent
- `temperature`: Session > Level-Setting > Default
- `compactionPrompt`: Agent > Model-Setting > Default

## API

### Agent

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/agent` | Alle Agents |
| POST | `/agent` | Agent erstellen |
| GET | `/agent/:id` | Agent laden |
| PUT | `/agent/:id` | Agent updaten |
| DELETE | `/agent/:id` | Agent loeschen |
| GET | `/agent/loop-state/:sessionId` | Aktueller Loop-State |
| GET | `/agent/loop-state/:sessionId/stream` | Loop-State als SSE |

### Session

| Methode | Route | Beschreibung |
|---|---|---|
| POST | `/session` | Session erstellen |
| GET | `/session` | Sessions listen |
| GET | `/session/:id` | Session laden |
| DELETE | `/session/:id` | Session loeschen |
| PATCH | `/session/:id` | Model, MCPs, Reasoning, Temperature aendern |
| POST | `/session/:id/chat` | Non-Streaming Chat |
| POST | `/session/:id/chat/stream` | SSE-Chat |
| GET | `/session/:id/prompt` | Aktuellen aufgeloesten System-Prompt lesen |

### Provider

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/provider/models` | Verfuegbare Modelle |
| PUT | `/provider/models/:modelId/settings` | Model-Settings setzen |
| POST | `/provider/switch` | Aktives Modell wechseln |

### MCP

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/mcp` | MCPs mit Status und Tools |
| POST | `/mcp` | MCP erstellen |
| POST | `/mcp/:id/toggle` | MCP aktivieren/deaktivieren |
| POST | `/mcp/:id/start` | MCP starten |
| POST | `/mcp/:id/stop` | MCP stoppen |
| PUT | `/mcp/:id` | MCP updaten |
| PUT | `/mcp/:id/instruction` | MCP-Instruction updaten |
| DELETE | `/mcp/:id` | MCP loeschen |
| GET | `/mcp/:id/tools` | Tools eines MCPs |

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Voraussetzungen:

- Node.js >= 18
- erreichbarer LLM-Endpoint, z. B. LM Studio

Standard-Port: `3001`
