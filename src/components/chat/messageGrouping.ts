import type { SessionMessage } from "@/types/api";

export interface AgentIteration {
  assistant: SessionMessage;
  toolResults: Map<string, { content: string; isError: boolean }>;
}

export type MessageGroup =
  | { kind: "single"; message: SessionMessage; index: number }
  | { kind: "agent-turn"; iterations: AgentIteration[]; indices: number[] };

export function groupMessages(messages: SessionMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;

  while (i < messages.length) {
    const message = messages[i];

    if (message.role !== "assistant") {
      if (message.role !== "tool") {
        groups.push({ kind: "single", message, index: i });
      }
      i++;
      continue;
    }

    const iterations: AgentIteration[] = [];
    const indices: number[] = [];

    while (i < messages.length && (messages[i].role === "assistant" || messages[i].role === "tool")) {
      const current = messages[i];

      if (current.role === "assistant") {
        const toolResults = new Map<string, { content: string; isError: boolean }>();
        indices.push(i);
        i++;

        while (i < messages.length && messages[i].role === "tool") {
          const toolMessage = messages[i];
          if (toolMessage.tool_call_id) {
            toolResults.set(toolMessage.tool_call_id, { content: toolMessage.content, isError: toolMessage.isError === true });
          }
          i++;
        }

        iterations.push({ assistant: current, toolResults });
      } else {
        i++;
      }
    }

    if (iterations.length === 1 && (!iterations[0].assistant.tool_calls || iterations[0].assistant.tool_calls.length === 0)) {
      groups.push({ kind: "single", message: iterations[0].assistant, index: indices[0] });
      continue;
    }

    groups.push({ kind: "agent-turn", iterations, indices });
  }

  return groups;
}
