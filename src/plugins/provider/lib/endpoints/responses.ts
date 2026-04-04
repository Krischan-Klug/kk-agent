import { randomUUID } from "node:crypto";
import type { ContinuationMode } from "../../types.js";
import type {
  AssembledOutputItem,
  OnChunkFn,
  ProviderNotice,
  ProviderTransportState,
  ResponsesConversationItem,
  ResponsesTransportState,
  TokenStats,
  UnifiedRequest,
  UnifiedResponse,
} from "../types.js";
import { readSSEStream } from "../sse.js";
import {
  buildResponsesTools,
  buildUnifiedResponseFromTurn,
  extractResponsesInstructions,
  serializeToolMessageToResponsesInput,
  serializeUserMessageToResponsesInput,
} from "../helpers.js";
import { finalizeResponsesOutput, handleResponsesStreamingEvent } from "../transport.js";
import { reasoningBlock, textBlock, type TranscriptMessage } from "../../../lib/transcript.js";

type ResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  output_tokens_details?: { reasoning_tokens?: number };
};

type ResponsesApiResponse = {
  id?: string;
  output?: Array<Record<string, unknown>>;
  usage?: ResponsesUsage;
};

function cloneConversationItem<T extends ResponsesConversationItem | AssembledOutputItem>(item: T): T {
  return structuredClone(item);
}

function isResponsesTransportState(state: ProviderTransportState | undefined): state is ResponsesTransportState {
  return state?.endpoint === "responses";
}

function createResponsesState(continuationMode: ContinuationMode): ResponsesTransportState {
  return {
    endpoint: "responses",
    continuationMode,
    syncedMessageIds: [],
    historyItems: [],
    callIdByToolUseId: {},
  };
}

function cloneResponsesState(
  state: ResponsesTransportState | undefined,
  continuationMode: ContinuationMode,
): ResponsesTransportState {
  if (!state) return createResponsesState(continuationMode);
  return {
    endpoint: "responses",
    continuationMode,
    syncedMessageIds: [...state.syncedMessageIds],
    historyItems: state.historyItems.map((item) => cloneConversationItem(item)),
    callIdByToolUseId: { ...state.callIdByToolUseId },
  };
}

function normalizeUsage(usage?: ResponsesUsage): TokenStats | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    reasoningTokens: usage.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens ?? 0,
    source: "provider",
  };
}

function emitDeltaBlocks(parsed: Record<string, unknown>, messageId: string, onChunk: OnChunkFn): void {
  const eventType = typeof parsed.type === "string" ? parsed.type : "";
  const delta = typeof parsed.delta === "string" ? parsed.delta : undefined;
  if (!delta || delta.length === 0) return;

  if (eventType === "response.output_text.delta" || eventType === "response.text.delta") {
    onChunk({ type: "assistant_block_delta", messageId, block: textBlock(delta) });
    return;
  }

  if (eventType === "response.reasoning_text.delta" || eventType === "response.reasoning_summary_text.delta") {
    onChunk({ type: "assistant_block_delta", messageId, block: reasoningBlock(delta) });
  }
}

type PreparedResponsesRequest = {
  body: Record<string, unknown>;
  transportState: ResponsesTransportState;
  notices: ProviderNotice[];
  continuationMode: ContinuationMode;
};

function appendUnsyncedConversationItems(
  state: ResponsesTransportState,
  messages: TranscriptMessage[],
): { transportState: ResponsesTransportState; notices: ProviderNotice[] } {
  const syncedMessageIds = new Set(state.syncedMessageIds);
  const notices: ProviderNotice[] = [];

  for (const message of messages) {
    if (message.role === "system" || syncedMessageIds.has(message.id)) continue;

    if (message.role === "assistant") {
      notices.push({
        level: "warning",
        code: "responses_missing_native_output",
        message: `Responses transport skipped transcript-only assistant message ${message.id}; native output replay is required.`,
      });
      syncedMessageIds.add(message.id);
      state.syncedMessageIds.push(message.id);
      continue;
    }

    const serialized = message.role === "user"
      ? serializeUserMessageToResponsesInput(message)
      : serializeToolMessageToResponsesInput(message, state.callIdByToolUseId);

    state.historyItems.push(...serialized.map((item) => cloneConversationItem(item)));
    syncedMessageIds.add(message.id);
    state.syncedMessageIds.push(message.id);
  }

  return { transportState: state, notices };
}

export function prepareResponsesRequest(request: UnifiedRequest): PreparedResponsesRequest {
  const continuationMode = request.transportProfile?.continuationMode ?? "raw-output-replay";
  const baseState = isResponsesTransportState(request.transportState)
    ? request.transportState
    : undefined;
  const transportState = cloneResponsesState(baseState, continuationMode);
  const { notices } = appendUnsyncedConversationItems(transportState, request.messages);
  const body: Record<string, unknown> = {
    model: request.model,
    stream: request.stream === true,
  };

  const instructions = extractResponsesInstructions(request.messages);
  if (instructions) body.instructions = instructions;

  const tools = buildResponsesTools(request.tools, request.transportProfile?.supportsStrictTools === true);
  if (tools?.length) body.tools = tools;
  if (request.reasoningEffort) body.reasoning = { effort: request.reasoningEffort };
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined && request.maxOutputTokens > 0) {
    body.max_output_tokens = request.maxOutputTokens;
  }

  body.input = transportState.historyItems;

  return { body, transportState, notices, continuationMode };
}

export function commitResponsesTransportState(input: {
  transportState: ResponsesTransportState;
  assistantMessageId: string;
  output: AssembledOutputItem[];
}): ResponsesTransportState {
  const next = cloneResponsesState(input.transportState, input.transportState.continuationMode);
  next.historyItems.push(...input.output.map((item) => cloneConversationItem(item)));
  if (!next.syncedMessageIds.includes(input.assistantMessageId)) {
    next.syncedMessageIds.push(input.assistantMessageId);
  }

  for (const item of input.output) {
    if (item.type !== "function_call") continue;
    const toolUseId = typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : undefined;
    const callId = typeof item.call_id === "string" ? item.call_id : toolUseId;
    if (toolUseId && callId) {
      next.callIdByToolUseId[toolUseId] = callId;
    }
  }

  return next;
}

export async function chat(
  request: UnifiedRequest,
  baseUrl: string,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const prepared = prepareResponsesRequest({ ...request, stream: false });
  const res = await fetch(`${baseUrl}/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(prepared.body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Responses API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as ResponsesApiResponse;
  const output = (data.output ?? []).filter((item): item is Record<string, unknown> & { type: string } =>
    typeof item === "object" && item !== null && typeof item.type === "string"
  );
  const turn = finalizeResponsesOutput({
    messageId: randomUUID(),
    output,
    usage: normalizeUsage(data.usage),
    tools: request.tools,
    supportsConcatenatedJsonSplit: request.transportProfile?.supportsConcatenatedJsonSplit ?? true,
  });

  const response = buildUnifiedResponseFromTurn(turn);
  response.transportState = commitResponsesTransportState({
    transportState: prepared.transportState,
    assistantMessageId: response.message.id,
    output,
  });
  response.debug = {
    endpoint: "responses",
    continuationMode: prepared.continuationMode,
    requestBody: prepared.body,
    responseId: typeof data.id === "string" ? data.id : undefined,
    outputCount: output.length,
  };
  if (prepared.notices.length > 0) {
    response.notices = [...prepared.notices, ...(response.notices ?? [])];
  }
  return response;
}

export async function chatStream(
  request: UnifiedRequest,
  baseUrl: string,
  onChunk: OnChunkFn,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const prepared = prepareResponsesRequest({ ...request, stream: true });
  const res = await fetch(`${baseUrl}/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(prepared.body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Responses API error ${res.status}: ${text}`);
  }

  const messageId = randomUUID();
  const providerNotices: ProviderNotice[] = [];
  let output: Array<Record<string, unknown> & { type: string }> = [];
  let usage: ResponsesUsage | undefined;
  let responseId: string | undefined;

  await readSSEStream(res, (parsed) => {
    if (parsed.error && typeof parsed.error === "object") {
      const message =
        "message" in parsed.error && typeof parsed.error.message === "string"
          ? parsed.error.message
          : JSON.stringify(parsed.error);
      providerNotices.push({
        level: message.includes("tool call") ? "warning" : "error",
        message: `Provider stream stopped early: ${message}`,
      });
      return true;
    }

    if (parsed.type === "error" && typeof parsed.message === "string") {
      providerNotices.push({
        level: parsed.message.includes("tool call") ? "warning" : "error",
        message: `Provider stream stopped early: ${parsed.message}`,
      });
      return true;
    }

    emitDeltaBlocks(parsed, messageId, onChunk);
    const next = handleResponsesStreamingEvent(parsed, output);
    output = next.output;

    if (next.metadata?.error) {
      providerNotices.push({
        level: "error",
        message: next.metadata.error,
      });
      return true;
    }

    if (next.metadata?.usage) {
      usage = next.metadata.usage as ResponsesUsage;
    }
    if (typeof next.metadata?.responseId === "string") {
      responseId = next.metadata.responseId;
    }

    return false;
  }, { throwOnProviderError: false });

  const turn = finalizeResponsesOutput({
    messageId,
    output,
    usage: normalizeUsage(usage),
    tools: request.tools,
    supportsConcatenatedJsonSplit: request.transportProfile?.supportsConcatenatedJsonSplit ?? true,
  });

  const response = buildUnifiedResponseFromTurn(turn);
  response.transportState = commitResponsesTransportState({
    transportState: prepared.transportState,
    assistantMessageId: response.message.id,
    output,
  });
  response.debug = {
    endpoint: "responses",
    continuationMode: prepared.continuationMode,
    requestBody: prepared.body,
    responseId,
    outputCount: output.length,
  };
  if (prepared.notices.length > 0 || providerNotices.length > 0) {
    response.notices = [...prepared.notices, ...(response.notices ?? []), ...providerNotices];
  }
  onChunk({ type: "assistant_message", message: response.message, finishReason: response.finishReason });
  if (response.stats) onChunk({ type: "stats", stats: response.stats });
  onChunk({ type: "done", finishReason: response.finishReason });
  return response;
}
