import type { SessionMessage } from "@/types/api";
import type { AgentStepView } from "./types";
import { buildToolCards, collectToolResults, collectToolUses } from "./messageBlocks";

export type MessageGroup =
  | { kind: "single"; message: SessionMessage; key: string }
  | { kind: "agent-turn"; steps: AgentStepView[]; key: string; userMessageId?: string; streaming?: boolean };

type AgentTurnGroup = Extract<MessageGroup, { kind: "agent-turn" }>;

export function groupMessages(messages: SessionMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let index = 0;
  let latestUserMessageId: string | undefined;

  while (index < messages.length) {
    const message = messages[index];
    if (!message) break;

    if (message.role !== "assistant") {
      if (message.role !== "tool") {
        groups.push({ kind: "single", message, key: message.id });
        if (message.role === "user") latestUserMessageId = message.id;
      }
      index++;
      continue;
    }

    const steps: AgentStepView[] = [];
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

        steps.push({
          assistant,
          toolCalls: buildToolCards(collectToolUses(assistant.content), toolResults),
        });
        continue;
      }

      index++;
    }

    groups.push({
      kind: "agent-turn",
      steps,
      key: steps.map((step) => step.assistant.id).join(":"),
      userMessageId: latestUserMessageId,
    });
  }

  return groups;
}

export function buildStreamingTurnGroup(steps: AgentStepView[]): AgentTurnGroup | null {
  if (steps.length === 0) return null;
  return {
    kind: "agent-turn",
    steps,
    key: "streaming-turn",
    streaming: true,
  };
}
