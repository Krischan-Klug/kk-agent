import type { SessionState } from "../types.js";
import type { UnifiedMessage, UnifiedToolDefinition } from "../../provider/lib/types.js";
import { getToolDefinitions } from "../../mcp/service.js";

export function buildCallPayload(session: SessionState): {
  model: string;
  messages: UnifiedMessage[];
  tools: UnifiedToolDefinition[];
} {
  // System prompt is ALWAYS first – never from session.messages
  const messages: UnifiedMessage[] = [
    { role: "system", content: session.systemPrompt },
    ...session.messages.map((m) => ({
      role: m.role as UnifiedMessage["role"],
      content: m.content,
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
    })),
  ];

  const tools = getToolDefinitions(session.activeMcpIds);

  return { model: session.model, messages, tools };
}

export function compactMessages(session: SessionState, keepLast: number = 10): SessionState {
  // Trim messages but NEVER touch systemPrompt
  if (session.messages.length <= keepLast) return session;
  session.messages = session.messages.slice(-keepLast);
  return session;
}
