/**
 * OpenAI Responses endpoint (/v1/responses)
 *
 * The newer OpenAI API format. Converts from/to our unified types.
 * Reference: https://platform.openai.com/docs/api-reference/responses
 */
import type { UnifiedMessage, UnifiedRequest, UnifiedResponse, UnifiedToolCall, OnChunkFn } from "../types.js";
import { readSSEStream } from "../sse.js";
import { safeParseArgs, buildTools } from "../helpers.js";

/* ── Format conversion ── */

/**
 * Convert UnifiedMessage[] → Responses API `input` array.
 * The responses API uses a flat list of typed items.
 */
function buildInput(messages: UnifiedMessage[]) {
  const input: Array<Record<string, unknown>> = [];

  for (const m of messages) {
    if (m.role === "system") {
      input.push({ type: "message", role: "system", content: m.content });
    } else if (m.role === "user") {
      // Handle multimodal content blocks for Responses API
      if (Array.isArray(m.content)) {
        const mapped = m.content.map((block) => {
          if (block.type === "text") return { type: "input_text", text: block.text };
          if (block.type === "image_url") return { type: "input_image", image_url: block.image_url.url };
          return block;
        });
        input.push({ type: "message", role: "user", content: mapped });
      } else {
        input.push({ type: "message", role: "user", content: m.content });
      }
    } else if (m.role === "assistant") {
      if (m.content) {
        input.push({ type: "message", role: "assistant", content: m.content });
      }
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          input.push({
            type: "function_call",
            id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          });
        }
      }
    } else if (m.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id,
        output: m.content,
      });
    }
  }

  return input;
}

function buildResponsesBody(request: UnifiedRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    input: buildInput(request.messages),
    stream,
  };

  const tools = request.tools?.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
  if (tools?.length) body.tools = tools;
  if (request.reasoningEffort) {
    body.reasoning = { effort: request.reasoningEffort };
  }
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined && request.maxOutputTokens > 0) {
    body.max_output_tokens = request.maxOutputTokens;
  }

  return body;
}

/* ── Non-streaming ── */

export async function chat(
  request: UnifiedRequest,
  baseUrl: string,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const body = buildResponsesBody(request, false);

  const res = await fetch(`${baseUrl}/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Responses API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    output: Array<{
      type: string;
      content?: Array<{ type: string; text?: string }>;
      id?: string;
      name?: string;
      arguments?: string;
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      reasoning_tokens?: number;
      output_tokens_details?: { reasoning_tokens?: number };
    };
  };

  let content = "";
  let reasoning = "";
  const toolCalls: UnifiedToolCall[] = [];

  for (const item of data.output) {
    if (item.type === "message" && item.content) {
      for (const part of item.content) {
        if (part.type === "output_text" && part.text) content += part.text;
      }
    } else if (item.type === "reasoning" && item.content) {
      for (const part of item.content) {
        if (part.type === "reasoning_text" && part.text) reasoning += part.text;
      }
    } else if (item.type === "function_call" && item.id && item.name) {
      toolCalls.push({
        id: item.id,
        name: item.name,
        arguments: safeParseArgs(item.arguments ?? "{}"),
      });
    }
  }

  return {
    content,
    reasoning: reasoning || undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
    stats: data.usage
      ? {
          inputTokens: data.usage.input_tokens ?? 0,
          outputTokens: data.usage.output_tokens ?? 0,
          reasoningTokens: data.usage.reasoning_tokens ?? data.usage.output_tokens_details?.reasoning_tokens ?? 0,
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
  const body = buildResponsesBody(request, true);

  const res = await fetch(`${baseUrl}/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Responses API error ${res.status}: ${text}`);
  }

  let fullContent = "";
  const toolCalls: UnifiedToolCall[] = [];
  let currentFnCallId = "";
  let currentFnCallName = "";
  let currentFnCallArgs = "";
  let fullReasoning = "";
  let usage: {
    input_tokens?: number;
    output_tokens?: number;
    reasoning_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  } | undefined;

  await readSSEStream(res, (parsed) => {
    const eventType = parsed.type as string;

    // Text content delta
    if (eventType === "response.output_text.delta") {
      const delta = parsed.delta as string;
      if (delta) {
        fullContent += delta;
        onChunk({ type: "content", content: delta });
      }
    }

    if (eventType === "response.reasoning_text.delta") {
      const delta = parsed.delta as string;
      if (delta) {
        fullReasoning += delta;
        onChunk({ type: "reasoning", content: delta });
      }
    }

    // Function call started
    if (eventType === "response.function_call_arguments.delta") {
      const delta = parsed.delta as string;
      if (delta) currentFnCallArgs += delta;
    }

    if (eventType === "response.output_item.added") {
      const item = parsed.item as { type?: string; id?: string; name?: string } | undefined;
      if (item?.type === "function_call") {
        currentFnCallId = item.id ?? "";
        currentFnCallName = item.name ?? "";
        currentFnCallArgs = "";
      }
    }

    // Function call done
    if (eventType === "response.output_item.done") {
      const item = parsed.item as { type?: string; id?: string; name?: string; arguments?: string } | undefined;
      if (item?.type === "function_call") {
        toolCalls.push({
          id: item.id ?? currentFnCallId,
          name: item.name ?? currentFnCallName,
          arguments: safeParseArgs(item.arguments ?? currentFnCallArgs),
        });
        currentFnCallId = "";
        currentFnCallName = "";
        currentFnCallArgs = "";
      }
    }

    // Completion
    if (eventType === "response.completed") {
      const response = parsed.response as { usage?: typeof usage } | undefined;
      if (response?.usage) usage = response.usage;
    }

    return false;
  });

  const finishReason = toolCalls.length > 0 ? "tool_calls" as const : "stop" as const;

  if (toolCalls.length > 0) {
    onChunk({ type: "tool_calls", tool_calls: toolCalls, finishReason });
  }

  const stats = usage
      ? {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          reasoningTokens: usage.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens ?? 0,
          source: "provider" as const,
        }
      : undefined;

  if (stats) onChunk({ type: "stats", stats });
  onChunk({ type: "done", finishReason });

  return {
    content: fullContent,
    reasoning: fullReasoning || undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason,
    stats,
  };
}
