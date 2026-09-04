import type { TranscriptMessage } from "kk-agent-contract";
import type { AgentStepView } from "./types";
import { buildToolCards, collectToolResults, collectToolUses } from "./messageBlocks";

export type MessageGroup =
  | { kind: "single"; message: TranscriptMessage; key: string }
  | { kind: "agent-step"; step: AgentStepView; key: string; userMessageId?: string; streaming?: boolean };

type AgentStepGroup = Extract<MessageGroup, { kind: "agent-step" }>;

export function groupMessages(messages: TranscriptMessage[]): MessageGroup[] {
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

    while (index < messages.length) {
      const current = messages[index];
      if (!current || (current.role !== "assistant" && current.role !== "tool")) break;
      if (current.role === "assistant") {
        const assistant = current;
        const toolResults = new Map<string, { content: string; isError: boolean; metadata?: Record<string, unknown> }>();
        index++;

        while (index < messages.length) {
          const maybeTool = messages[index];
          if (!maybeTool || maybeTool.role !== "tool") break;

          for (const toolResult of collectToolResults(maybeTool.content)) {
            toolResults.set(toolResult.tool_use_id, {
              content: toolResult.content,
              isError: toolResult.is_error === true,
              metadata: toolResult.metadata,
            });
          }
          index++;
        }

        groups.push({
          kind: "agent-step",
          step: {
            assistant,
            toolCalls: buildToolCards(collectToolUses(assistant.content), toolResults),
          },
          key: assistant.id,
          userMessageId: latestUserMessageId,
        });
        continue;
      }

      index++;
    }
  }

  return groups;
}

export function buildStreamingStepGroups(steps: AgentStepView[]): AgentStepGroup[] {
  return steps.map((step, index) => ({
    kind: "agent-step",
    step,
    key: `streaming-${step.assistant.id}`,
    streaming: index === steps.length - 1,
  }));
}
