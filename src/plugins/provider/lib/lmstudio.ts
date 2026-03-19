import type { UnifiedRequest, UnifiedResponse, UnifiedToolCall, OnChunkFn } from "./types.js";

export async function callLmStudio(
  request: UnifiedRequest,
  baseUrl: string,
): Promise<UnifiedResponse> {
  const openaiTools = request.tools?.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const openaiMessages = request.messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        content: m.content,
        tool_call_id: m.tool_call_id,
      };
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant" as const,
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model: request.model,
    messages: openaiMessages,
    stream: false,
  };

  if (openaiTools?.length) {
    body.tools = openaiTools;
  }
  if (request.reasoningEffort) {
    body.reasoning_effort = request.reasoningEffort;
  }
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (request.maxOutputTokens !== undefined) {
    body.max_tokens = request.maxOutputTokens;
  }

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
    arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

  let finishReason: UnifiedResponse["finishReason"] = "stop";
  if (choice.finish_reason === "tool_calls") {
    finishReason = "tool_calls";
  } else if (choice.finish_reason === "length") {
    finishReason = "length";
  }

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

function buildOpenaiMessages(request: UnifiedRequest) {
  return request.messages.map((m) => {
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

function buildOpenaiTools(request: UnifiedRequest) {
  return request.tools?.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export async function callLmStudioStream(
  request: UnifiedRequest,
  baseUrl: string,
  onChunk: OnChunkFn,
): Promise<UnifiedResponse> {
  const openaiTools = buildOpenaiTools(request);
  const openaiMessages = buildOpenaiMessages(request);

  const body: Record<string, unknown> = {
    model: request.model,
    messages: openaiMessages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (openaiTools?.length) body.tools = openaiTools;
  if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio error ${res.status}: ${text}`);
  }

  if (!res.body) throw new Error("No response body for streaming");

  let fullContent = "";
  let inThink = false;
  const toolCallDeltas: Map<number, { id: string; name: string; args: string }> = new Map();
  let finishReason: UnifiedResponse["finishReason"] = "stop";
  let usage: { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number } | undefined;

  const reader = res.body.getReader();
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

      const choices = parsed.choices as Array<{
        delta?: {
          content?: string | null;
          tool_calls?: Array<{
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string | null;
      }>;

      // Capture usage stats from chunk (usually in final chunk)
      const chunkUsage = parsed.usage as typeof usage;
      if (chunkUsage) usage = chunkUsage;

      if (!choices?.[0]) continue;
      const delta = choices[0].delta;
      const reason = choices[0].finish_reason;

      if (reason === "tool_calls") finishReason = "tool_calls";
      else if (reason === "length") finishReason = "length";
      else if (reason === "stop") finishReason = "stop";

      // Handle content chunks with <think> tag detection
      if (delta?.content) {
        // Always store raw content (including <think> tags) for persistence
        fullContent += delta.content;

        let text = delta.content;

        // Parse think tags for streaming events
        while (text.length > 0) {
          if (!inThink) {
            const thinkStart = text.indexOf("<think>");
            if (thinkStart === -1) {
              onChunk({ type: "content", content: text });
              text = "";
            } else {
              if (thinkStart > 0) {
                onChunk({ type: "content", content: text.slice(0, thinkStart) });
              }
              inThink = true;
              text = text.slice(thinkStart + 7);
            }
          } else {
            const thinkEnd = text.indexOf("</think>");
            if (thinkEnd === -1) {
              onChunk({ type: "reasoning", content: text });
              text = "";
            } else {
              if (thinkEnd > 0) {
                onChunk({ type: "reasoning", content: text.slice(0, thinkEnd) });
              }
              inThink = false;
              text = text.slice(thinkEnd + 8);
            }
          }
        }
      }

      // Handle tool call deltas
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
    }
  }

  // Build final tool calls
  const toolCalls: UnifiedToolCall[] | undefined =
    toolCallDeltas.size > 0
      ? [...toolCallDeltas.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, tc]) => ({
            id: tc.id,
            name: tc.name,
            arguments: JSON.parse(tc.args || "{}") as Record<string, unknown>,
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

  return { content: fullContent, tool_calls: toolCalls, finishReason, stats };
}
