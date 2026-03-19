import type { UnifiedMessage, UnifiedRequest, UnifiedResponse, UnifiedToolCall, OnChunkFn } from "./types.js";

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    console.warn("[lmstudio] Malformed tool call arguments:", raw);
    return { _raw: raw };
  }
}

/** Parse <think>...</think> tags for reasoning vs content */
function parseThinkTags(
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

/** Convert UnifiedMessage[] → OpenAI Chat Completions messages format */
function buildMessages(messages: UnifiedMessage[]) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool" as const, content: m.content, tool_call_id: m.tool_call_id };
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
    return { role: m.role, content: m.content };
  });
}

/** Convert UnifiedToolDefinition[] → OpenAI tools format */
function buildTools(request: UnifiedRequest) {
  return request.tools?.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Build Chat Completions request body */
function buildBody(request: UnifiedRequest, stream: boolean): Record<string, unknown> {
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

/** Generic SSE stream reader */
async function readSSEStream(
  res: Response,
  onEvent: (parsed: Record<string, unknown>) => boolean, // return true to stop
): Promise<void> {
  if (!res.body) throw new Error("No response body for streaming");
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (onEvent(parsed)) return;
    }
  }
}

/* ──────────────────────────────────────────────────────────
   Chat Completions API (/v1/chat/completions)
   ────────────────────────────────────────────────────────── */

export async function callChatCompletions(
  request: UnifiedRequest,
  baseUrl: string,
): Promise<UnifiedResponse> {
  const body = buildBody(request, false);

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{
      message: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
      finish_reason: string;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      reasoning_tokens?: number;
    };
  };

  const choice = data.choices[0];
  const msg = choice.message;

  const toolCalls: UnifiedToolCall[] | undefined = msg.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: safeParseArgs(tc.function.arguments),
  }));

  let finishReason: UnifiedResponse["finishReason"] = "stop";
  if (choice.finish_reason === "tool_calls") finishReason = "tool_calls";
  else if (choice.finish_reason === "length") finishReason = "length";

  return {
    content: msg.content ?? "",
    tool_calls: toolCalls,
    finishReason,
    stats: data.usage ? {
      inputTokens: data.usage.prompt_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? 0,
      reasoningTokens: data.usage.reasoning_tokens ?? 0,
    } : undefined,
  };
}

export async function callChatCompletionsStream(
  request: UnifiedRequest,
  baseUrl: string,
  onChunk: OnChunkFn,
): Promise<UnifiedResponse> {
  const body = buildBody(request, true);

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio error ${res.status}: ${text}`);
  }

  let fullContent = "";
  let fullReasoning = "";
  let inThink = false;
  const toolCallDeltas: Map<number, { id: string; name: string; args: string }> = new Map();
  let finishReason: UnifiedResponse["finishReason"] = "stop";
  let usage: { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number } | undefined;

  await readSSEStream(res, (parsed) => {
    const choices = parsed.choices as Array<{
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
    }>;

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

    // Tool call deltas
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

  const stats = usage ? {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    reasoningTokens: usage.reasoning_tokens ?? 0,
  } : undefined;

  if (stats) {
    onChunk({ type: "stats", stats });
  }
  onChunk({ type: "done", finishReason });

  return { content: fullContent, reasoning: fullReasoning || undefined, tool_calls: toolCalls, finishReason, stats };
}
