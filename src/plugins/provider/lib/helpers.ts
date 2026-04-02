import type { UnifiedMessage, UnifiedRequest, UnifiedToolCall, OnChunkFn } from "./types.js";

/* ── JSON parsing ── */

/** Safely parse tool-call arguments JSON, returning a fallback on failure. */
export function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    console.warn("[provider] Malformed tool call arguments:", raw);
    return { _raw: raw };
  }
}

/* ── Think-tag parsing ── */

/**
 * Parse `<think>...</think>` tags from streaming content.
 * Some models wrap reasoning in these tags instead of using `reasoning_content`.
 * Returns the updated `inThink` state for the next chunk.
 */
export function parseThinkTags(
  text: string,
  inThink: boolean,
  onChunk: OnChunkFn,
): boolean {
  while (text.length > 0) {
    if (!inThink) {
      const thinkStart = text.indexOf("<think>");
      if (thinkStart === -1) {
        onChunk({ type: "content", content: text });
        text = "";
      } else {
        if (thinkStart > 0) onChunk({ type: "content", content: text.slice(0, thinkStart) });
        inThink = true;
        text = text.slice(thinkStart + 7);
      }
    } else {
      const thinkEnd = text.indexOf("</think>");
      if (thinkEnd === -1) {
        onChunk({ type: "reasoning", content: text });
        text = "";
      } else {
        if (thinkEnd > 0) onChunk({ type: "reasoning", content: text.slice(0, thinkEnd) });
        inThink = false;
        text = text.slice(thinkEnd + 8);
      }
    }
  }
  return inThink;
}

/* ── OpenAI Chat Completions format builders ── */

/** Convert UnifiedMessage[] → OpenAI Chat Completions messages format */
export function buildMessages(messages: UnifiedMessage[]) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool" as const, content: m.content as string, tool_call_id: m.tool_call_id };
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant" as const,
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    // Content blocks (arrays) are passed through -- OpenAI Chat Completions API accepts them natively
    return { role: m.role, content: m.content };
  });
}

/** Convert UnifiedRequest tools → OpenAI `tools` array */
export function buildTools(request: UnifiedRequest) {
  return request.tools?.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Build the full Chat Completions request body */
export function buildChatCompletionsBody(request: UnifiedRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: buildMessages(request.messages),
    stream,
  };

  const tools = buildTools(request);
  if (tools?.length) body.tools = tools;
  if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined && request.maxOutputTokens > 0) {
    body.max_tokens = request.maxOutputTokens;
  }
  if (stream) body.stream_options = { include_usage: true };

  return body;
}

/* ── Response parsing ── */

/** Parse tool calls from a non-streaming Chat Completions response */
export function parseToolCalls(
  rawCalls?: Array<{ id: string; function: { name: string; arguments: string } }>,
): UnifiedToolCall[] | undefined {
  if (!rawCalls?.length) return undefined;
  return rawCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: safeParseArgs(tc.function.arguments),
  }));
}

/** Map a Chat Completions finish_reason string to our unified enum */
export function mapFinishReason(reason?: string | null): "stop" | "tool_calls" | "length" {
  if (reason === "tool_calls") return "tool_calls";
  if (reason === "length") return "length";
  return "stop";
}
