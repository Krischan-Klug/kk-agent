# kk-agent-backend

Modulares Multi-Agent Backend. Verbindet lokale LLMs mit MCP-Tools und orchestriert sie in konfigurierbaren, phasen-basierten Agent-Loops.

---

## Architektur

```
                         ┌─────────────────────────────┐
                         │         HTTP / SSE           │
                         │        (Port 3001)           │
                         └──────────┬──────────────────┘
                                    │
┌───────────────────────────────────┼───────────────────────────────────┐
│                            Plugin-System                              │
│                                                                       │
│   ┌─────────┐    ┌──────────────┐    ┌─────────┐    ┌─────────────┐  │
│   │ provider │    │    agent     │    │   mcp   │    │ systemprompt│  │
│   │          │    │              │    │         │    │             │  │
│   │ LLM-API  │    │ Definitionen │    │ Tools   │    │ Prompt-     │  │
│   │ Streaming │    │ Phasen-Loop  │    │ Registry│    │ Builder     │  │
│   └────┬─────┘    └──────┬───────┘    └────┬────┘    └──────┬──────┘  │
│        │                 │                 │                │         │
│        └────────┬────────┴─────────────────┴────────┬───────┘         │
│                 │                                   │                 │
│            ┌────▼────┐                         ┌────▼─────┐           │
│            │  loop   │                         │ session  │           │
│            │         │◄────────────────────────│          │           │
│            │ Phased  │                         │ Chat,    │           │
│            │ Agent   │                         │ Stream,  │           │
│            │ Loop    │                         │ State    │           │
│            └─────────┘                         └──────────┘           │
└───────────────────────────────────────────────────────────────────────┘
```

Jedes Plugin wird über `plugins.config.json` aktiviert. Abhängigkeiten werden automatisch topologisch aufgelöst.

---

## Agent-System

Ein **Agent** definiert *wie* das LLM arbeitet — nicht *was* es tut (das kommt vom User).

### Datenmodell

```
AgentDefinition
├── name, description
├── loopStrategy
│   ├── initialPhase: "analyze"
│   ├── maxTotalIterations: 30
│   └── phases[]
│       ├── name: "analyze"
│       ├── maxIterations: 3
│       ├── toolFilter: { mode: "include", toolNames: [...] }
│       ├── transitions[]
│       │   ├── { to: "implement", condition: { type: "no_tool_calls" } }
│       │   └── { to: "implement", condition: { type: "max_iterations" } }
│       └── autoAdvance: false
├── promptTemplates
│   ├── base: "Du bist ein erfahrener Entwickler..."
│   └── phases: { analyze: "Du bist in der ANALYSE-Phase ({{iteration}}/{{maxIterations}})..." }
├── mcpIds: ["filesystem"]
├── mcpInstructions: { "filesystem": "Erstelle Backups vor Änderungen." }
└── variables: { "PROJECT_NAME": "mein-projekt" }
```

### Phasen-Loop

```
User-Nachricht
    │
    ▼
┌──────────────────────────────────────────────┐
│  Phase: analyze                              │
│                                              │
│  1. System-Prompt = base + phase + MCP-Instr │
│  2. Tools = alle Tools, gefiltert nach Phase │
│  3. LLM aufrufen (streaming)                 │
│  4. Tool-Calls ausführen (MCP)               │
│  5. Transition prüfen:                       │
│     ├── no_tool_calls → implement            │
│     ├── max_iterations → implement           │
│     ├── tool_called("X") → ...               │
│     ├── keyword("DONE") → ...                │
│     └── always → ...                         │
│  6. Phase wechseln oder weiter iterieren     │
└──────────────────────────────────────────────┘
```

Bei jedem Phasenwechsel wird der System-Prompt **komplett neu gebaut**: Agent-Base-Prompt + Phasen-Erweiterung + MCP-Instructions. Template-Variablen (`{{iteration}}`, `{{CURRENT_DATE}}`, custom) werden aufgelöst.

### Template-Variablen

Automatisch verfügbar in Base- und Phasen-Prompts:

| Variable | Wert |
|----------|------|
| `{{CURRENT_DATE}}` | "Dienstag, 18. März 2026" |
| `{{CURRENT_TIME}}` | "14:30:00" |
| `{{CURRENT_TIMESTAMP}}` | ISO 8601 |
| `{{phase}}` | Aktuelle Phase |
| `{{iteration}}` | Iteration in der Phase |
| `{{maxIterations}}` | Max. Iterationen der Phase |

Custom-Variablen pro Agent (z.B. `{{PROJECT_NAME}}`) werden im Agent-Editor definiert und überschreiben System-Variablen bei Namensgleichheit.

### Transition-Bedingungen

| Typ | Auslöser |
|-----|----------|
| `no_tool_calls` | LLM antwortet ohne Tool-Call |
| `max_iterations` | Phase-Limit erreicht |
| `tool_called` | Bestimmtes Tool wurde gerufen |
| `keyword` | Keyword im LLM-Output |
| `always` | Immer (Fallback) |

---

## Plugins

| Plugin | Funktion |
|--------|----------|
| **provider** | LLM-Anbindung. OpenAI-kompatibel (`/v1/chat/completions`). Streaming, `<think>`-Tag-Erkennung. |
| **mcp** | MCP-Server-Registry. Startet Tools (stdio/SSE), CRUD via REST. |
| **agent** | Agent-Definitionen. CRUD, Loop-State SSE-Stream, Phasen-Graph. |
| **loop** | Phasen-basierter Agent-Loop. Kein REST — wird intern von session aufgerufen. |
| **systemprompt** | Prompt-Builder. Base + Phase + MCP-Instructions + Variablen. |
| **session** | Sessions. Chat/Stream, verdrahtet alle Plugins. Jede Session gehört einem Agent. |

---

## API

### Agent

| Methode | Route | Beschreibung |
|---------|-------|-------------|
| GET | `/agent` | Alle Agents |
| POST | `/agent` | Agent erstellen |
| GET | `/agent/:id` | Agent Details |
| PUT | `/agent/:id` | Agent updaten |
| DELETE | `/agent/:id` | Agent löschen |
| GET | `/agent/loop-state/:sessionId` | Aktueller Loop-State |
| GET | `/agent/loop-state/:sessionId/stream` | Loop-State SSE-Stream |

### Session

| Methode | Route | Beschreibung |
|---------|-------|-------------|
| POST | `/session` | Session erstellen (`{ agentId, model?, activeMcpIds? }`) |
| GET | `/session` | Alle Sessions |
| DELETE | `/session/:id` | Session löschen |
| POST | `/session/:id/chat/stream` | SSE-Chat (`content`, `reasoning`, `tool_call`, `tool_result`, `phase_change`, `loop_state`, `done`, `error`) |

### Provider / MCP

| Methode | Route | Beschreibung |
|---------|-------|-------------|
| GET | `/provider/models` | Verfügbare Modelle |
| POST | `/provider/switch` | Model wechseln |
| GET | `/mcp` | Alle MCPs mit Tools |
| POST | `/mcp` | MCP erstellen |

---

## Quick Start

```bash
npm install
cp .env.example .env   # LLM_BASE_URL anpassen
npm run dev             # Port 3001
```

Voraussetzungen: Node.js >= 18, ein LLM-Endpoint (LM Studio, Ollama, vLLM, etc.).

---

## State & Config

- **`plugins.config.json`** — Versionierbar. Welche Plugins aktiv, Endpoint-URLs, Seeds.
- **`state/`** — Gitignored. Runtime-State: aktives Model, MCP-Registry, Agent-Definitionen, Prompts.
- **Priorität:** State > Config > Code-Default.
# kk-agent-backend
