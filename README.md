# kk-agent-backend

Modulares Multi-Agent-Backend fuer lokale oder selbst gehostete LLMs. Das System verbindet Provider, MCP-Tools, phasenbasierte Agent-Loops und Sessions ueber eine kleine Plugin-Architektur.

## Architektur

```
HTTP / SSE
   |
   +-- provider      -> LLM-Anbindung, Streaming, Model-Settings
   +-- mcp           -> MCP-Registry, Tool-Lifecycle, Instructions
   +-- agent         -> Agent-Definitionen, Loop-Strategien, Loop-State
   +-- systemprompt  -> Prompt-Building mit Variablen und MCP-Instructions
   +-- loop          -> generischer Dev-Loop mit Phasen, Transitionen, Compaction
   `-- session       -> Chat, Stream, Persistenz, Session-Kontext
```

Plugins werden ueber `plugins.config.json` aktiviert. Runtime-State liegt unter `state/` und hat Prioritaet vor Config-Defaults.

## Agent-System

Ein Agent definiert, wie das Modell arbeitet. Der aktuelle `coding-agent` ist als generischer Dev-Loop aufgebaut:

`discover -> execute -> verify -> finalize`

Zentrale Eigenschaften:

- wenige generische Phasen statt repo-spezifischer Speziallogik
- kontrollierte Rueckspruenge aus `verify` nach `execute`
- explizite Phasenabschlusskriterien ueber `completionCriteria`
- optionales Weiterlaufen in derselben Phase ueber `continueOnStop`
- Tool-Fehler als echte Transition-Bedingung (`tool_result_error`)
- Abschluss ueber `phase_complete` statt nur ueber fehlende Tool-Calls

### Wichtige Agent-Felder

```ts
type AgentDefinition = {
  id: string;
  name: string;
  description: string;
  loopStrategy: {
    initialPhase: string;
    maxTotalIterations: number;
    phases: LoopPhase[];
  };
  promptTemplates: {
    base: string;
    phases: Record<string, string>;
  };
  mcpIds?: string[];
  mcpInstructions?: Record<string, string>;
  variables?: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: "off" | "low" | "medium" | "high" | "xhigh";
  compactionPrompt?: string;
  allowedActionPolicy?: "guarded_autonomy" | "ask_on_destructive";
};

type LoopPhase = {
  name: string;
  description?: string;
  maxIterations: number;
  toolFilter?: { mode: "include" | "exclude"; toolNames: string[] };
  autoAdvance?: boolean;
  continueOnStop?: boolean;
  completionCriteria?: {
    mode: "stop" | "signal";
    signal?: string;
    requiresToolCall?: boolean;
  };
  transitions: Array<{
    to: string;
    condition:
      | { type: "no_tool_calls" }
      | { type: "max_iterations" }
      | { type: "tool_called"; toolName: string }
      | { type: "tool_result_error" }
      | { type: "phase_complete" }
      | { type: "keyword"; keyword: string }
      | { type: "always" };
  }>;
};
```

## Prompt-Building

Bei jeder Loop-Iteration wird der System-Prompt neu gebaut aus:

1. Agent-Base-Prompt
2. aktueller Phasen-Erweiterung
3. aktiven MCP-Instructions
4. Template-Variablen

Verfuegbare Standard-Variablen:

- `{{CURRENT_DATE}}`
- `{{CURRENT_TIME}}`
- `{{CURRENT_TIMESTAMP}}`
- `{{phase}}`
- `{{iteration}}`
- `{{maxIterations}}`

`GET /session/:id/prompt` liefert den echten aktuell aufgeloesten Prompt fuer die laufende Session und Phase.

## Reasoning-Modell

Reasoning ist von sichtbarem Assistant-Content getrennt.

### SessionMessage

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

- `content` ist die sichtbare Antwort fuer UI und Dialogkontext
- `reasoning` ist optionales persistiertes Thinking fuer UI und Verlauf
- altes Thinking wird nie wieder an das Modell zurueckgeschickt
- Streaming liefert weiterhin getrennte `reasoning`- und `content`-Events
- finale Session-Payloads enthalten beide Felder getrennt
- nur strukturierte `tool_calls` aus der Provider-Antwort sind executable
- pseudo-formatierte Tool-Aufrufe in Text oder Thinking werden nicht geparst, sondern intern mit begrenztem Retry korrigiert

Damit bleibt Thinking im Frontend sichtbar, ohne unnoetigen Tokenverbrauch oder Rueckkopplung alter Selbstgespraeche in spaetere Modellaufrufe.

## Context Compaction

Der Loop kompaktet Kontext automatisch, wenn die aktuelle Eingabe ungefaehr 80 Prozent des verfuegbaren Modellkontexts erreicht.

Hierarchie fuer den Compaction-Prompt:

1. Agent `compactionPrompt`
2. Provider-Model-Setting `compactionPrompt`
3. interner Default-Prompt

Wichtig:

- fuer Compaction wird nur echter Dialogkontext verwendet
- historisches `reasoning` wird nicht in den Compaction-Input uebernommen
- kompaktierte Zusammenfassungen ersetzen den alten Konversationskontext im Loop

## MCP-System

MCPs werden in `state/mcps.json` verwaltet.

Eigenschaften:

- Auto-Start beim Boot
- manueller Start/Stop pro MCP
- Instructions pro MCP
- Tool-Discovery pro laufendem MCP
- Session- und Agent-Referenzen werden beim Loeschen eines MCPs bereinigt

Wichtige Verhaltensregeln:

- MCP-Instructions werden nur aus MCPs gebaut, die wirklich `active && running` sind
- nicht laufende MCPs erscheinen nicht als verfuegbare Tools im Prompt
- geloeschte MCPs verschwinden aus Agents, Sessions und dadurch auch aus UI-Zaehlungen

## Provider / Reasoning / Temperature

Model-Settings koennen pro Modell gespeichert werden:

```ts
type ModelSettings = {
  reasoningEffort?: "off" | "low" | "medium" | "high" | "xhigh";
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
| POST | `/session/:id/compact` | Session manuell kompaktieren |

### Provider

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/provider/models` | Verfuegbare Modelle |
| GET | `/provider/model-settings` | Gespeicherte Model-Settings |
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

## State und Konfiguration

- `plugins.config.json`: versionierbare Plugin-Konfiguration
- `state/agents.json`: Agent-Definitionen
- `state/mcps.json`: MCP-Registry
- `state/provider.json`: aktives Modell und Model-Settings
- `state/`: gitignored Runtime-State

Prioritaet: `state > config > code default`
