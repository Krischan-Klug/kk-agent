import { loadState, saveState } from "./state.js";

const STATE_FILE = "defaults.json";

/* ── Types ── */

export interface AppDefaults {
  agent: {
    systemPrompt: string;
    maxIterations: number;
    loopMode: "simple" | "plan_execute" | "full_verify";
    phasePrompts: {
      planningPrompt: string;
      executingPrompt: string;
      verifyingPrompt: string;
    };
    phaseGuidance: {
      planning: string;
      executing: string;
      verifying: string;
    };
    promptSections: {
      taskWithSession: string;
      memoryWithSession: string;
      toolRulesWithSession: string;
    };
  };
  loop: {
    verificationInstruction: string;
    verificationRetryMessage: string;
  };
  retry: {
    emptyResponseInstruction: string;
    invalidToolInstruction: string;
  };
  reasoning: {
    defaultEffort: string;
  };
  attachment: {
    visionNotSupportedInstruction: string;
  };
}

/* ── Code-Fallbacks ── */

const CODE_DEFAULTS: AppDefaults = {
  agent: {
    systemPrompt: `<identity>
Du bist Swagos, ein KI-Assistent entwickelt von Krischan.
Deine primaere Aufgabe ist: In allen Bereichen voll zu unterstuetzen.

Das aktuelle Datum und Uhrzeit ist: {{CURRENT_DATE}} {{CURRENT_TIME}}.
Das aktuell verwendete Modell ist: {{CURRENT_MODEL}}.
</identity>

<values>
Diese Prinzipien leiten all dein Handeln - in dieser Prioritaet:

1. SICHERHEIT: Vermeide Schaden fuer den Nutzer und Dritte.
2. EHRLICHKEIT: Gib Unsicherheit klar zu. Erfinde keine Fakten.
3. HILFSBEREITSCHAFT: Beantworte Fragen vollstaendig und nuetzlich.
4. EFFIZIENZ: Fasse dich praezise. Kein Fuelltext.
</values>

<capabilities>

Was du technisch kannst:

- Bilder analysieren
- Web Suche
- Datei System Zugriff
- Terminal Zugriff
- Tool-Calls ausfuehren


Wenn du dir bei etwas unsicher bist, sage es. Spekuliere nicht als Fakt.
</capabilities>

<behavior>
SPRACHE:
- Antworte in der Sprache des Nutzers

TON:
- Professionell aber zugaenglich
- Direkt, keine uebertriebene Hoeflichkeit
- Keine Schmeichelei ("Tolle Frage!" -> verboten)

FORMAT:
- Markdown Format für Texte
- Kurze Fragen -> kurze Antworten
- Komplexe Aufgaben -> Schritt-fuer-Schritt mit Markdown mit Sprach-Tag
- Code immer in Codebloecken mit Sprach-Tag
- Listen nur wenn wirklich listenfoermig, sonst Fliesstext

ANTWORTSTRUKTUR bei komplexen Aufgaben:
1. Kurze Einschaetzung (1-2 Saetze)
2. Vorgehen / Loesung
3. Ergebnis
4. Offene Fragen oder Caveats (falls noetig)

NACHFRAGEN:
- Frage nur wenn wirklich unklar und nicht aus Kontext ableitbar
- Verwende IMMER ask_user tool für nachfragen
</behavior>`,
    maxIterations: 10,
    loopMode: "simple",
    phasePrompts: {
      planningPrompt: [
        "Plane zuerst kurz die Arbeit, bevor du groessere Schritte ausfuehrst.",
        "Teile mehrschrittige Aufgaben in klare, konkrete Teilaufgaben auf.",
        "Wenn sinnvoll, halte den Plan ueber Tasks aktuell.",
      ].join("\n"),
      executingPrompt: [
        "Fuehre die Aufgabe jetzt gezielt aus.",
        "Nutze verfuegbare Tools proaktiv und halte den Fortschritt konsistent.",
        "Bleibe direkt, effizient und nah an der Nutzeraufgabe.",
      ].join("\n"),
      verifyingPrompt: [
        "Pruefe das bisherige Ergebnis kritisch, statt neue Arbeit anzufangen.",
        "Suche offene Punkte, Widersprueche, fehlende Verifikation oder unerledigte Tasks.",
        "Wenn alles erledigt ist, bestaetige das knapp und ehrlich.",
      ].join("\n"),
    },
    phaseGuidance: {
      planning: [
        "Plane zuerst die Arbeit, bevor du sie ausfuehrst.",
        "Lege bei groesseren Aufgaben strukturierte Tasks an.",
        "Gehe noch nicht in die Abschlusskommunikation.",
      ].join("\n"),
      executing: [
        "Fuehre den Plan aus und nutze Tools gezielt.",
        "Halte Tasks und Zwischenstand konsistent.",
      ].join("\n"),
      verifying: [
        "Pruefe das bisherige Ergebnis kritisch.",
        "Suche Widersprueche, offene Punkte und fehlende Verifikation.",
        "Wenn noch Arbeit offen ist, benenne sie konkret statt voreilig abzuschliessen.",
      ].join("\n"),
    },
    promptSections: {
      taskWithSession: [
        "Nutze Tasks fuer mehrschrittige Arbeiten.",
        "Halte genau einen sinnvollen Task auf in_progress, wenn aktiv gearbeitet wird.",
      ].join("\n"),
      memoryWithSession: [
        "Session-Memory ist nur fuer den aktuellen Verlauf relevant.",
        "User-Memory enthaelt laengerfristige Praeferenzen oder Fakten.",
      ].join("\n"),
      toolRulesWithSession: [
        "Nutze das spezifischste Tool.",
        "Lange Tool-Ergebnisse werden fuer den Modellkontext gekuerzt.",
        "Nutze update_tasks fuer strukturierte Arbeitsschritte.",
        "Nutze remember_facts nur fuer wirklich relevante Session- oder User-Fakten.",
      ].join("\n"),
    },
  },
  loop: {
    verificationInstruction: [
      "Du bist jetzt in der Verifikationsphase.",
      "Pruefe kritisch, ob das bisherige Ergebnis die Aufgabe wirklich geloest hat.",
      "Wenn alles passt, antworte exakt mit 'VERIFY_OK'.",
      "Wenn noch Arbeit offen ist, antworte exakt mit 'VERIFY_RETRY: <kurze konkrete Anweisung>'.",
      "Beginne niemals neue Tool-Calls in dieser Phase.",
      "Beruecksichtige dabei auch die aktuellen Tasks:",
      "{{TASK_SUMMARY}}",
    ].join("\n"),
    verificationRetryMessage: "Verifikation meldet noch offene Arbeit: {{FEEDBACK}}",
  },
  retry: {
    emptyResponseInstruction: "Your last attempt was empty or contained no meaningful content. Provide either a substantive response or a real structured tool_call. Do not respond with empty content.",
    invalidToolInstruction: "Your last attempt output a tool call as plain text or thinking instead of a structured tool_call. Tools must be invoked exclusively via structured tool_calls in the API. Reply with a normal response or send a real structured tool call.",
  },
  reasoning: {
    defaultEffort: "medium",
  },
  attachment: {
    visionNotSupportedInstruction: "Der Nutzer hat ein Bild angehaengt, aber das aktuelle Modell unterstuetzt keine Bilderkennung. Informiere den Nutzer darueber und schlage vor, ein vision-faehiges Modell zu verwenden.",
  },
};

/* ── Cache ── */

let cache: AppDefaults = { ...CODE_DEFAULTS };

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null
    ) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/* ── Public API ── */

export async function initDefaults(): Promise<void> {
  const stored = await loadState<Partial<AppDefaults>>(STATE_FILE, {});
  cache = deepMerge(CODE_DEFAULTS as unknown as Record<string, unknown>, stored as Record<string, unknown>) as unknown as AppDefaults;
}

export function getDefaults(): AppDefaults {
  return cache;
}

export async function updateDefaults(partial: Partial<AppDefaults>): Promise<AppDefaults> {
  cache = deepMerge(cache as unknown as Record<string, unknown>, partial as Record<string, unknown>) as unknown as AppDefaults;
  await saveState(STATE_FILE, cache);
  return cache;
}
