# kk-agent-backend

Modulares Backend fuer lokale oder selbst gehostete LLM-Agents.

Der aktuelle Fokus ist ein schlanker Agent-Loop:
- System-Prompt bauen
- Modell aufrufen
- strukturierte Tool-Calls ausfuehren
- wiederholen bis Antwort oder `maxIterations`

## Plugins

```text
provider      -> Modellzugriff, Streaming, Model-Settings
tools         -> Eingebaute lokale Tools (filesystem, web-search, terminal)
mcp           -> Externe / custom MCP-Server
agent         -> Agent-Definitionen und Loop-State
systemprompt  -> Prompt-Building mit Variablen und Tool-Instructions
loop          -> Iterativer Agent-Loop mit Retry-Guards
session       -> Sessions, Chat, SSE-Streaming
```

## State

Runtime-State liegt unter `state/`:

- `agents.json`
- `defaults.json`
- `mcps.json`
- `provider.json`
- `sessions.json`
- `system-mcps.json`

## Wie der Loop funktioniert

Jede Iteration besteht aus:

1. System-Prompt aus Agent-Prompt, Tool-Instructions und Variablen bauen
2. Modell mit bisheriger Message-History und Tool-Definitionen aufrufen
3. Bei `tool_calls`: Tools ausfuehren und Tool-Ergebnisse an die History haengen
4. Bei normaler Antwort: Loop beenden

`maxIterations` ist nur eine Sicherheitsgrenze gegen endlose Tool-Loops.

## Prompt-Building

Verfuegbare Runtime-Variablen:

- `{{CURRENT_DATE}}`
- `{{CURRENT_TIME}}`
- `{{CURRENT_TIMESTAMP}}`
- `{{CURRENT_MODEL}}`
- `{{iteration}}`
- `{{maxIterations}}`

Agents koennen zusaetzlich eigene Variablen definieren.

## Tools

Es gibt zwei Tool-Quellen:

- `tools`: eingebaute System-Tools
  - `filesystem`
  - `web-search`
  - `terminal`
- `mcp`: externe / custom MCP-Server

Nach aussen werden beide im selben MCP-API-Shape zusammengefuehrt.

## Reasoning und Streaming

Assistant-Nachrichten koennen getrenntes `content` und `reasoning` enthalten.
SSE liefert aktuell folgende Events:

- `content`
- `reasoning`
- `retry_notice`
- `tool_call`
- `tool_result`
- `loop_state`
- `stats`
- `done`
- `error`

## API

### Agent

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/agent` | Alle Agents |
| POST | `/agent` | Agent erstellen |
| GET | `/agent/:id` | Agent laden |
| PUT | `/agent/:id` | Agent updaten |
| DELETE | `/agent/:id` | Agent loeschen |
| GET | `/agent/system-variables` | Verfuegbare System-Variablen |
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

### MCP

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/mcp` | System- und Custom-MCPs gemeinsam listen |
| POST | `/mcp` | Custom-MCP erstellen |
| POST | `/mcp/:id/toggle` | MCP aktivieren/deaktivieren |
| POST | `/mcp/:id/start` | MCP starten |
| POST | `/mcp/:id/stop` | MCP stoppen |
| PUT | `/mcp/:id` | MCP updaten |
| PUT | `/mcp/:id/instruction` | Instruction updaten |
| DELETE | `/mcp/:id` | Custom-MCP loeschen |
| GET | `/mcp/:id/tools` | Tools eines MCPs |

### Provider

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/provider/models` | Verfuegbare Modelle |
| PUT | `/provider/models/:modelId/settings` | Model-Settings speichern |
| POST | `/provider/switch` | Aktives Modell wechseln |
| GET | `/provider/providers` | Provider listen |
| POST | `/provider/providers` | Provider erstellen |
| PUT | `/provider/providers/:id` | Provider updaten |
| DELETE | `/provider/providers/:id` | Provider loeschen |
| POST | `/provider/providers/:id/activate` | Provider aktivieren |
| POST | `/provider/providers/:id/test` | Provider testen |

## Quick Start

```bash
npm install
npm run dev
```

Standard-Port: `3001`
