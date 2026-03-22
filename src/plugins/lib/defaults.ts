import { loadState, saveState } from "./state.js";

const STATE_FILE = "defaults.json";

/* ── Types ── */

export interface AppDefaults {
  agent: {
    systemPrompt: string;
    maxIterations: number;
    compactionThreshold: number;
  };
  compaction: {
    prompt: string;
    postInstruction: string;
  };
  retry: {
    emptyResponseInstruction: string;
    invalidToolInstruction: string;
    lengthInstruction: string;
  };
  reasoning: {
    defaultEffort: string;
  };
}

/* ── Code-Fallbacks ── */

const CODE_DEFAULTS: AppDefaults = {
  agent: {
    systemPrompt: "Du bist ein hilfreicher Assistent.",
    maxIterations: 10,
    compactionThreshold: 0.8,
  },
  compaction: {
    prompt: `You are a context compaction system. Your task is to create a dense, lossless summary of the conversation below.

Rules:
- Preserve ALL facts, decisions, code changes, file paths, variable names, and error messages exactly
- Preserve the current task state: what was asked, what was done, what remains
- Preserve any user preferences, corrections, or constraints mentioned
- Strip redundant back-and-forth, greetings, acknowledgments, and verbose explanations
- Use compact notation: bullet points, key:value pairs, abbreviated references
- For code changes: note file path + what changed (not full code unless critical)
- For tool results: keep only the essential output, not raw dumps
- Output must be significantly shorter than input while losing zero critical information
- Write in the same language the conversation uses

Format your summary as:
## Task
[What the user wants accomplished]

## Decisions & Constraints
[Key decisions made, user preferences, corrections]

## Progress
[What was done, files changed, current state]

## Pending
[What still needs to be done]

## Key Details
[Critical code snippets, error messages, specific values that must not be lost]`,
    postInstruction: [
      "Der vorherige Kontext wurde intern komprimiert.",
      "Die kompaktierte Summary ist interner Arbeitskontext und keine neue Nutzernachricht.",
      "Fuehre dieselbe Aufgabe weiter.",
      "Beginne nicht neu, wiederhole keine Begruessung und gib keine Meta-Antwort zur Compaction.",
    ].join(" "),
  },
  retry: {
    emptyResponseInstruction: [
      "Dein letzter Versuch war leer oder praktisch inhaltslos.",
      "Gib jetzt entweder eine normale inhaltliche Antwort oder einen echten strukturierten tool_call aus.",
      "Antworte nicht leer und wiederhole keine Meta-Ausgabe.",
    ].join(" "),
    invalidToolInstruction: [
      "Dein letzter Versuch hat einen Tool-Aufruf nur als Text oder Thinking ausgegeben.",
      "Wichtig: Tools duerfen nur ueber strukturierte tool_calls der API aufgerufen werden.",
      "Freitext, XML, Markdown oder Thinking werden nicht als Tool-Aufruf interpretiert.",
      "Antworte jetzt entweder mit einer normalen Antwort oder sende einen echten strukturierten Tool-Call.",
    ].join(" "),
    lengthInstruction: [
      "Deine letzte Antwort wurde wegen Token-Limit abgeschnitten.",
      "Fahre nahtlos fort und wiederhole keine bereits ausgegebenen Inhalte.",
      "Wenn ein kuerzeres Ergebnis reicht, fasse dich jetzt kompakter.",
    ].join(" "),
  },
  reasoning: {
    defaultEffort: "medium",
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
