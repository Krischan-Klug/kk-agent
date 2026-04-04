import type { SessionMessage } from "@/types/api";
import { collectToolResults, collectToolUses } from "./messageBlocks";

export interface AgentIteration {
  assistant: SessionMessage;
  toolResults: Map<string, { content: string; isError: boolean }>;
}

export type MessageGroup =
  | { kind: "single"; message: SessionMessage; key: string }
  | { kind: "agent-turn"; iterations: AgentIteration[]; key: string };

export function groupMessages(messages: SessionMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];
    if (!message) break;

    if (message.role !== "assistant") {
      if (message.role !== "tool") {
        groups.push({ kind: "single", message, key: message.id });
      }
      index++;
      continue;
    }

    const iterations: AgentIteration[] = [];
    while (index < messages.length) {
      const current = messages[index];
      if (!current || (current.role !== "assistant" && current.role !== "tool")) break;

      if (current.role === "assistant") {
        const assistant = current;
        const toolResults = new Map<string, { content: string; isError: boolean }>();
        index++;

        while (index < messages.length) {
          const maybeTool = messages[index];
          if (!maybeTool || maybeTool.role !== "tool") break;

          for (const toolResult of collectToolResults(maybeTool.content)) {
            toolResults.set(toolResult.tool_use_id, {
              content: toolResult.content,
              isError: toolResult.is_error === true,
            });
          }
          index++;
        }

        iterations.push({ assistant, toolResults });
        continue;
      }

      index++;
    }

    if (iterations.length === 1 && collectToolUses(iterations[0]!.assistant.content).length === 0) {
      groups.push({ kind: "single", message: iterations[0]!.assistant, key: iterations[0]!.assistant.id });
      continue;
    }

    groups.push({
      kind: "agent-turn",
      iterations,
      key: iterations.map((iteration) => iteration.assistant.id).join(":"),
    });
  }

  return groups;
}
