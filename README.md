# kk-agent-backend

Modulares Backend fuer lokale oder selbst gehostete LLMs. Agenten mit System-Prompt, Iterations-Loop, MCP-Tools, Streaming und automatischer Context-Compaction.

## Architektur

```text
HTTP / SSE
  |
  +-- provider      -> Modellzugriff, Streaming, Model-Settings
  +-- mcp           -> MCP-Registry, Tool-Lifecycle, Tool-Execution
  +-- agent         -> Agent-Definitionen, Runtime-Loop-State
  +-- systemprompt  -> Prompt-Building mit Variablen und MCP-Instructions
  +-- loop          -> Agent-Loop, Compaction, Tool-Retry
  `-- session       -> Persistenz, Chat, Stream, Session-Kontext
```

Runtime-State liegt unter `state/`:

- `state/agents.json`
- `state/sessions.json`
- `state/mcps.json`
- `state/provider.json`

## Wie der Agent-Loop funktioniert

Ein LLM ist grundsaetzlich stateless: Prompt rein, Antwort raus. Ein Agent entsteht erst dadurch, dass man die LLM **in einer Schleife** aufruft und ihr zwischen den Aufrufen Tool-Ergebnisse zurueckgibt.

### Der komplette Ablauf

```
User tippt Nachricht
        |
        v
System-Prompt wird gebaut
  (Agent-Base-Prompt + MCP-Instructions + Template-Variablen)
        |
        v
+------- ITERATION-LOOP (max N mal) --------+
|                                            |
|  [System-Prompt] + [bisherige Messages]    |
|  + [Tool-Definitionen als JSON-Schema]     |
|         |                                  |
|         v                                  |
|     LLM-API-Call (OpenAI-kompatibel)       |
|         |                                  |
|         v                                  |
|  Antwort hat finish_reason:                |
|                                            |
|  "stop" ---> LLM ist fertig               |
|              Loop ENDET                    |
|                                            |
|  "tool_calls" ---> LLM will Tools nutzen   |
|              Tools ausfuehren              |
|              Ergebnis in Message-History    |
|              --> NAECHSTE ITERATION         |
|                                            |
+--------------------------------------------+
        |
        v
Fertige Antwort --> an User streamen (SSE)
```

### Warum die LLM "iteriert"

Die LLM weiss nicht, dass sie in einem Loop laeuft. Jede Iteration ist ein eigenstaendiger API-Call. Was die LLM sieht:

1. **System-Prompt** — Wer sie ist und was sie kann
2. **Chat-History** — Alle bisherigen Nachrichten (inkl. Tool-Ergebnisse frueherer Iterationen)
3. **Tool-Definitionen** — JSON-Schemas der verfuegbaren Tools (z.B. `read_file`, `list_directory`, `web_search`)

Die LLM entscheidet dann selbst:

- **"Ich brauche mehr Infos"** → Sie gibt einen strukturierten `tool_call` zurueck (z.B. `read_file({path: "src/index.ts"})`). Die API meldet `finish_reason: "tool_calls"`.
- **"Ich habe genug"** → Sie gibt eine normale Textantwort. Die API meldet `finish_reason: "stop"`.

Der Loop im Backend (`agent-loop.ts`) prueft nach jedem LLM-Call den `finish_reason`:

```ts
while (iteration < maxIterations) {
  const response = await callLLM(systemPrompt, messages, tools);

  if (response.finishReason === "tool_calls") {
    // Tools ausfuehren, Ergebnisse in messages pushen
    for (const tc of response.tool_calls) {
      const result = await executeTool(tc.name, tc.arguments);
      messages.push({ role: "tool", content: result, tool_call_id: tc.id });
    }
    // --> naechste Iteration
  } else {
    // "stop" oder andere Gruende --> fertig
    break;
  }
}
```

**Das ist die gesamte "Magie".** Kein spezielles Agenten-Protokoll, kein Zustandsautomat. Nur eine While-Schleife, die nach Tool-Calls erneut die LLM aufruft — mit den Tool-Ergebnissen in der History.

### Was `maxIterations` bewirkt

`maxIterations` ist eine Sicherheitsgrenze. Wenn die LLM endlos Tools aufrufen wuerde (z.B. immer wieder dieselbe Datei lesen), stoppt der Loop nach N Iterationen. Typische Werte:

- **5** — Fuer einfache Agents (Frage → 1-2 Tool-Calls → Antwort)
- **10** — Standard. Reicht fuer die meisten Aufgaben.
- **20-30** — Fuer komplexe Coding-Agents, die viele Dateien lesen/schreiben muessen.

Die LLM kann jederzeit frueher aufhoeren. `maxIterations` ist nur das obere Limit.

### Fehlerbehandlung im Loop

Der Loop hat drei eingebaute Retry-Mechanismen:

| Problem | Erkennung | Aktion |
|---------|-----------|--------|
| LLM gibt Tool-Call als Text statt strukturiert aus | Regex-Pattern auf `<tool_call>`, `<function=` etc. | Korrektur-Instruction, max 2 Retries |
| LLM gibt leere Antwort | `finish_reason: "stop"` + leerer Content | Retry-Instruction, max 1 Retry |
| Antwort wird wegen Token-Limit abgeschnitten | `finish_reason: "length"` | Fortfuehrungs-Instruction, max 1 Retry |

## Context Compaction

LLMs haben ein begrenztes Context-Window (z.B. 8K, 32K, 128K Tokens). Bei langen Konversationen oder vielen Tool-Calls kann der Kontext zu gross werden. Compaction komprimiert ihn automatisch.

### Wann wird komprimiert

```
inputTokens >= maxContextTokens * compactionThreshold
```

- `maxContextTokens` kommt aus der Model-Info (z.B. 32768 fuer ein 32K-Modell)
- `compactionThreshold` ist pro Agent konfigurierbar (default: 0.8 = 80%)
- Niedrigerer Threshold = fruehere Komprimierung = mehr Platz, aber haeufigerer Info-Verlust
- Hoeherer Threshold = spaetere Komprimierung = mehr Originalkontext, aber naeher am Limit

### Was bei Compaction passiert

1. **Separater LLM-Call**: Die gesamte bisherige Konversation wird an einen Compaction-Prompt geschickt
2. **Strukturierte Summary**: Die LLM erzeugt eine kompakte Zusammenfassung (Task, Decisions, Progress, Pending, Key Details)
3. **Letzte User-Nachricht bleibt erhalten**: Sie wird separat nach der Summary angehaengt, damit die LLM weiss, was der User zuletzt wollte
4. **POST_COMPACTION_INSTRUCTION**: Eine System-Nachricht weist die LLM an, nahtlos weiterzumachen — keine Begruessung, keine Meta-Antwort
5. **Input-Token-Counter wird zurueckgesetzt**: Nach Compaction zaehlt der Threshold von vorne

### Was erhalten bleibt

- **Sichtbarer Session-Verlauf**: Bleibt komplett. Compaction betrifft nur den internen Modell-Kontext.
- **Compaction-Marker**: Im sichtbaren Verlauf erscheint ein neutraler System-Eintrag ("Kontext komprimiert bei Iteration X/Y").
- **Letzte User-Nachricht**: Wird immer explizit nach der Summary eingefuegt.

### Compaction-Prompt

Prioritaet:

1. Agent `compactionPrompt` (per Agent konfigurierbar)
2. Provider-Model-Setting `compactionPrompt`
3. Interner Default-Prompt

## Prompt-Building

Der System-Prompt wird pro Iteration neu aufgebaut aus:

1. Agent-Base-Prompt
2. MCP-Instructions der laufenden MCPs
3. Template-Variablen

Standard-Variablen:

- `{{CURRENT_DATE}}` — z.B. "Sonntag, 22. Maerz 2026"
- `{{CURRENT_TIME}}`
- `{{CURRENT_TIMESTAMP}}`
- `{{iteration}}` — aktuelle Iteration im Loop
- `{{maxIterations}}` — maximale Iterationen

Eigene Variablen koennen pro Agent definiert werden und sind im System-Prompt als `{{VAR_NAME}}` verfuegbar.

## Reasoning und Tool-Protokoll

```ts
type SessionMessage = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  kind?: "compaction";
  reasoning?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
};
```

Regeln:

- `content` ist die sichtbare Antwort und einziger Assistant-Text im Dialogkontext
- `reasoning` bleibt fuer UI und Verlauf erhalten, wird aber nicht erneut ans Modell geschickt
- `system`-Nachrichten mit `kind: "compaction"` sind Verlaufshinweise, kein Dialogkontext
- Streaming liefert getrennte `content`- und `reasoning`-Events (SSE)
- Nur strukturierte `tool_calls` aus der Provider-Antwort werden ausgefuehrt
- Pseudo-formatierte Tool-Aufrufe in Text oder Thinking werden mit begrenztem Retry korrigiert

## MCP-System

MCPs (Model Context Protocol Server) werden in `state/mcps.json` verwaltet.

Verhalten:

- Auto-Start beim Boot
- Manueller Start/Stop pro MCP
- Tool-Discovery pro laufendem MCP
- MCP-Instructions nur fuer `active && running`
- Geloeschte MCPs werden aus Agents und Sessions entfernt

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
- Erreichbarer LLM-Endpoint, z.B. LM Studio

Standard-Port: `3001`
