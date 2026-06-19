import { randomUUID } from "node:crypto";
import type {
  OnChunkFn,
  ProviderNotice,
  UnifiedRequest,
  UnifiedResponse,
} from "../types.js";
import { readSSEStream } from "../sse.js";
import {
  buildChatCompletionsBody,
  buildUnifiedResponseFromTurn,
  mapFinishReason,
} from "../helpers.js";
import {
  finalizeChatCompletionsTurn,
  normalizeChatCompletionsToolCalls,
} from "../transport.js";
import { reasoningBlock, textBlock } from "../../../lib/transcript.js";
import {
  consumeProviderStreamError,
  emitFinalStreamChunks,
  emitToolUseDeltas,
  isProviderTokenUsage,
  normalizeProviderUsage,
  type ProviderTokenUsage,
} from "../provider-common.js";

export async function chat(
  request: UnifiedRequest,
  baseUrl: string,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
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
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
      finish_reason?: string | null;
    }>;
    usage?: ProviderTokenUsage;
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
    usage: normalizeProviderUsage(data.usage),
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
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(buildChatCompletionsBody(request, true)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat Completions error ${res.status}: ${text}`);
  }

  const messageId = randomUUID();
  const rawToolCalls = new Map<
    number,
    { id?: string; name?: string; rawArguments?: string; index: number }
  >();
  const emittedToolUseIds = new Set<string>();
  const providerNotices: ProviderNotice[] = [];
  let text = "";
  let reasoning = "";
  let finishReason: UnifiedResponse["finishReason"] = "stop";
  let usage: ProviderTokenUsage | undefined;
  let fatalStreamError: string | undefined;

  await readSSEStream(
    res,
    (parsed) => {
      const streamError = consumeProviderStreamError(parsed, providerNotices);
      if (streamError.handled) {
        fatalStreamError = streamError.fatalError ?? fatalStreamError;
        return true;
      }

      const choices = parsed.choices as
        | Array<{
            delta?: {
              content?: string | null;
              reasoning_content?: string | null;
              tool_calls?: Array<{
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string | null;
          }>
        | undefined;
      const choice = choices?.[0];
      if (!choice) {
        if (isProviderTokenUsage(parsed.usage)) usage = parsed.usage;
        return false;
      }

      const delta = choice.delta;
      if (isProviderTokenUsage(parsed.usage)) usage = parsed.usage;
      finishReason = mapFinishReason(choice.finish_reason);

      if (
        typeof delta?.reasoning_content === "string" &&
        delta.reasoning_content.length > 0
      ) {
        reasoning += delta.reasoning_content;
        onChunk({
          type: "assistant_block_delta",
          messageId,
          block: reasoningBlock(delta.reasoning_content),
        });
      }

      if (typeof delta?.content === "string" && delta.content.length > 0) {
        text += delta.content;
        onChunk({
          type: "assistant_block_delta",
          messageId,
          block: textBlock(delta.content),
        });
      }

      for (const toolCall of delta?.tool_calls ?? []) {
        const existing = rawToolCalls.get(toolCall.index) ?? {
          index: toolCall.index,
        };
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
        emitToolUseDeltas(
          normalizedToolCalls,
          emittedToolUseIds,
          messageId,
          onChunk,
        );
      }

      return false;
    },
    { throwOnProviderError: false },
  );

  const hasToolCallContent = rawToolCalls.size > 0;
  if (fatalStreamError && !text && !reasoning && !hasToolCallContent) {
    throw new Error(fatalStreamError);
  }

  const turn = finalizeChatCompletionsTurn({
    messageId,
    text,
    reasoning,
    rawToolCalls: [...rawToolCalls.values()].sort(
      (left, right) => left.index - right.index,
    ),
    finishReason,
    usage: normalizeProviderUsage(usage),
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
  emitFinalStreamChunks(response, onChunk);
  return response;
}
