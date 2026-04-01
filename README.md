# kk-agent-backend

Modulares Backend fuer lokale oder selbst gehostete LLM-Agents.

Der aktuelle Fokus ist ein schlanker Agent-Loop:
- System-Prompt bauen
- Modell aufrufen
- strukturierte Tool-Calls ausfuehren
- wiederholen bis Antwort oder `maxIterations`

## Plugins

```text
core          -> technisches Bootstrap-Minimum fuer den Plugin-Loader
provider      -> Modellzugriff, Streaming, Model-Settings
tools         -> Interne Tools und interner Tool-State (filesystem, web-search, terminal, user-interaction, task, memory)
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
- `user-memory.json`

## Wie der Loop funktioniert

Je nach `loopMode` arbeitet der Agent als:

1. `simple` -> direkt `executing`
2. `plan_execute` -> `planning` -> `executing`
3. `full_verify` -> `planning` -> `executing` -> interne `verifying`-Phase

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
- `{{phase}}`
- `{{TASK_SUMMARY}}`
- `{{FEEDBACK}}`

Agents koennen zusaetzlich eigene Variablen definieren.

Hinweis:
- `core` ist kein fachliches HTTP-Plugin mehr, sondern nur technisches Bootstrap-Minimum.
- `src/plugins/lib` enthaelt nur noch gemeinsame Utilities wie Defaults/State-Helper, kein eigenes Plugin.

## Tools

Es gibt zwei Tool-Quellen:

- `tools`: eingebaute System-Tools
  - `filesystem`
  - `web-search`
  - `terminal`
  - `user-interaction`
  - `task`
  - `memory`
- `mcp`: externe / custom MCP-Server

Nach aussen bleiben beide getrennt:

- `/tools` -> interne Tools
- `/mcp` -> externe MCPs

## Reasoning und Streaming

Assistant-Nachrichten koennen getrenntes `content` und `reasoning` enthalten.
SSE liefert aktuell folgende Events:

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
| PATCH | `/session/:id` | Agent, Model, MCPs, Reasoning, Temperature aendern |
| POST | `/session/:id/chat` | Non-Streaming Chat |
| POST | `/session/:id/chat/stream` | SSE-Chat |
| GET | `/session/:id/prompt` | Aktuellen aufgeloesten System-Prompt lesen |
| POST | `/session/:id/prompt/respond` | Antwort fuer `ask_user`-Prompt senden |

### MCP

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/mcp` | Nur externe MCPs listen |
| POST | `/mcp` | Custom-MCP erstellen |
| POST | `/mcp/:id/toggle` | MCP aktivieren/deaktivieren |
| POST | `/mcp/:id/start` | MCP starten |
| POST | `/mcp/:id/stop` | MCP stoppen |
| PUT | `/mcp/:id` | MCP updaten |
| PUT | `/mcp/:id/instruction` | Instruction updaten |
| DELETE | `/mcp/:id` | Custom-MCP loeschen |
| GET | `/mcp/:id/tools` | Tools eines MCPs |

### Tools

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/tools` | Interne Tools listen |
| GET | `/tools/:id/tools` | Tool-Definitionen eines internen Tools |
| POST | `/tools/:id/toggle` | Internes Tool aktivieren/deaktivieren |
| PUT | `/tools/:id/instruction` | Tool-Instruktion updaten |
| PUT | `/tools/:id` | Interne Tool-Konfig updaten |
| GET | `/tools/task/session/:sessionId` | Session-Tasks lesen |
| PUT | `/tools/task/session/:sessionId` | Session-Tasks ersetzen |
| GET | `/tools/memory/user` | User-Memory lesen |
| PUT | `/tools/memory/user` | User-Memory ersetzen |
| GET | `/tools/memory/session/:sessionId` | Session-Memory lesen |
| PUT | `/tools/memory/session/:sessionId` | Session-Memory ersetzen |

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
