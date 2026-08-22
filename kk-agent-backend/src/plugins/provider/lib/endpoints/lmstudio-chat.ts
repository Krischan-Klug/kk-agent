import { randomUUID } from "node:crypto";
import {
  createTranscriptMessage,
  getMessageText,
  reasoningBlock,
  textBlock,
  type TranscriptBlock,
  type TranscriptStopReason,
} from "kk-agent-contract";
import type { OnChunkFn, TokenStats, UnifiedRequest, UnifiedResponse } from "../types.js";
import { emitFinalStreamChunks } from "../provider-common.js";

interface LmStudioChatResponse {
  output?: Array<{
    type?: string;
    content?: unknown;
  }>;
  stats?: {
    input_tokens?: number;
    total_output_tokens?: number;
    reasoning_output_tokens?: number;
  };
  finish_reason?: string;
  stop_reason?: string;
}

function nativeApiRoot(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/u, "");
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    return typeof record.text === "string" ? record.text : typeof record.content === "string" ? record.content : "";
  }).filter(Boolean).join("\n");
}

function serializeInput(request: UnifiedRequest): string {
  return request.messages.map((message) => getMessageText(message)).filter(Boolean).join("\n\n");
}

function finishReason(data: LmStudioChatResponse, maxOutputTokens: number | undefined): TranscriptStopReason {
  const raw = data.finish_reason ?? data.stop_reason;
  if (raw === "length" || raw === "max_tokens") return "length";
  const total = data.stats?.total_output_tokens ?? 0;
  return maxOutputTokens && total >= maxOutputTokens ? "length" : "stop";
}

export async function chatStream(
  request: UnifiedRequest,
  baseUrl: string,
  onChunk: OnChunkFn,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const body = {
    ...(request.providerRequestBody ?? {}),
    model: request.model,
    input: serializeInput(request),
    system_prompt: request.instructions,
    store: false,
    stream: false,
  };
  const res = await fetch(`${nativeApiRoot(baseUrl)}/api/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: request.signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LM Studio Chat error ${res.status}: ${detail}`);
  }

  const data = await res.json() as LmStudioChatResponse;
  const text = (data.output ?? [])
    .filter((item) => item.type === "message" || item.type === "text")
    .map((item) => contentText(item.content))
    .filter(Boolean)
    .join("\n")
    .trim();
  const reasoning = (data.output ?? [])
    .filter((item) => item.type === "reasoning")
    .map((item) => contentText(item.content))
    .filter(Boolean)
    .join("\n")
    .trim();
  const stats: TokenStats = {
    inputTokens: Math.max(0, Math.floor(data.stats?.input_tokens ?? 0)),
    outputTokens: Math.max(0, Math.floor(data.stats?.total_output_tokens ?? 0)),
    reasoningTokens: Math.max(0, Math.floor(data.stats?.reasoning_output_tokens ?? 0)),
    source: "provider",
  };
  const maxOutputTokens = typeof request.providerRequestBody?.max_output_tokens === "number"
    ? request.providerRequestBody.max_output_tokens
    : undefined;
  const stopReason = finishReason(data, maxOutputTokens);
  const content: TranscriptBlock[] = [];
  if (reasoning) content.push(reasoningBlock(reasoning));
  if (text) content.push(textBlock(text));
  const message = createTranscriptMessage({
    id: randomUUID(),
    role: "assistant",
    content,
    stopReason,
    usage: stats,
  });
  const response: UnifiedResponse = {
    message,
    finishReason: stopReason,
    stats,
    transportState: { endpoint: "lmstudio-chat" },
    debug: { endpoint: "lmstudio-chat" },
  };
  emitFinalStreamChunks(response, onChunk);
  return response;
}
