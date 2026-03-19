import type {
  UnifiedMessage,
  UnifiedRequest,
  UnifiedResponse,
  UnifiedToolCall,
  UnifiedToolDefinition,
} from "./types.js";

/* ── OpenAI helpers ─────────────────────────────────────── */

interface OpenAIMessage {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: Array<{
    type: string;
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  stream?: boolean;
}

function openaiToUnified(body: OpenAIRequest): UnifiedRequest {
  const messages: UnifiedMessage[] = body.messages.map((m) => {
    const msg: UnifiedMessage = {
      role: m.role as UnifiedMessage["role"],
      content: m.content ?? "",
    };
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (m.tool_calls?.length) {
      msg.tool_calls = m.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));
    }
    return msg;
  });

  const tools: UnifiedToolDefinition[] | undefined = body.tools?.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));

  return { model: body.model, messages, tools, stream: body.stream };
}

function unifiedToOpenai(response: UnifiedResponse): unknown {
  const message: Record<string, unknown> = {
    role: "assistant",
    content: response.content || null,
  };

  if (response.tool_calls?.length) {
    message.tool_calls = response.tool_calls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
    }));
  }

  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    choices: [
      {
        index: 0,
        message,
        finish_reason: response.finishReason === "tool_calls" ? "tool_calls" : response.finishReason,
      },
    ],
  };
}

/* ── Anthropic helpers ──────────────────────────────────── */

interface AnthropicContent {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicMessage {
  role: string;
  content: string | AnthropicContent[];
}

interface AnthropicRequest {
  model: string;
  system?: string;
  messages: AnthropicMessage[];
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  stream?: boolean;
  max_tokens?: number;
}

function anthropicToUnified(body: AnthropicRequest): UnifiedRequest {
  const messages: UnifiedMessage[] = [];

  if (body.system) {
    messages.push({ role: "system", content: body.system });
  }

  for (const m of body.messages) {
    if (typeof m.content === "string") {
      messages.push({ role: m.role as UnifiedMessage["role"], content: m.content });
      continue;
    }

    // Array content blocks
    let text = "";
    const toolCalls: UnifiedToolCall[] = [];
    let toolCallId: string | undefined;
    let toolResult = "";

    for (const block of m.content) {
      if (block.type === "text") {
        text += block.text ?? "";
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id!,
          name: block.name!,
          arguments: block.input ?? {},
        });
      } else if (block.type === "tool_result") {
        toolCallId = block.tool_use_id;
        toolResult = typeof block.content === "string" ? block.content : "";
      }
    }

    if (toolCallId) {
      messages.push({ role: "tool", content: toolResult, tool_call_id: toolCallId });
    } else {
      const msg: UnifiedMessage = {
        role: m.role as UnifiedMessage["role"],
        content: text,
      };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      messages.push(msg);
    }
  }

  const tools: UnifiedToolDefinition[] | undefined = body.tools?.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));

  return { model: body.model, messages, tools, stream: body.stream };
}

function unifiedToAnthropic(response: UnifiedResponse): unknown {
  const content: AnthropicContent[] = [];

  if (response.content) {
    content.push({ type: "text", text: response.content });
  }

  if (response.tool_calls?.length) {
    for (const tc of response.tool_calls) {
      content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
    }
  }

  return {
    id: `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content,
    model: "proxy",
    stop_reason: response.finishReason === "tool_calls" ? "tool_use" : response.finishReason === "length" ? "max_tokens" : "end_turn",
  };
}

/* ── Public API ─────────────────────────────────────────── */

export function toUnified(body: unknown, format: "openai" | "anthropic"): UnifiedRequest {
  if (format === "anthropic") return anthropicToUnified(body as AnthropicRequest);
  return openaiToUnified(body as OpenAIRequest);
}

export function fromUnified(response: UnifiedResponse, format: "openai" | "anthropic"): unknown {
  if (format === "anthropic") return unifiedToAnthropic(response);
  return unifiedToOpenai(response);
}
