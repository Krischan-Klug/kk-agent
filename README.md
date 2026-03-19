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
│   │ Settings  │    │ Compaction   │    │AutoStart│    │             │  │
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
├── variables: { "PROJECT_NAME": "mein-projekt" }
├── defaultModel?: string
├── reasoningEffort?: "off" | "low" | "medium" | "high" | "on"
└── compactionPrompt?: string   // Custom Context-Compaction Prompt (opt-in)
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
│  5. Context-Check: ≥80% → Compaction         │
│  6. Transition prüfen:                       │
│     ├── no_tool_calls → implement            │
│     ├── max_iterations → implement           │
│     ├── tool_called("X") → ...               │
│     ├── keyword("DONE") → ...                │
│     └── always → ...                         │
│  7. Phase wechseln oder weiter iterieren     │
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

## Reasoning & Temperature

### ModelSettings (pro Model)

Über die Provider-API können pro Model Einstellungen gespeichert werden:

```
ModelSettings
├── reasoningEffort?: "off" | "low" | "medium" | "high" | "on"  // Default-Level
├── levels?: Record<string, ReasoningLevelConfig>                // Pro-Level Overrides
│   └── { temperature?: number, maxOutputTokens?: number }
└── compactionPrompt?: string                                    // Opt-in Compaction Prompt
```

### Reasoning Level Defaults

Alle Level haben `temperature: 1.0` als Default (Mitte des 0–2 Bereichs):

| Level | Temperature | Max Output Tokens |
|-------|-------------|-------------------|
| off | 1.0 | — |
| low | 1.0 | 4096 |
| medium | 1.0 | 8192 |
| high | 1.0 | 16384 |
| on | 1.0 | unlimited (-1) |

### Hierarchie

**Reasoning Effort**: Session-Override > Model-Default > Agent-Default
**Temperature**: Session-Override > Level-Config > Level-Default (1.0)
**Compaction Prompt**: Agent > Model (Provider) > Default

---

## Context Compaction

Automatische Kontextkomprimierung bei 80% Context-Auslastung (konfigurierbar).

### Ablauf

1. Nach jedem LLM-Call prüft der Loop: `inputTokens ≥ maxContextTokens × 0.8`
2. Wenn ja: Separater LLM-Call mit Compaction-Prompt
3. Alle bisherigen Messages werden durch eine komprimierte Summary ersetzt
4. Loop läuft mit reduziertem Context weiter

### Compaction-Prompt Hierarchie

1. **Agent** (`compactionPrompt` in AgentDefinition) — höchste Priorität
2. **Provider** (`compactionPrompt` in ModelSettings) — mittlere Priorität
3. **Default** — tokeneffizientes Summary-Format (Task/Decisions/Progress/Pending/Key Details)

---

## MCP Auto-Start

Beim Server-Start werden **alle konfigurierten MCPs** automatisch gestartet und auf `active: true` gesetzt. Fehlschläge werden geloggt, blockieren aber nicht den Start.

---

## Plugins

| Plugin | Funktion |
|--------|----------|
| **provider** | LLM-Anbindung. OpenAI-kompatibel (`/v1/chat/completions`). Streaming, `<think>`-Tag-Erkennung, ModelSettings (Reasoning, Temperature). |
| **mcp** | MCP-Server-Registry. Startet Tools (stdio/SSE), CRUD via REST, Auto-Start beim Boot. |
| **agent** | Agent-Definitionen. CRUD, Loop-State SSE-Stream, Phasen-Graph, Compaction-Prompt. |
| **loop** | Phasen-basierter Agent-Loop. Context Compaction bei 80% Auslastung. Kein REST — wird intern von session aufgerufen. |
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
| GET | `/session/:id` | Session Details |
| DELETE | `/session/:id` | Session löschen |
| PATCH | `/session/:id` | Session updaten (`model`, `activeMcpIds`, `reasoningEffort`, `temperature`) |
| POST | `/session/:id/chat` | Chat (non-streaming) |
| POST | `/session/:id/chat/stream` | SSE-Chat (`content`, `reasoning`, `tool_call`, `tool_result`, `phase_change`, `loop_state`, `stats`, `done`, `error`) |
| GET | `/session/:id/prompt` | Aktuellen System-Prompt abrufen |
| POST | `/session/:id/compact` | Context manuell komprimieren |

### Provider

| Methode | Route | Beschreibung |
|---------|-------|-------------|
| GET | `/provider/models` | Verfügbare Modelle + ModelSettings |
| GET | `/provider/model-settings` | Alle ModelSettings |
| PUT | `/provider/models/:modelId/settings` | ModelSettings setzen (reasoningEffort, levels, compactionPrompt) |
| POST | `/provider/switch` | Aktives Model wechseln |

### MCP

| Methode | Route | Beschreibung |
|---------|-------|-------------|
| GET | `/mcp` | Alle MCPs mit Status + Tools |
| POST | `/mcp` | MCP erstellen |
| POST | `/mcp/:id/toggle` | MCP aktivieren/deaktivieren |
| POST | `/mcp/:id/start` | MCP manuell starten |
| POST | `/mcp/:id/stop` | MCP manuell stoppen |
| PUT | `/mcp/:id` | MCP updaten |
| PUT | `/mcp/:id/instruction` | MCP Instruction updaten |
| DELETE | `/mcp/:id` | MCP löschen |
| GET | `/mcp/:id/tools` | Tools eines MCPs |

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
- **`state/`** — Gitignored. Runtime-State: aktives Model, MCP-Registry, Agent-Definitionen, ModelSettings, Prompts.
- **Priorität:** State > Config > Code-Default.
