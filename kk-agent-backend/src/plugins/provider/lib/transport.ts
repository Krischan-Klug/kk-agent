import type { TranscriptStopReason } from "kk-agent-contract";
import type {
  AssembledAssistantTurn,
  AssembledOutputItem,
  TokenStats,
  UnifiedToolDefinition,
} from "./types.js";
import { issueToNotice } from "./provider-common.js";
import {
  normalizeChatCompletionsToolCalls,
  normalizeResponsesToolCalls,
} from "./tool-call-normalizer.js";

export {
  normalizeChatCompletionsToolCalls,
  normalizeResponsesToolCalls,
} from "./tool-call-normalizer.js";
export { handleResponsesStreamingEvent } from "./responses-stream-reducer.js";

export function finalizeChatCompletionsTurn(input: {
  messageId: string;
  text: string;
  reasoning: string;
  rawToolCalls: Array<{ id?: string; name?: string; rawArguments?: string; index: number }>;
  finishReason: TranscriptStopReason;
  usage?: TokenStats;
  tools?: UnifiedToolDefinition[];
  supportsConcatenatedJsonSplit?: boolean;
}): AssembledAssistantTurn {
  const normalized = normalizeChatCompletionsToolCalls({
    rawToolCalls: input.rawToolCalls,
    tools: input.tools,
    supportsConcatenatedJsonSplit: input.supportsConcatenatedJsonSplit,
  });

  return {
    messageId: input.messageId,
    text: input.text,
    reasoning: input.reasoning,
    toolCalls: normalized.toolCalls,
    finishReason: normalized.toolCalls.length > 0 && input.finishReason === "stop" ? "tool_use" : input.finishReason,
    usage: input.usage,
    notices: normalized.issues.map(issueToNotice),
    parseIssues: normalized.issues,
  };
}

export function finalizeResponsesOutput(input: {
  messageId: string;
  output: AssembledOutputItem[];
  usage?: TokenStats;
  tools?: UnifiedToolDefinition[];
  supportsConcatenatedJsonSplit?: boolean;
}): AssembledAssistantTurn {
  const normalized = normalizeResponsesToolCalls({
    output: input.output,
    tools: input.tools,
    supportsConcatenatedJsonSplit: input.supportsConcatenatedJsonSplit,
  });
  let text = "";
  let reasoning = "";

  input.output.forEach((item) => {
    switch (item.type) {
      case "message":
        text += collectMessageText(item);
        break;
      case "reasoning":
        reasoning += collectReasoningText(item);
        break;
      default:
        break;
    }
  });

  return {
    messageId: input.messageId,
    text,
    reasoning,
    toolCalls: normalized.toolCalls,
    finishReason: normalized.toolCalls.length > 0 ? "tool_use" : "stop",
    usage: input.usage,
    output: input.output,
    notices: normalized.issues.map(issueToNotice),
    parseIssues: normalized.issues,
  };
}

function collectMessageText(item: AssembledOutputItem): string {
  const parts = Array.isArray(item.content) ? item.content : [];
  let text = "";
  for (const part of parts) {
    if (typeof part === "object" && part !== null && !Array.isArray(part)) {
      const partType = typeof part.type === "string" ? part.type : "";
      if ((partType === "output_text" || partType === "text") && typeof part.text === "string") {
        text += part.text;
      }
    }
  }
  return text;
}

function collectReasoningText(item: AssembledOutputItem): string {
  const primary = Array.isArray(item.summary) && item.summary.length > 0 ? item.summary : item.content;
  const parts = Array.isArray(primary) ? primary : [];
  let text = "";
  for (const part of parts) {
    if (typeof part === "object" && part !== null && !Array.isArray(part)) {
      if (typeof part.text === "string") {
        text += part.text;
      }
    }
  }
  return text;
}
