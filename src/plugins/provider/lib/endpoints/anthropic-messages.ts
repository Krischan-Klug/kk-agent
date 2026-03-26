/**
 * Anthropic Messages endpoint (/v1/messages)
 *
 * Converts between our unified types and the Anthropic Messages API format.
 * Reference: https://docs.anthropic.com/en/api/messages
 */
import type { UnifiedMessage, UnifiedRequest, UnifiedResponse, UnifiedToolCall, OnChunkFn } from "../types.js";
import { readSSEStream } from "../sse.js";
import { safeParseArgs } from "../helpers.js";

/* ── Format conversion ── */

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

function buildAnthropicMessages(messages: UnifiedMessage[]): { system?: string; messages: AnthropicMessage[] } {
  let system: string | undefined;
  const result: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      system = m.content;
      continue;
    }

    if (m.role === "user") {
      result.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: "text", text: m.content });
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
        }
      }
      result.push({ role: "assistant", content: content.length === 1 && !m.tool_calls?.length ? m.content : content });
    } else if (m.role === "tool") {
      result.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: m.content }],
      });
    }
  }

  return { system, messages: result };
}

function buildAnthropicBody(request: UnifiedRequest, stream: boolean): Record<string, unknown> {
  const { system, messages } = buildAnthropicMessages(request.messages);

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
    max_tokens: request.maxOutputTokens ?? 4096,
    stream,
  };

  if (system) body.system = system;
  if (request.temperature !== undefined) body.temperature = request.temperature;

  if (request.tools?.length) {
    body.tools = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  return body;
}

/* ── Non-streaming ── */

export async function chat(
  request: UnifiedRequest,
  baseUrl: string,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const body = buildAnthropicBody(request, false);

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    stop_reason: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  let content = "";
  const toolCalls: UnifiedToolCall[] = [];

  for (const block of data.content) {
    if (block.type === "text" && block.text) content += block.text;
    if (block.type === "tool_use" && block.id && block.name) {
      toolCalls.push({ id: block.id, name: block.name, arguments: block.input ?? {} });
    }
  }

  const finishReason = data.stop_reason === "tool_use" ? "tool_calls" as const
    : data.stop_reason === "max_tokens" ? "length" as const
    : "stop" as const;

  return {
    content,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason,
    stats: data.usage
      ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0, reasoningTokens: 0, source: "provider" }
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
  const body = buildAnthropicBody(request, true);

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  let fullContent = "";
  const toolCalls: UnifiedToolCall[] = [];
  let currentToolId = "";
  let currentToolName = "";
  let currentToolInput = "";
  let finishReason: UnifiedResponse["finishReason"] = "stop";
  let usage: { input_tokens?: number; output_tokens?: number } | undefined;

  await readSSEStream(res, (parsed) => {
    const eventType = parsed.type as string;

    if (eventType === "content_block_start") {
      const block = parsed.content_block as { type: string; id?: string; name?: string } | undefined;
      if (block?.type === "tool_use") {
        currentToolId = block.id ?? "";
        currentToolName = block.name ?? "";
        currentToolInput = "";
      }
    }

    if (eventType === "content_block_delta") {
      const delta = parsed.delta as { type: string; text?: string; partial_json?: string } | undefined;
      if (delta?.type === "text_delta" && delta.text) {
        fullContent += delta.text;
        onChunk({ type: "content", content: delta.text });
      }
      if (delta?.type === "input_json_delta" && delta.partial_json) {
        currentToolInput += delta.partial_json;
      }
    }

    if (eventType === "content_block_stop") {
      if (currentToolId) {
        toolCalls.push({
          id: currentToolId,
          name: currentToolName,
          arguments: safeParseArgs(currentToolInput),
        });
        currentToolId = "";
        currentToolName = "";
        currentToolInput = "";
      }
    }

    if (eventType === "message_delta") {
      const delta = parsed.delta as { stop_reason?: string } | undefined;
      if (delta?.stop_reason === "tool_use") finishReason = "tool_calls";
      else if (delta?.stop_reason === "max_tokens") finishReason = "length";
      else if (delta?.stop_reason === "end_turn") finishReason = "stop";

      const msgUsage = parsed.usage as { output_tokens?: number } | undefined;
      if (msgUsage) {
        usage = { ...usage, output_tokens: msgUsage.output_tokens };
      }
    }

    if (eventType === "message_start") {
      const message = parsed.message as { usage?: { input_tokens?: number } } | undefined;
      if (message?.usage) {
        usage = { ...usage, input_tokens: message.usage.input_tokens };
      }
    }

    return false;
  });

  if (toolCalls.length > 0) {
    onChunk({ type: "tool_calls", tool_calls: toolCalls, finishReason });
  }

  const stats = usage
    ? { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0, reasoningTokens: 0, source: "provider" as const }
    : undefined;

  if (stats) onChunk({ type: "stats", stats });
  onChunk({ type: "done", finishReason });

  return { content: fullContent, tool_calls: toolCalls.length > 0 ? toolCalls : undefined, finishReason, stats };
}
