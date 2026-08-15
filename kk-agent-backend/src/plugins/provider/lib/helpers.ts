import {
  createTranscriptMessage,
  getMessageReasoning,
  getMessageText,
  getToolResults,
  getToolUses,
  reasoningBlock,
  textBlock,
  toolUseBlock,
  type TranscriptBlock,
  type TranscriptMessage,
  type TranscriptStopReason,
} from "kk-agent-contract";
import type { AssembledAssistantTurn, ModelContentPart, UnifiedRequest, UnifiedToolDefinition, UnifiedResponse } from "./types.js";

type ChatCompletionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function toChatCompletionsContent(message: TranscriptMessage, projection?: ModelContentPart[]): string | ChatCompletionContentPart[] {
  if (!projection) return getMessageText(message);
  if (projection.every((part) => part.type === "text")) return projection.map((part) => part.text).join("\n\n");
  return projection.map((part): ChatCompletionContentPart => part.type === "text"
    ? { type: "text", text: part.text }
    : { type: "image_url", image_url: { url: part.dataUrl } });
}

function buildMessages(messages: TranscriptMessage[], projections: Record<string, ModelContentPart[]> = {}) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      const toolUses = getToolUses(message);
      const reasoning = getMessageReasoning(message) || undefined;
      return {
        role: "assistant" as const,
        content: getMessageText(message) || null,
        ...(reasoning ? { reasoning_content: reasoning } : {}),
        ...(toolUses.length > 0
          ? {
              tool_calls: toolUses.map((toolUse) => ({
                id: toolUse.id,
                type: "function" as const,
                function: { name: toolUse.name, arguments: JSON.stringify(toolUse.input) },
              })),
            }
          : {}),
      };
    }

    if (message.role === "tool") {
      const toolResult = getToolResults(message)[0];
      return {
        role: "tool" as const,
        content: toolResult?.content ?? getMessageText(message),
        tool_call_id: toolResult?.tool_use_id,
      };
    }

    return {
      role: message.role,
      content: toChatCompletionsContent(message, projections[message.id]),
    };
  });
}

function buildTools(request: UnifiedRequest) {
  return request.tools?.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export function buildChatCompletionsBody(request: UnifiedRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...(request.providerRequestBody ?? {}),
    model: request.model,
    messages: [
      { role: "system", content: request.instructions },
      ...buildMessages(request.messages, request.modelContentByMessageId),
    ],
    stream: true,
  };

  const tools = buildTools(request);
  if (tools?.length) body.tools = tools;
  body.stream_options = { include_usage: true };

  return body;
}

function buildAssistantMessage(input: {
  text?: string;
  reasoning?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  finishReason?: TranscriptStopReason;
  usage?: { inputTokens: number; outputTokens: number; reasoningTokens: number };
  id?: string;
}): TranscriptMessage {
  const content: TranscriptBlock[] = [];
  if (input.reasoning) content.push(reasoningBlock(input.reasoning));
  if (input.text) content.push(textBlock(input.text));
  for (const toolCall of input.toolCalls ?? []) {
    content.push(toolUseBlock(toolCall.id, toolCall.name, toolCall.arguments));
  }
  return createTranscriptMessage({
    role: "assistant",
    content,
    stopReason: input.finishReason,
    usage: input.usage,
    id: input.id,
  });
}

export function buildUnifiedResponseFromTurn(turn: AssembledAssistantTurn): UnifiedResponse {
  const message = buildAssistantMessage({
    id: turn.messageId,
    text: turn.text,
    reasoning: turn.reasoning,
    toolCalls: turn.toolCalls,
    finishReason: turn.finishReason,
    usage: turn.usage,
  });

  return {
    message,
    finishReason: turn.finishReason,
    stats: turn.usage,
    notices: turn.notices,
    parseIssues: turn.parseIssues,
  };
}

export function mapFinishReason(reason?: string | null): TranscriptStopReason {
  if (reason === "tool_calls") return "tool_use";
  if (reason === "length") return "length";
  return "stop";
}

export function serializeUserMessageToResponsesInput(
  message: TranscriptMessage,
  projection?: ModelContentPart[],
): Array<Record<string, unknown>> {
  if (!projection) return [{ type: "message", role: "user", content: getMessageText(message) }];
  const content = projection.map((part) => part.type === "text"
    ? { type: "input_text", text: part.text }
    : { type: "input_image", image_url: part.dataUrl, ...(part.detail ? { detail: part.detail } : {}) });
  return [{ type: "message", role: "user", content }];
}

export function serializeAssistantMessageToResponsesInput(message: TranscriptMessage): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  const reasoning = getMessageReasoning(message);
  if (reasoning) {
    items.push({
      type: "reasoning",
      content: [{ type: "reasoning_text", text: reasoning }],
      summary: [],
    });
  }
  const text = getMessageText(message);
  if (text) {
    items.push({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }],
    });
  }
  for (const toolUse of getToolUses(message)) {
    items.push({
      type: "function_call",
      call_id: toolUse.id,
      name: toolUse.name,
      arguments: JSON.stringify(toolUse.input),
    });
  }
  return items;
}

export function serializeToolMessageToResponsesInput(
  message: TranscriptMessage,
  callIdByToolUseId: Record<string, string> = {},
): Array<Record<string, unknown>> {
  return getToolResults(message).map((toolResult) => ({
    type: "function_call_output",
    call_id: callIdByToolUseId[toolResult.tool_use_id] ?? toolResult.tool_use_id,
    output: toolResult.content,
  }));
}

export function buildResponsesTools(tools?: UnifiedToolDefinition[], strict = false) {
  return tools?.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict,
  }));
}
