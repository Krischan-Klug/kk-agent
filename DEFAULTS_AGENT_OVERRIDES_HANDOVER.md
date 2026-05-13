# Handover: Clean Defaults- und Agent-Override-Modell

## Ziel

Defaults und Agents sollen sauber ueber Overrides funktionieren. Es gibt keine Legacy-Schicht, keine Migration im Code und keine Kompatibilitaetslogik fuer alte State-Shapes.

Stattdessen wird der `state` Ordner direkt auf das neue Format angepasst.

Grundregeln:

- Code-Defaults sind die Basis.
- `state/defaults.json` speichert nur User-Overrides gegen Code-Defaults.
- `state/agents.json` speichert nur Agent-Overrides gegen effektive Defaults.
- Backend APIs liefern weiterhin vollstaendige, effektive Objekte an das Frontend.
- Frontend darf weiterhin vollstaendige Objekte bearbeiten und speichern.
- Backend komprimiert beim Speichern automatisch auf Overrides.
- Reset to default loescht den Override, statt Default-Texte als Kopie zu speichern.
- Neue Code-Default-Aenderungen kommen automatisch bei allen nicht angepassten Defaults und Agents an.

Keine Altlasten:

- Keine `normalize...Rule(...)` Funktionen fuer einzelne Prompt-Zeilen.
- Keine Legacy-Reader.
- Keine State-Version-Migration.
- Keine Baseline-Fingerprints.
- Keine automatische Konvertierung alter full-copy State-Dateien.
- Keine Sonderlogik fuer alte `state/agents.json` Inhalte.

## Aktueller Fehler

Aktuell werden Default-Texte in Agents eingefroren:

- `kk-agent-backend/src/plugins/lib/defaults.ts`
  - `CODE_DEFAULTS` enthaelt die Code-Basis.
  - `initDefaults()` merged aktuell volle State-Defaults in die Code-Defaults.
  - `updateDefaults()` speichert aktuell den effektiven Cache wieder vollstaendig.
  - `normalizeToolUsageDescriptionRule(...)` ist eine Sonderregel und muss entfernt werden.

- `kk-agent-backend/src/plugins/agent/service.ts`
  - `buildPersistedAgent(...)` speichert komplette, normalisierte Mode-Configs.
  - Dadurch landen komplette `promptSections`, `modeInstruction`, `toolInstructions`, Arrays usw. in `state/agents.json`.

- `kk-agent-backend/src/plugins/agent/lib/mode-config.ts`
  - `normalizeModeConfig(...)` merged aktuelle Defaults mit gespeicherten full configs.
  - Alte Default-Kopien werden dadurch wie User-Overrides behandelt.

Das neue Modell behebt genau das: Persistenz enthaelt nur noch Abweichungen.

## Ziel-State

### `state/defaults.json`

Wenn keine globalen Defaults angepasst sind:

```json
{
  "overrides": {}
}
```

Wenn z. B. nur die globale Communication Section angepasst ist:

```json
{
  "overrides": {
    "agent": {
      "promptSections": {
        "communication": "Custom global communication default"
      }
    }
  }
}
```

### `state/agents.json`

Agents speichern effective Basisdaten plus Mode-Overrides. Keine full default prompt copies.

```json
{
  "agents": [
    {
      "id": "swagos",
      "name": "Swagos",
      "description": "Von Krischan entwickelter allgemeiner Agent fuer vielseitige Aufgaben.",
      "defaultModeId": "edit",
      "modes": [
        {
          "id": "plan",
          "label": "Plan",
          "behavior": "plan",
          "source": "builtin",
          "enabled": true,
          "configOverrides": {}
        },
        {
          "id": "edit",
          "label": "Edit",
          "behavior": "edit",
          "source": "builtin",
          "enabled": true,
          "configOverrides": {}
        },
        {
          "id": "autonomous",
          "label": "Autonomous",
          "behavior": "autonomous",
          "source": "builtin",
          "enabled": true,
          "configOverrides": {}
        }
      ],
      "variables": {},
      "llmRequestConfig": {
        "common": {
          "reasoningEffort": "medium"
        }
      },
      "createdAt": "2026-05-03T00:41:16.481Z",
      "updatedAt": "2026-05-03T00:41:16.481Z"
    }
  ]
}
```

Wenn ein Agent nur `communication` im Edit Mode anpasst:

```json
{
  "id": "edit",
  "label": "Edit",
  "behavior": "edit",
  "source": "builtin",
  "enabled": true,
  "configOverrides": {
    "promptSections": {
      "communication": "Custom communication for this agent"
    }
  }
}
```

## Zentrale Override-Utility

Neue Datei:

`kk-agent-backend/src/plugins/lib/overrides.ts`

API:

```ts
export type JsonObject = Record<string, unknown>;

export function applyOverrides<T>(base: T, overrides?: Partial<T>): T;

export function diffOverrides<T>(base: T, effective: T): Partial<T>;

export function hasOverride(value: unknown): boolean;

export function deepClone<T>(value: T): T;

export function deepEqual(a: unknown, b: unknown): boolean;
```

Regeln fuer `applyOverrides`:

- Base nie mutieren.
- Overrides nie mutieren.
- Objects rekursiv mergen.
- Arrays werden als Ganzes ersetzt.
- Primitives werden ersetzt.
- `undefined` bedeutet kein Override.
- `null` ist ein echter Wert, falls das Feld null erlaubt.

Regeln fuer `diffOverrides`:

- Wenn `effective` deep-equal zu `base` ist, kein Override.
- Objects rekursiv diffen.
- Leere Diff-Objects entfernen.
- Arrays deep-equal vergleichen und sonst komplett speichern.
- Strings exakt vergleichen.
- Leerer String ist ein valider Override, wenn Base nicht leer ist.
- Keys, die in `effective` existieren, aber nicht in `base`, werden gespeichert.
- Keine Tombstones einfuehren. Fuer aktuelle Datenmodelle reicht: Key fehlt = fallback auf default.

Diese Utility ist die einzige Stelle fuer generisches Override-Verhalten.

## Defaults-Service umbauen

Datei:

`kk-agent-backend/src/plugins/lib/defaults.ts`

### Ziel

Der Defaults-Service unterstuetzt nur noch das neue State-Format:

```ts
interface DefaultsState {
  overrides: Partial<AppDefaults>;
}
```

Keine Shape-Erkennung. Keine Legacy-Reads. Keine Migration.

### Konkrete Aenderungen

1. `CODE_DEFAULTS` bleibt die einzige Code-Basis.

2. `normalizeToolUsageDescriptionRule(...)` komplett entfernen.

3. `initDefaults()` vereinfachen:

```ts
export async function initDefaults(): Promise<void> {
  const state = await loadState<DefaultsState>(STATE_FILE, { overrides: {} });
  cache = applyOverrides(CODE_DEFAULTS, state.overrides);
}
```

4. `getDefaults()` bleibt:

```ts
export function getDefaults(): AppDefaults {
  return cache;
}
```

5. `updateDefaults(...)` speichert nur Diff gegen `CODE_DEFAULTS`:

```ts
export async function updateDefaults(partial: Partial<AppDefaults>): Promise<AppDefaults> {
  const effective = applyOverrides(cache, partial);
  const overrides = diffOverrides(CODE_DEFAULTS, effective);
  cache = applyOverrides(CODE_DEFAULTS, overrides);
  await saveState<DefaultsState>(STATE_FILE, { overrides });
  return cache;
}
```

Wichtig:

- Frontend kann weiterhin ein komplettes `AppDefaults` senden.
- Wenn der effective Draft wieder exakt den Code-Defaults entspricht, wird `{ "overrides": {} }` gespeichert.
- Es gibt keinen Code fuer alte full-copy `state/defaults.json` Dateien.

## Agent-Persistenz umbauen

### Contract/API

Datei:

`kk-agent-contract/src/agent.ts`

Nicht anfassen, solange die API effective Objekte beibehaelt.

`AgentDefinition`, `AgentModeDefinition` und `AgentModeConfig` bleiben das API-Modell fuer das Frontend.

### Backend-Persistenztypen

Neue Datei empfohlen:

`kk-agent-backend/src/plugins/agent/lib/persisted-types.ts`

```ts
import type {
  AgentDefinition,
  AgentModeConfig,
  AgentModeSource,
  ModeBehavior,
} from "../types.js";

export interface PersistedAgentsState {
  agents: PersistedAgentDefinition[];
}

export interface PersistedAgentDefinition
  extends Omit<AgentDefinition, "modes"> {
  modes: PersistedAgentModeDefinition[];
}

export interface PersistedAgentModeDefinition {
  id: string;
  label: string;
  behavior: ModeBehavior;
  source: AgentModeSource;
  enabled: boolean;
  configOverrides?: Partial<AgentModeConfig>;
}
```

Keine Legacy-Typen definieren.

### Mode-Expansion und Kompression

Datei:

`kk-agent-backend/src/plugins/agent/lib/mode-config.ts`

`buildDefaultModeConfig(behavior)` bleibt die Basis und baut die aktuelle effective Default-Config aus:

- `getDefaults().agent.promptSections`
- `getDefaults().agent.modeTemplates[behavior]`
- Default tool ids
- Default allowed tool names
- Default tool instructions
- Default autonomous budget

Neue Funktionen:

```ts
export function expandModeConfig(
  behavior: ModeBehavior,
  overrides?: Partial<AgentModeConfig>,
): AgentModeConfig {
  return applyOverrides(buildDefaultModeConfig(behavior), overrides);
}

export function compactModeConfig(
  behavior: ModeBehavior,
  effective: AgentModeConfig,
): Partial<AgentModeConfig> {
  return diffOverrides(buildDefaultModeConfig(behavior), effective);
}
```

`normalizeModeConfig(...)` soll keine full-copy Configs mehr als Persistenzbasis behandeln. Es darf intern noch Validierung/Normalisierung machen, aber nicht alte default copies konservieren.

### Store umbauen

Datei:

`kk-agent-backend/src/plugins/agent/lib/store.ts`

Store liest und schreibt nur noch:

```ts
interface PersistedAgentsState {
  agents: PersistedAgentDefinition[];
}
```

Kein Legacy-Read. Kein Shape-Check. Kein Migration-Code.

Wenn `state/agents.json` fehlt:

- bundled agents erzeugen
- direkt als override-only state speichern

Wenn `state/agents.json` existiert, muss es bereits im neuen Format sein.

Empfohlenes Store-Verhalten:

- intern `PersistedAgentDefinition[]` cachen
- `listAgents()` expandiert zu effective `AgentDefinition[]`
- `getAgent(id)` expandiert zu effective `AgentDefinition | undefined`
- `createAgent(agent: AgentDefinition)` kompaktiert und speichert
- `updateAgent(id, update: Partial<AgentDefinition>)` arbeitet auf effective Agent, kompaktiert danach und speichert

Zentrale Helfer:

```ts
function expandPersistedAgent(agent: PersistedAgentDefinition): AgentDefinition;

function compactEffectiveAgent(agent: AgentDefinition): PersistedAgentDefinition;

function expandPersistedMode(mode: PersistedAgentModeDefinition): AgentModeDefinition;

function compactEffectiveMode(mode: AgentModeDefinition): PersistedAgentModeDefinition;
```

### Service anpassen

Datei:

`kk-agent-backend/src/plugins/agent/service.ts`

`buildPersistedAgent(...)` in der aktuellen Form entfernen oder so umbauen, dass es keine full configs mehr speichert.

Wichtig:

- Service und Runtime bekommen effective Agents.
- Persistenz bekommt compacted Agents.
- `removeFromAllAgents(...)` muss weiter funktionieren:
  - effective Agent holen
  - effective Modes transformieren
  - ueber Store speichern
  - Store kompaktiert automatisch

## State direkt anpassen

Da es keine Migration im Code geben soll, muss der lokale `state` Ordner nach der Code-Aenderung direkt angepasst werden.

### `state/defaults.json`

Wenn nicht vorhanden, nichts tun. Der Code nutzt `{ overrides: {} }`.

Wenn vorhanden und im alten full-copy Format:

- Datei manuell auf neues Format bringen.
- Nur echte User-Overrides uebernehmen.
- Wenn keine echten User-Overrides bekannt sind:

```json
{
  "overrides": {}
}
```

### `state/agents.json`

Die aktuelle full-copy Agent-Datei muss manuell auf `configOverrides` reduziert werden.

Fuer den bestehenden Swagos Default-Agent, wenn keine echten Anpassungen gewollt sind:

- alle builtin modes behalten
- pro mode `configOverrides: {}`
- keine `config` Objekte speichern

Beispiel:

```json
{
  "agents": [
    {
      "id": "swagos",
      "name": "Swagos",
      "description": "Von Krischan entwickelter allgemeiner Agent fuer vielseitige Aufgaben.",
      "defaultModeId": "edit",
      "modes": [
        {
          "id": "plan",
          "label": "Plan",
          "behavior": "plan",
          "source": "builtin",
          "enabled": true,
          "configOverrides": {}
        },
        {
          "id": "edit",
          "label": "Edit",
          "behavior": "edit",
          "source": "builtin",
          "enabled": true,
          "configOverrides": {}
        },
        {
          "id": "autonomous",
          "label": "Autonomous",
          "behavior": "autonomous",
          "source": "builtin",
          "enabled": true,
          "configOverrides": {}
        }
      ],
      "variables": {},
      "llmRequestConfig": {
        "common": {
          "reasoningEffort": "medium"
        }
      },
      "createdAt": "2026-05-03T00:41:16.481Z",
      "updatedAt": "2026-05-03T00:41:16.481Z"
    }
  ]
}
```

Wenn echte Agent-Anpassungen existieren, diese bewusst als `configOverrides` eintragen.

## Frontend-Verhalten

Das Frontend kann weitgehend unveraendert bleiben.

Dateien zum Pruefen:

- `kk-agent-frontend/src/components/agent/AgentEditor.tsx`
- `kk-agent-frontend/src/components/agent/AgentEditor.sections.tsx`
- `kk-agent-frontend/src/components/agent/AgentEditor.helpers.ts`
- `kk-agent-frontend/src/hooks/useDefaultsForm.ts`
- `kk-agent-frontend/src/pages/settings/defaults.tsx`

Prinzip:

- API liefert effective full objects.
- Editor bearbeitet effective full objects.
- Reset-Buttons setzen Werte auf aktuelle Defaults.
- Backend erkennt beim Speichern, dass kein Override mehr existiert.
- Kein Frontend muss Persistenzdetails kennen.

Optional, nicht erforderlich:

- UI-Texte fuer "Reset removes override" nachziehen.

## Tool-Call-Description-Kontext

Die bestehende `tool_call_description` Regel bleibt in `CODE_DEFAULTS.agent.promptSections.toolUsage`.

Zu entfernen:

```ts
normalizeToolUsageDescriptionRule(...)
```

Wenn das Override-Modell korrekt ist, erscheint diese neue Code-Default-Zeile automatisch bei:

- Defaults ohne User-Override
- Agents ohne Agent-Override
- Modes ohne `promptSections.toolUsage` Override

## Tests

### Override Utility Tests

Neue Datei:

`kk-agent-backend/src/plugins/lib/overrides.test.ts`

Faelle:

- `applyOverrides` merged nested objects.
- Arrays werden komplett ersetzt.
- Base wird nicht mutiert.
- Overrides werden nicht mutiert.
- `diffOverrides` gibt `{}` fuer gleiche Werte.
- `diffOverrides` speichert geaenderte nested strings.
- Leerer String wird als Override gespeichert, wenn Base nicht leer ist.
- Gleiche Arrays erzeugen keinen Override.
- Unterschiedliche Arrays werden komplett gespeichert.
- Neu hinzugefuegte Keys werden gespeichert.

### Defaults Tests

Neue Datei:

`kk-agent-backend/src/plugins/lib/defaults.test.ts`

Faelle:

- Kein `defaults.json` -> effective Defaults entsprechen `CODE_DEFAULTS`.
- `{ overrides: {} }` -> neue Code-Defaults erscheinen.
- `toolUsage` Override bleibt erhalten.
- `updateDefaults(fullEffectiveSameAsCode)` speichert `{ overrides: {} }`.
- `updateDefaults(fullEffectiveWithOneChange)` speichert nur diese eine Aenderung.
- Kein Test fuer alte full-copy defaults.

### Agent Store / Mode Config Tests

Neue oder bestehende Tests erweitern:

- `kk-agent-backend/src/plugins/agent/lib/mode-config.test.ts`
- `kk-agent-backend/src/plugins/agent/service.test.ts`
- oder bestehende `session-resolution.test.ts`, wenn dort Agent-Runtime getestet wird.

Faelle:

- Persistierter Agent mit `configOverrides: {}` expandiert zu aktuellen Defaults.
- Agent ohne Prompt-Override bekommt neue `CODE_DEFAULTS.agent.promptSections.toolUsage`.
- Agent mit echter `toolUsage` Anpassung behaelt Anpassung.
- Reset auf Default fuehrt zu leerem `promptSections.toolUsage` Override.
- `buildDefaultModes()` erzeugt effective Modes aus aktuellen Defaults.
- Custom Mode mit `configOverrides: {}` folgt Behavior-Default.
- `state/agents.json` wird bei Save ohne full `config.promptSections` geschrieben.
- Kein Test fuer Legacy-Agenten.

### Integration / Runtime Tests

Bestehende Tests anpassen, falls sie volle gespeicherte Config erwarten.

Wichtig:

- `buildModeRuntimeConfig(...)` bekommt weiterhin effective Prompt Sections.
- Systemprompt Builder bekommt vollstaendige effective Sections.
- Session Runtime arbeitet nie mit partial configs.

## Verifikation

Mindestens ausfuehren:

```powershell
npm --workspace kk-agent-backend run lint
npm --workspace kk-agent-backend run test
npm --workspace kk-agent-frontend run lint
npm --workspace kk-agent-frontend exec tsc -- --noEmit --pretty false
```

Wenn `npm --workspace kk-agent-frontend exec tsc` nicht funktioniert:

```powershell
Set-Location kk-agent-frontend
npx tsc --noEmit --pretty false
```

## Manuelle Akzeptanzkriterien

1. Kein Legacy-Code:
   - Keine `Legacy...` Typen.
   - Keine `migrate...` Funktionen.
   - Keine State-Shape-Erkennung fuer alte full-copy Dateien.
   - Keine `normalizeToolUsageDescriptionRule(...)`.

2. Defaults:
   - `state/defaults.json` enthaelt nur `{ "overrides": ... }`.
   - Wenn overrides leer sind, zeigt Settings aktuelle `CODE_DEFAULTS`.

3. Agents:
   - `state/agents.json` enthaelt keine full `config` Objekte.
   - Modes speichern `configOverrides`.
   - Agent Editor zeigt trotzdem vollstaendige effective Config.

4. Neue Code-Defaults:
   - Neue Zeile in `CODE_DEFAULTS.agent.promptSections.toolUsage` erscheint in Defaults und Agents, solange kein entsprechender Override existiert.

5. Reset:
   - User setzt eine Section auf Default zurueck.
   - Nach Save verschwindet der Override aus `state/agents.json`.

## Nicht-Ziele

- Kein neues Prompt-System.
- Kein neues Settings-UI-Konzept.
- Kein Breaking Contract fuer Frontend-API.
- Keine Migration.
- Keine Kompatibilitaet mit alten State-Dateien.
- Keine Vollkopien von effective Default-Prompt-Sections in neuen State-Dateien.
- Keine Vermischung von internen Tools und externen MCPs.

## Betroffene Dateien

Backend:

- `kk-agent-backend/src/plugins/lib/overrides.ts` neu
- `kk-agent-backend/src/plugins/lib/overrides.test.ts` neu
- `kk-agent-backend/src/plugins/lib/defaults.ts`
- `kk-agent-backend/src/plugins/agent/lib/store.ts`
- `kk-agent-backend/src/plugins/agent/lib/persisted-types.ts` neu empfohlen
- `kk-agent-backend/src/plugins/agent/lib/mode-config.ts`
- `kk-agent-backend/src/plugins/agent/lib/defaults.ts`
- `kk-agent-backend/src/plugins/agent/service.ts`
- Tests unter `kk-agent-backend/src/plugins/agent/**`

Frontend:

- Wahrscheinlich keine zwingenden Aenderungen.
- Pruefen:
  - `kk-agent-frontend/src/components/agent/AgentEditor.tsx`
  - `kk-agent-frontend/src/components/agent/AgentEditor.sections.tsx`
  - `kk-agent-frontend/src/hooks/useDefaultsForm.ts`
  - `kk-agent-frontend/src/pages/settings/defaults.tsx`

State:

- `state/defaults.json` direkt auf `{ "overrides": ... }` bringen, falls vorhanden.
- `state/agents.json` direkt auf `configOverrides` Format bringen.

Contract:

- Nicht anfassen, solange API effective Objekte beibehaelt.

## Ausfuehrungsreihenfolge fuer Kimi

1. Override Utility mit Tests implementieren.
2. Defaults-Service auf clean override-only State umbauen.
3. `normalizeToolUsageDescriptionRule(...)` entfernen.
4. Persisted-Agent-Typen einfuehren.
5. Mode expand/compact Funktionen einbauen.
6. Agent Store/Service auf effective API + override-only persistence umbauen.
7. Lokale `state/defaults.json` und `state/agents.json` direkt auf das neue Format anpassen.
8. Bestehende Tests fixen und neue Tests ergaenzen.
9. Backend lint/test laufen lassen.
10. Frontend lint/typecheck laufen lassen.
11. Manuell pruefen, dass `state/*.json` keine full Default-Prompt-Kopien mehr enthaelt.

