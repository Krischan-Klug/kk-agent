import {
  LMStudioClient,
  type ChatHistoryData,
  type ChatMessageData,
  type ChatMessagePartTextData,
  type ChatMessagePartToolCallRequestData,
  type ChatMessagePartToolCallResultData,
  type FunctionToolCallRequest,
  type LLMTool,
} from "@lmstudio/sdk";
import type { UnifiedRequest, UnifiedToolDefinition, TokenStats } from "./types.js";
import { type TranscriptMessage, getMessageText, getToolResults, getToolUses } from "../../lib/transcript.js";

const clientCache = new Map<string, LMStudioClient>();

function toWsBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString().replace(/\/$/, "");
}

function toSdkTools(tools?: UnifiedToolDefinition[]): LLMTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as LLMTool["function"]["parameters"],
    },
  }));
}

function toSdkHistory(messages: TranscriptMessage[]): ChatHistoryData {
  return {
    messages: messages.map((message): ChatMessageData => {
      if (message.role === "assistant") {
        const content: Array<ChatMessagePartTextData | ChatMessagePartToolCallRequestData> = [];
        if (message.content.length > 0) {
          const text = getMessageText(message);
          if (text) content.push({ type: "text", text });
        }
        for (const toolCall of getToolUses(message)) {
            const toolCallRequest: FunctionToolCallRequest = {
              id: toolCall.id,
              type: "function",
              name: toolCall.name,
              arguments: toolCall.input,
            };
            content.push({
              type: "toolCallRequest",
              toolCallRequest,
            });
        }
        return { role: "assistant" as const, content };
      }

      if (message.role === "tool") {
        const toolResult = getToolResults(message)[0];
        const content: ChatMessagePartToolCallResultData[] = [{
          type: "toolCallResult",
          content: toolResult?.content ?? getMessageText(message),
          toolCallId: toolResult?.tool_use_id,
        }];
        return {
          role: "tool" as const,
          content,
        };
      }

      const content: ChatMessagePartTextData[] = [{ type: "text", text: getMessageText(message) }];
      return {
        role: message.role,
        content,
      };
    }),
  };
}

function getClient(baseUrl: string): LMStudioClient {
  const wsBaseUrl = toWsBaseUrl(baseUrl);
  const cached = clientCache.get(wsBaseUrl);
  if (cached) return cached;

  const client = new LMStudioClient({ baseUrl: wsBaseUrl });
  clientCache.set(wsBaseUrl, client);
  return client;
}

function buildEstimationText(request: UnifiedRequest): string {
  const parts: string[] = [];

  for (const message of request.messages) {
    parts.push(`[${message.role}]`);
    if (message.content.length > 0) {
      parts.push(getMessageText(message));
    }
    for (const toolCall of getToolUses(message)) {
      parts.push(`[tool_call:${toolCall.name}]`);
      parts.push(JSON.stringify(toolCall.input));
    }
    for (const toolResult of getToolResults(message)) {
      parts.push(`[tool_result:${toolResult.tool_use_id}]`);
      parts.push(toolResult.content);
    }
  }

  if (request.tools?.length) {
    for (const tool of request.tools) {
      parts.push(`[tool:${tool.name}]`);
      parts.push(tool.description ?? "");
      parts.push(JSON.stringify(tool.parameters ?? {}));
    }
  }

  return parts.join("\n");
}

function estimateFromRequestShape(request: UnifiedRequest): number {
  const text = buildEstimationText(request);
  const utf8Bytes = Buffer.byteLength(text, "utf8");
  const messageOverhead = request.messages.length * 12;
  const toolOverhead = (request.tools?.length ?? 0) * 48;
  return Math.max(1, Math.ceil(utf8Bytes / 4) + messageOverhead + toolOverhead);
}

export async function estimateRequestTokens(
  request: UnifiedRequest,
  baseUrl: string,
): Promise<TokenStats> {
  const shapeEstimate = estimateFromRequestShape(request);

  try {
    const client = getClient(baseUrl);
    const model = await client.llm.model(request.model);
    const prompt = await model.applyPromptTemplate(
      toSdkHistory(request.messages),
      { toolDefinitions: toSdkTools(request.tools) },
    );
    const sdkEstimate = await model.countTokens(prompt);
    const inputTokens =
      sdkEstimate > shapeEstimate * 3 || sdkEstimate < Math.max(Math.floor(shapeEstimate / 3), 1)
        ? shapeEstimate
        : sdkEstimate;
    return {
      inputTokens,
      outputTokens: 0,
      reasoningTokens: 0,
      source: "estimated",
    };
  } catch {
    return {
      inputTokens: shapeEstimate,
      outputTokens: 0,
      reasoningTokens: 0,
      source: "estimated",
    };
  }
}
