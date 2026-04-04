# kk-agent-backend

Modulares Backend fuer lokale oder selbst gehostete LLM-Agenten.

## Plugins

```text
core          -> technisches Bootstrap-Minimum fuer den Plugin-Loader
provider      -> Provider, Modelle, Capabilities, Streaming
tools         -> Interne Tools und interner Tool-State
mcp           -> Externe / custom MCP-Server
agent         -> Agent-Definitionen, Mode-Konfiguration, Loop-State
systemprompt  -> XML-Prompt-Building mit zentralen Systemvariablen
loop          -> Iterativer Agent-Loop
session       -> Sessions, Chat, SSE-Streaming, Uploads
```

## Zentrales Modell

- Chat-Modes: `plan` und `edit`
- Interne Tools und externe MCPs bleiben getrennt
- Agenten halten `toolIds` und `mcpIds` getrennt
- Sessions halten `activeToolIds` und `activeMcpIds` getrennt
- Task und Memory leben nur im `tools`-Plugin
- Attachments laufen ueber das interne `attachment`-Tool

## Prompt und Runtime

Der finale System-Prompt wird aus vier Ebenen gebaut:

1. globalen Prompt-Defaults
2. agent- und mode-spezifischen Overrides
3. zentral aufgeloesten Systemvariablen wie Mode, Iteration, Tasks, Memory und Tool-Zugriff
4. internen Tool- und MCP-Instructions

Wichtige Runtime-Variablen:

- `{{CURRENT_DATE}}`
- `{{CURRENT_TIME}}`
- `{{CURRENT_TIMESTAMP}}`
- `{{CURRENT_MODEL}}`
- `{{iteration}}`
- `{{maxIterations}}`
- `{{TASK_SUMMARY}}`
- `{{SESSION_MEMORY}}`
- `{{USER_MEMORY}}`
- `{{FILESYSTEM_ACCESS_SCOPE}}`
- `{{FILESYSTEM_BASE_PATH}}`
- `{{FILESYSTEM_ALLOWED_ROOT}}`
- `{{TERMINAL_ACCESS_SCOPE}}`
- `{{TERMINAL_WORKING_DIRECTORY}}`
- `{{TERMINAL_ALLOWED_ROOT}}`
- `{{TERMINAL_ELEVATION}}`

Agents koennen zusaetzlich eigene Variablen definieren.

## Interne Tools

System-Tools:

- `filesystem`
- `web-search`
- `terminal`
- `user-interaction`
- `task`
- `memory`
- `attachment`

Fuer `filesystem` und `terminal` gibt es global konfigurierbare System-Defaults. Agenten koennen diese pro Mode ueber `toolAccessScopes` und `toolInstructions` ueberschreiben.

## State

Persistenter State liegt unter `state/`:

- `agents.json`
- `defaults.json`
- `mcps.json`
- `providers.json`
- `system-mcps.json`
- `session-attachments/`
- `user-memory.json`

Sessions sind aktuell nur Runtime-State im Speicher.

## SSE-Events

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
| GET | `/agent/system-variables` | Verfuegbare Prompt-Variablen |
| GET | `/agent/loop-state/:sessionId` | Aktueller Loop-State |
| GET | `/agent/loop-state/:sessionId/stream` | Loop-State als SSE |

### Session

| Methode | Route | Beschreibung |
|---|---|---|
| POST | `/session` | Session erstellen |
| GET | `/session` | Sessions listen |
| GET | `/session/:id` | Session laden |
| PATCH | `/session/:id` | Session-Mode, Modell, Tools, MCPs oder Defaults aendern |
| DELETE | `/session/:id` | Session loeschen |
| POST | `/session/:id/chat` | Non-Streaming Chat |
| POST | `/session/:id/chat/stream` | SSE-Chat |
| POST | `/session/:id/attachments` | Upload fuer Bilder, Textdateien und PDFs |
| GET | `/session/:id/prompt` | Aktuellen finalen System-Prompt lesen |
| POST | `/session/:id/prompt/respond` | Antwort fuer `ask_user` senden |

### Tools

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/tools` | Interne Tools listen |
| GET | `/tools/:id/tools` | Tool-Definitionen eines internen Tools |
| POST | `/tools/:id/toggle` | Internes Tool aktivieren/deaktivieren |
| PUT | `/tools/:id/instruction` | Tool-Instruction updaten |
| PUT | `/tools/:id` | Tool-Konfiguration updaten |
| GET | `/tools/task/session/:sessionId` | Session-Tasks lesen |
| PUT | `/tools/task/session/:sessionId` | Session-Tasks ersetzen |
| GET | `/tools/memory/user` | User-Memory lesen |
| PUT | `/tools/memory/user` | User-Memory ersetzen |
| GET | `/tools/memory/session/:sessionId` | Session-Memory lesen |
| PUT | `/tools/memory/session/:sessionId` | Session-Memory ersetzen |

### MCP

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/mcp` | Externe MCPs listen |
| POST | `/mcp` | Custom-MCP erstellen |
| PUT | `/mcp/:id` | MCP updaten |
| PUT | `/mcp/:id/instruction` | MCP-Instruction updaten |
| POST | `/mcp/:id/toggle` | MCP aktivieren/deaktivieren |
| POST | `/mcp/:id/start` | MCP starten |
| POST | `/mcp/:id/stop` | MCP stoppen |
| DELETE | `/mcp/:id` | MCP loeschen |
| GET | `/mcp/:id/tools` | Tools eines MCPs |

### Provider

| Methode | Route | Beschreibung |
|---|---|---|
| GET | `/provider/models` | Verfuegbare Modelle und Model-Settings |
| PUT | `/provider/models/:modelId/settings` | Model-Settings speichern |
| GET | `/provider/providers` | Provider listen |
| POST | `/provider/providers` | Provider erstellen |
| PUT | `/provider/providers/:id` | Provider updaten |
| DELETE | `/provider/providers/:id` | Provider loeschen |
| POST | `/provider/providers/:id/activate` | Provider aktivieren |
| POST | `/provider/providers/:id/test` | Provider testen |

## Provider-Modell

- Provider werden nur ueber `name`, `baseUrl` und optional `apiKey` gepflegt.
- Discovery erfolgt ueber lokale Endpoints wie `/api/v1/models`, `/api/tags` oder `/v1/models`.
- Modelle melden Capabilities wie Tools, Reasoning, Streaming, Vision und Endpoint-Unterstuetzung.
- Sessions speichern `providerId`, damit laufende Chats am richtigen Backend bleiben.

## Start

```bash
npm install
npm run dev
```

Standard-Port: `3001`
