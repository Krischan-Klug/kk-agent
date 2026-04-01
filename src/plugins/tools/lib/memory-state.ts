import { randomUUID } from "node:crypto";
import { loadState, saveState } from "../../lib/state.js";
import type { MemoryFact } from "../types.js";

const USER_MEMORY_FILE = "user-memory.json";

let userMemory: { facts: MemoryFact[] } = { facts: [] };
const sessionMemory = new Map<string, MemoryFact[]>();

function normalizeFacts(facts: MemoryFact[]): MemoryFact[] {
  return facts
    .map((fact) => ({
      id: String(fact.id || randomUUID()),
      text: String(fact.text ?? "").trim(),
    }))
    .filter((fact) => fact.text.length > 0);
}

export async function initMemoryState(): Promise<void> {
  userMemory = await loadState<{ facts: MemoryFact[] }>(USER_MEMORY_FILE, { facts: [] });
}

export function listUserFacts(): MemoryFact[] {
  return [...userMemory.facts];
}

export async function replaceUserFacts(facts: MemoryFact[]): Promise<MemoryFact[]> {
  userMemory = { facts: normalizeFacts(facts) };
  await saveState(USER_MEMORY_FILE, userMemory);
  return listUserFacts();
}

export function listSessionFacts(sessionId: string): MemoryFact[] {
  return [...(sessionMemory.get(sessionId) ?? [])];
}

export function replaceSessionFacts(sessionId: string, facts: MemoryFact[]): MemoryFact[] {
  const normalized = normalizeFacts(facts);
  sessionMemory.set(sessionId, normalized);
  return listSessionFacts(sessionId);
}

export function clearSessionFacts(sessionId: string): void {
  sessionMemory.delete(sessionId);
}

export function getMemoryPromptContext(sessionId: string): { userMemory: string; sessionMemory: string } {
  const user = listUserFacts();
  const session = listSessionFacts(sessionId);

  return {
    userMemory:
      user.length > 0
        ? user.map((fact, index) => `${index + 1}. ${fact.text}`).join("\n")
        : "Keine gespeicherten User-Fakten vorhanden.",
    sessionMemory:
      session.length > 0
        ? session.map((fact, index) => `${index + 1}. ${fact.text}`).join("\n")
        : "Keine Session-Fakten vorhanden.",
  };
}
