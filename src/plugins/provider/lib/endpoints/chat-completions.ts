/**
 * OpenAI Chat Completions endpoint (/v1/chat/completions)
 *
 * Pure functions — no state, no config. The adapter provides baseUrl + headers.
 */
import type { UnifiedRequest, UnifiedResponse, UnifiedToolCall, OnChunkFn } from "../types.js";
import { readSSEStream } from "../sse.js";
import {
  buildChatCompletionsBody,
  safeParseArgs,
  parseThinkTags,
  parseToolCalls,
  mapFinishReason,
} from "../helpers.js";

/* ── Non-streaming ── */

export async function chat(
  request: UnifiedRequest,
  baseUrl: string,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const body = buildChatCompletionsBody(request, false);

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat Completions error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{
      message: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
      finish_reason: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number };
  };

  const choice = data.choices[0];

  return {
    content: choice.message.content ?? "",
    tool_calls: parseToolCalls(choice.message.tool_calls),
    finishReason: mapFinishReason(choice.finish_reason),
    stats: data.usage
      ? {
          inputTokens: data.usage.prompt_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? 0,
          reasoningTokens: data.usage.reasoning_tokens ?? 0,
          source: "provider",
        }
      : undefined,
  };
}

/* ── Streaming ── */

export async function chatStream(
  request: UnifiedRequest,
  baseUrl: string,
  onChunk: OnChunkFn,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const body = buildChatCompletionsBody(request, true);

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat Completions error ${res.status}: ${text}`);
  }

  let fullContent = "";
  let fullReasoning = "";
  let inThink = false;
  const toolCallDeltas: Map<number, { id: string; name: string; args: string }> = new Map();
  let finishReason: UnifiedResponse["finishReason"] = "stop";
  let usage: { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number } | undefined;

  await readSSEStream(res, (parsed) => {
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

    const chunkUsage = parsed.usage as typeof usage;
    if (chunkUsage) usage = chunkUsage;

    if (!choices?.[0]) return false;
    const delta = choices[0].delta;
    const reason = choices[0].finish_reason;

    if (reason === "tool_calls") finishReason = "tool_calls";
    else if (reason === "length") finishReason = "length";
    else if (reason === "stop") finishReason = "stop";

    // Native reasoning_content (some models send this)
    if (delta?.reasoning_content) {
      fullReasoning += delta.reasoning_content;
      onChunk({ type: "reasoning", content: delta.reasoning_content });
    }

    // Content with <think> tag fallback parsing
    if (delta?.content) {
      fullContent += delta.content;
      inThink = parseThinkTags(delta.content, inThink, onChunk);
    }

    // Tool call deltas (streamed incrementally)
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        if (!toolCallDeltas.has(idx)) {
          toolCallDeltas.set(idx, { id: tc.id ?? "", name: "", args: "" });
        }
        const entry = toolCallDeltas.get(idx)!;
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name += tc.function.name;
        if (tc.function?.arguments) entry.args += tc.function.arguments;
      }
    }

    return false;
  });

  // Ensure finishReason matches actual tool call presence
  if (toolCallDeltas.size > 0 && finishReason === "stop") {
    finishReason = "tool_calls";
  }

  const toolCalls: UnifiedToolCall[] | undefined =
    toolCallDeltas.size > 0
      ? [...toolCallDeltas.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, tc]) => ({
            id: tc.id,
            name: tc.name,
            arguments: safeParseArgs(tc.args),
          }))
      : undefined;

  if (toolCalls) {
    onChunk({ type: "tool_calls", tool_calls: toolCalls, finishReason });
  }

  const stats = usage
    ? {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        reasoningTokens: usage.reasoning_tokens ?? 0,
        source: "provider" as const,
      }
    : undefined;

  if (stats) onChunk({ type: "stats", stats });
  onChunk({ type: "done", finishReason });

  return {
    content: fullContent,
    reasoning: fullReasoning || undefined,
    tool_calls: toolCalls,
    finishReason,
    stats,
  };
}
