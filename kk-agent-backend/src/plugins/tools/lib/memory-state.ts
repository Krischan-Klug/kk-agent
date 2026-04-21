import { randomUUID } from "node:crypto";
import { loadState, saveState } from "../../lib/state.js";
import { loadSessionData, saveSessionData } from "../../lib/state.js";
import type { MemoryFact } from "../types.js";

const FACTS_FILE = "facts.json";

const USER_MEMORY_FILE = "user-memory.json";

let userMemory: { facts: MemoryFact[] } = { facts: [] };
const sessionMemory = new Map<string, MemoryFact[]>();
const loadedSessions = new Set<string>();

function persistSessionFacts(sessionId: string): void {
  void saveSessionData(sessionId, FACTS_FILE, sessionMemory.get(sessionId) ?? []);
}

export async function ensureSessionFactsLoaded(sessionId: string): Promise<void> {
  if (loadedSessions.has(sessionId)) return;
  loadedSessions.add(sessionId);
  const facts = await loadSessionData<MemoryFact[]>(sessionId, FACTS_FILE, []);
  if (facts.length > 0 && !sessionMemory.has(sessionId)) {
    sessionMemory.set(sessionId, facts);
  }
}

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
  loadedSessions.add(sessionId);
  persistSessionFacts(sessionId);
  return listSessionFacts(sessionId);
}

export function clearSessionFacts(sessionId: string): void {
  sessionMemory.delete(sessionId);
  loadedSessions.delete(sessionId);
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
