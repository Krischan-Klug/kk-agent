import { session as sessionApi } from "@/lib/api";
import type { AgentDefinition, SessionState } from "@/types/api";
import { emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { setActiveSessionId } from "@/lib/sessionState";

export function resolveDefaultSessionAgentId(agents: Pick<AgentDefinition, "id">[], fallbackAgentId?: string): string {
  const resolved = fallbackAgentId ?? agents[0]?.id;
  if (!resolved) {
    throw new Error("Kein Agent verfuegbar fuer die Session-Erstellung.");
  }
  return resolved;
}

export async function createAndActivateSession(
  agents: Pick<AgentDefinition, "id">[],
  fallbackAgentId?: string,
): Promise<SessionState> {
  const session = await sessionApi.create({
    agentId: resolveDefaultSessionAgentId(agents, fallbackAgentId),
  });
  setActiveSessionId(session.id);
  emitAppEvent(SESSION_CHANGED_EVENT);
  return session;
}
