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
} from "../../lib/transcript.js";
import type { AssembledAssistantTurn, UnifiedRequest, UnifiedToolDefinition, UnifiedResponse } from "./types.js";

type ChatCompletionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function toChatCompletionsContent(message: TranscriptMessage): string | ChatCompletionContentPart[] {
  const textParts = message.content.filter((block) => block.type === "text").map((block) => block.text);
  const attachments = message.content.filter(
    (block): block is Extract<TranscriptBlock, { type: "attachment_ref" }> =>
      block.type === "attachment_ref" && block.category === "image" && Boolean(block.previewDataUrl),
  );
  if (attachments.length === 0) {
    return textParts.join("");
  }

  const parts: ChatCompletionContentPart[] = [];
  const combinedText = textParts.join("");
  if (combinedText) {
    parts.push({ type: "text", text: combinedText });
  }
  for (const attachment of attachments) {
    parts.push({ type: "image_url", image_url: { url: attachment.previewDataUrl! } });
  }
  return parts;
}

export function buildMessages(messages: TranscriptMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      const toolUses = getToolUses(message);
      const reasoning = getMessageReasoning(message) || undefined;
      return {
        role: "assistant" as const,
        content: getMessageText(message) || null,
        ...(reasoning ? { reasoning } : {}),
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
      content: toChatCompletionsContent(message),
    };
  });
}

function buildTools(request: UnifiedRequest) {
  return request.tools?.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export function buildChatCompletionsBody(request: UnifiedRequest, stream: boolean): Record<string, unknown> {
  const resolved = request.resolvedLlmRequestConfig;
  const common = resolved?.common;
  const body: Record<string, unknown> = {
    model: request.model,
    messages: buildMessages(request.messages),
    stream,
  };

  if (resolved?.extraBody) {
    Object.assign(body, resolved.extraBody);
  }
  const tools = buildTools(request);
  if (tools?.length) body.tools = tools;
  if (common?.reasoningEffort) {
    body.reasoning_effort = common.reasoningEffort;
  }
  if (common?.temperature !== undefined) {
    body.temperature = common.temperature;
  }
  if (common?.maxOutputTokens !== undefined && common.maxOutputTokens > 0) {
    body.max_tokens = common.maxOutputTokens;
  }
  if (stream) body.stream_options = { include_usage: true };

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

export function extractResponsesInstructions(messages: TranscriptMessage[]): string | undefined {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => getMessageText(message).trim())
    .filter((text) => text.length > 0)
    .join("\n\n")
    .trim();

  return instructions.length > 0 ? instructions : undefined;
}

export function serializeUserMessageToResponsesInput(message: TranscriptMessage): Array<Record<string, unknown>> {
  const text = getMessageText(message);
  const attachments = message.content.filter((block) => block.type === "attachment_ref");
  if (attachments.length === 0) {
    return [{ type: "message", role: "user", content: text }];
  }

  const content: Array<Record<string, unknown>> = [];
  if (text) content.push({ type: "input_text", text });
  for (const attachment of attachments) {
    if (attachment.category === "image" && attachment.previewDataUrl) {
      content.push({ type: "input_image", image_url: attachment.previewDataUrl });
    } else {
      content.push({
        type: "input_text",
        text: `[Attachment] ${attachment.filename} (${attachment.mimeType}, ${attachment.size} bytes)`,
      });
    }
  }
  return [{ type: "message", role: "user", content }];
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
