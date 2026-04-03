import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { getCurrentSessionId } from "../user-interaction/interaction-store.js";
import { replaceSessionFacts, replaceUserFacts } from "../../lib/memory-state.js";
import type { MemoryFact } from "../../types.js";

function getSessionIdOrThrow(): string {
  const sessionId = getCurrentSessionId();
  if (!sessionId) throw new Error("No active session context for memory tool.");
  return sessionId;
}

function memorySummary(facts: MemoryFact[]): string {
  if (facts.length === 0) return "Keine Facts gespeichert.";
  return facts.map((fact) => `- ${fact.text}`).join("\n");
}

export async function executeMemoryTool(
  _config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName !== "remember_facts") return null;

  const facts = Array.isArray(args.facts) ? args.facts as MemoryFact[] : [];
  const scope = String(args.scope ?? "");
  if (scope !== "session" && scope !== "user") {
    return { content: "scope must be 'session' or 'user'", isError: true };
  }

  if (scope === "session") {
    const sessionId = getSessionIdOrThrow();
    const next = replaceSessionFacts(sessionId, facts);
    return { content: `Session-Memory aktualisiert.\n${memorySummary(next)}`, isError: false };
  }

  const next = await replaceUserFacts(facts);
  return { content: `User-Memory aktualisiert.\n${memorySummary(next)}`, isError: false };
}
