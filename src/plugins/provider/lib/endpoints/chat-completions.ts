import { randomUUID } from "node:crypto";
import type { OnChunkFn, TokenStats, UnifiedRequest, UnifiedResponse } from "../types.js";
import { readSSEStream } from "../sse.js";
import {
  buildChatCompletionsBody,
  buildUnifiedResponseFromTurn,
  mapFinishReason,
} from "../helpers.js";
import { finalizeChatCompletionsTurn, normalizeChatCompletionsToolCalls } from "../transport.js";
import { reasoningBlock, textBlock, toolUseBlock } from "../../../lib/transcript.js";

type ChatCompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
};

function normalizeUsage(usage?: ChatCompletionUsage): TokenStats | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    reasoningTokens: usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? 0,
    source: "provider",
  };
}

export async function chat(
  request: UnifiedRequest,
  baseUrl: string,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(buildChatCompletionsBody(request, false)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat Completions error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{
      message: {
        content?: string | null;
        reasoning_content?: string | null;
        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
      };
      finish_reason?: string | null;
    }>;
    usage?: ChatCompletionUsage;
  };

  const choice = data.choices[0];
  const turn = finalizeChatCompletionsTurn({
    messageId: randomUUID(),
    text: choice?.message.content ?? "",
    reasoning: choice?.message.reasoning_content ?? "",
    rawToolCalls: (choice?.message.tool_calls ?? []).map((toolCall, index) => ({
      id: toolCall.id,
      name: toolCall.function?.name,
      rawArguments: toolCall.function?.arguments,
      index,
    })),
    finishReason: mapFinishReason(choice?.finish_reason),
    usage: normalizeUsage(data.usage),
    tools: request.tools,
    supportsConcatenatedJsonSplit: true,
  });

  const response = buildUnifiedResponseFromTurn(turn);
  response.transportState = {
    endpoint: "chat-completions",
  };
  response.debug = {
    endpoint: "chat-completions",
  };
  return response;
}

export async function chatStream(
  request: UnifiedRequest,
  baseUrl: string,
  onChunk: OnChunkFn,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(buildChatCompletionsBody(request, true)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat Completions error ${res.status}: ${text}`);
  }

  const messageId = randomUUID();
  const rawToolCalls = new Map<number, { id?: string; name?: string; rawArguments?: string; index: number }>();
  const emittedToolUseIds = new Set<string>();
  const providerNotices: Array<{ level: "info" | "warning" | "error"; message: string }> = [];
  let text = "";
  let reasoning = "";
  let finishReason: UnifiedResponse["finishReason"] = "stop";
  let usage: ChatCompletionUsage | undefined;
  let fatalStreamError: string | undefined;

  await readSSEStream(res, (parsed) => {
    if (parsed.error && typeof parsed.error === "object") {
      const message =
        "message" in parsed.error && typeof parsed.error.message === "string"
          ? parsed.error.message
          : JSON.stringify(parsed.error);
      const isToolCallWarning = message.includes("tool call");
      providerNotices.push({
        level: isToolCallWarning ? "warning" : "error",
        message: `Provider stream stopped early: ${message}`,
      });
      if (!isToolCallWarning) fatalStreamError = message;
      return true;
    }

    if (parsed.type === "error" && typeof parsed.message === "string") {
      const isToolCallWarning = parsed.message.includes("tool call");
      providerNotices.push({
        level: isToolCallWarning ? "warning" : "error",
        message: `Provider stream stopped early: ${parsed.message}`,
      });
      if (!isToolCallWarning) fatalStreamError = parsed.message;
      return true;
    }

    const choices = parsed.choices as
      | Array<{
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
          };
          finish_reason?: string | null;
        }>
      | undefined;
    const choice = choices?.[0];
    if (!choice) {
      const chunkUsage = parsed.usage as ChatCompletionUsage | undefined;
      if (chunkUsage) usage = chunkUsage;
      return false;
    }

    const delta = choice.delta;
    const chunkUsage = parsed.usage as ChatCompletionUsage | undefined;
    if (chunkUsage) usage = chunkUsage;
    finishReason = mapFinishReason(choice.finish_reason);

    if (typeof delta?.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      reasoning += delta.reasoning_content;
      onChunk({ type: "assistant_block_delta", messageId, block: reasoningBlock(delta.reasoning_content) });
    }

    if (typeof delta?.content === "string" && delta.content.length > 0) {
      text += delta.content;
      onChunk({ type: "assistant_block_delta", messageId, block: textBlock(delta.content) });
    }

    for (const toolCall of delta?.tool_calls ?? []) {
      const existing = rawToolCalls.get(toolCall.index) ?? { index: toolCall.index };
      rawToolCalls.set(toolCall.index, {
        index: toolCall.index,
        id: toolCall.id ?? existing.id,
        name: `${existing.name ?? ""}${toolCall.function?.name ?? ""}`,
        rawArguments: `${existing.rawArguments ?? ""}${toolCall.function?.arguments ?? ""}`,
      });
    }

    if (choice.finish_reason) {
      const normalizedToolCalls = normalizeChatCompletionsToolCalls({
        rawToolCalls: [...rawToolCalls.values()],
        tools: request.tools,
        supportsConcatenatedJsonSplit: true,
      }).toolCalls;
      for (const toolCall of normalizedToolCalls) {
        if (emittedToolUseIds.has(toolCall.id)) continue;
        emittedToolUseIds.add(toolCall.id);
        onChunk({
          type: "assistant_block_delta",
          messageId,
          block: toolUseBlock(toolCall.id, toolCall.name, toolCall.arguments),
        });
      }
    }

    return false;
  }, { throwOnProviderError: false });

  const hasToolCallContent = rawToolCalls.size > 0;
  if (fatalStreamError && !text && !reasoning && !hasToolCallContent) {
    throw new Error(fatalStreamError);
  }

  const turn = finalizeChatCompletionsTurn({
    messageId,
    text,
    reasoning,
    rawToolCalls: [...rawToolCalls.values()].sort((left, right) => left.index - right.index),
    finishReason,
    usage: normalizeUsage(usage),
    tools: request.tools,
    supportsConcatenatedJsonSplit: true,
  });

  const response = buildUnifiedResponseFromTurn(turn);
  response.transportState = {
    endpoint: "chat-completions",
  };
  response.debug = {
    endpoint: "chat-completions",
  };
  if (providerNotices.length > 0) {
    response.notices = [...(response.notices ?? []), ...providerNotices];
  }
  onChunk({ type: "assistant_message", message: response.message, finishReason: response.finishReason });
  if (response.stats) onChunk({ type: "stats", stats: response.stats });
  onChunk({ type: "done", finishReason: response.finishReason });
  return response;
}
