import { toolUseBlock } from "../../lib/transcript.js";
import type {
  NormalizedToolCall,
  OnChunkFn,
  ProviderNotice,
  TokenStats,
  ToolCallParseIssue,
  UnifiedResponse,
} from "./types.js";

export type ProviderTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};

export function isProviderTokenUsage(value: unknown): value is ProviderTokenUsage {
  return value !== null
    && typeof value === "object"
    && (
      "prompt_tokens" in value
      || "completion_tokens" in value
      || "input_tokens" in value
      || "output_tokens" in value
    );
}

export function normalizeProviderUsage(usage?: ProviderTokenUsage): TokenStats | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    reasoningTokens: usage.reasoning_tokens
      ?? usage.output_tokens_details?.reasoning_tokens
      ?? usage.completion_tokens_details?.reasoning_tokens
      ?? 0,
    source: "provider",
  };
}

export function issueToNotice(issue: ToolCallParseIssue): ProviderNotice {
  return {
    level: issue.severity === "warning" ? "warning" : "error",
    code: issue.code,
    toolCallId: issue.callId,
    toolName: issue.toolName,
    message: issue.message,
  };
}

function getProviderErrorMessage(parsed: Record<string, unknown>): string | undefined {
  if (parsed.error && typeof parsed.error === "object") {
    return "message" in parsed.error && typeof parsed.error.message === "string"
      ? parsed.error.message
      : JSON.stringify(parsed.error);
  }

  return parsed.type === "error" && typeof parsed.message === "string"
    ? parsed.message
    : undefined;
}

export function consumeProviderStreamError(
  parsed: Record<string, unknown>,
  notices: ProviderNotice[],
): { handled: boolean; fatalError?: string } {
  const message = getProviderErrorMessage(parsed);
  if (!message) return { handled: false };

  const isToolCallWarning = message.includes("tool call");
  notices.push({
    level: isToolCallWarning ? "warning" : "error",
    message: `Provider stream stopped early: ${message}`,
  });

  return {
    handled: true,
    fatalError: isToolCallWarning ? undefined : message,
  };
}

export function emitToolUseDeltas(
  toolCalls: NormalizedToolCall[],
  emittedToolUseIds: Set<string>,
  messageId: string,
  onChunk: OnChunkFn,
): void {
  for (const toolCall of toolCalls) {
    if (emittedToolUseIds.has(toolCall.id)) continue;
    emittedToolUseIds.add(toolCall.id);
    onChunk({
      type: "assistant_block_delta",
      messageId,
      block: toolUseBlock(toolCall.id, toolCall.name, toolCall.arguments),
    });
  }
}

export function emitFinalStreamChunks(response: UnifiedResponse, onChunk: OnChunkFn): void {
  onChunk({ type: "assistant_message", message: response.message, finishReason: response.finishReason });
  if (response.stats) onChunk({ type: "stats", stats: response.stats });
  onChunk({ type: "done", finishReason: response.finishReason });
}
