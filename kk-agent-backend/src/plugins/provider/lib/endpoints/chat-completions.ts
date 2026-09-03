import { randomUUID } from "node:crypto";
import { reasoningBlock, textBlock } from "kk-agent-contract";
import type { OnChunkFn, PreparedProviderRequest, UnifiedResponse } from "../types.js";
import { readSSEStream } from "../sse.js";
import { openProviderStream, requestProviderJson } from "../http.js";
import { ProviderError } from "../errors.js";
import {
  buildChatCompletionsBody,
  buildUnifiedResponseFromTurn,
  mapFinishReason,
} from "../request-mappers.js";
import {
  finalizeChatCompletionsTurn,
  normalizeChatCompletionsToolCalls,
} from "../transport.js";
import {
  emitFinalStreamChunks,
  emitToolUseDeltas,
  isProviderTokenUsage,
  normalizeProviderUsage,
  type ProviderTokenUsage,
} from "../provider-common.js";

type RawToolCall = { id?: string; name?: string; rawArguments?: string; index: number };

function mergeToolCall(rawToolCalls: Map<number, RawToolCall>, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const toolCall = value as Record<string, unknown>;
  const index = typeof toolCall.index === "number" ? toolCall.index : rawToolCalls.size;
  const fn = toolCall.function && typeof toolCall.function === "object" && !Array.isArray(toolCall.function)
    ? toolCall.function as Record<string, unknown>
    : undefined;
  const existing = rawToolCalls.get(index) ?? { index };
  rawToolCalls.set(index, {
    index,
    id: typeof toolCall.id === "string" ? toolCall.id : existing.id,
    name: `${existing.name ?? ""}${typeof fn?.name === "string" ? fn.name : ""}`,
    rawArguments: `${existing.rawArguments ?? ""}${typeof fn?.arguments === "string" ? fn.arguments : ""}`,
  });
}

function getReasoningDelta(delta: Record<string, unknown>): string | undefined {
  return [delta.reasoning_content, delta.reasoning, delta.thinking]
    .find((value): value is string => typeof value === "string" && value.length > 0);
}

function getText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return "";
    const record = part as Record<string, unknown>;
    return typeof record.text === "string" ? record.text : "";
  }).join("");
}

export async function complete(
  request: PreparedProviderRequest,
  baseUrl: string,
  onChunk: OnChunkFn,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const url = `${baseUrl}/chat/completions`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(buildChatCompletionsBody(request)),
  };

  const messageId = randomUUID();
  const rawToolCalls = new Map<number, RawToolCall>();
  const emittedToolUseIds = new Set<string>();
  let text = "";
  let reasoning = "";
  let finishReason: UnifiedResponse["finishReason"] = "stop";
  let usage: ProviderTokenUsage | undefined;

  if (request.transportProfile.streamMode === "json") {
    const payload = await requestProviderJson(
      url,
      init,
      "Chat Completions request",
      { signal: request.signal },
    );
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const choice = choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0])
      ? choices[0] as Record<string, unknown>
      : undefined;
    const message = choice?.message && typeof choice.message === "object" && !Array.isArray(choice.message)
      ? choice.message as Record<string, unknown>
      : undefined;
    if (!message) throw new ProviderError("Chat Completions returned no assistant message.");
    text = getText(message.content);
    reasoning = getReasoningDelta(message) ?? "";
    if (Array.isArray(message.tool_calls)) message.tool_calls.forEach((call) => mergeToolCall(rawToolCalls, call));
    finishReason = mapFinishReason(typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined);
    if (isProviderTokenUsage(payload.usage)) usage = payload.usage;
  } else {
    let sawTerminalChunk = false;
    const stream = await openProviderStream(
      url,
      init,
      "Chat Completions request",
      { signal: request.signal },
    );
    try {
      await readSSEStream(stream.response, (parsed) => {
        const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
        const choice = choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0])
          ? choices[0] as Record<string, unknown>
          : undefined;
        if (isProviderTokenUsage(parsed.usage)) usage = parsed.usage;
        if (!choice) return false;
        const delta = choice.delta && typeof choice.delta === "object" && !Array.isArray(choice.delta)
          ? choice.delta as Record<string, unknown>
          : {};
        const reasoningDelta = getReasoningDelta(delta);
        if (reasoningDelta) {
          reasoning += reasoningDelta;
          onChunk({ type: "assistant_block_delta", messageId, block: reasoningBlock(reasoningDelta) });
        }
        const content = getText(delta.content);
        if (content) {
          text += content;
          onChunk({ type: "assistant_block_delta", messageId, block: textBlock(content) });
        }
        if (Array.isArray(delta.tool_calls)) delta.tool_calls.forEach((call) => mergeToolCall(rawToolCalls, call));
        if (typeof choice.finish_reason === "string") {
          sawTerminalChunk = true;
          finishReason = mapFinishReason(choice.finish_reason);
        }
        return false;
      }, { signal: stream.signal });
    } finally {
      stream.close();
    }
    if (!sawTerminalChunk) {
      throw new ProviderError("Chat Completions stream ended before a terminal choice was received.");
    }
  }

  const normalizedToolCalls = normalizeChatCompletionsToolCalls({
    rawToolCalls: [...rawToolCalls.values()],
    tools: request.tools,
    supportsConcatenatedJsonSplit: request.transportProfile.supportsConcatenatedJsonSplit,
  }).toolCalls;
  emitToolUseDeltas(normalizedToolCalls, emittedToolUseIds, messageId, onChunk);

  const turn = finalizeChatCompletionsTurn({
    messageId,
    text,
    reasoning,
    rawToolCalls: [...rawToolCalls.values()].sort((left, right) => left.index - right.index),
    finishReason,
    usage: normalizeProviderUsage(usage),
    tools: request.tools,
    supportsConcatenatedJsonSplit: request.transportProfile.supportsConcatenatedJsonSplit,
  });
  const result = buildUnifiedResponseFromTurn(turn);
  result.transportState = { endpoint: "chat-completions" };
  result.debug = { endpoint: "chat-completions" };
  emitFinalStreamChunks(result, onChunk);
  return result;
}
