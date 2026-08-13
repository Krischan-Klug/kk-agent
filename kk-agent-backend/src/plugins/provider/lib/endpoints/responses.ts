import { randomUUID } from "node:crypto";
import type { ContinuationMode } from "../../types.js";
import type {
  AssembledOutputItem,
  OnChunkFn,
  ProviderNotice,
  ProviderTransportState,
  ResponsesConversationItem,
  ResponsesTransportState,
  UnifiedRequest,
  UnifiedResponse,
} from "../types.js";
import { readSSEStream } from "../sse.js";
import { buildRequestConfigBody } from "../request-body.js";
import {
  buildResponsesTools,
  buildUnifiedResponseFromTurn,
  serializeAssistantMessageToResponsesInput,
  serializeToolMessageToResponsesInput,
  serializeUserMessageToResponsesInput,
} from "../helpers.js";
import {
  finalizeResponsesOutput,
  handleResponsesStreamingEvent,
  normalizeResponsesToolCalls,
} from "../transport.js";
import {
  getToolUses,
  reasoningBlock,
  textBlock,
  type TranscriptMessage,
} from "kk-agent-contract";
import {
  consumeProviderStreamError,
  emitFinalStreamChunks,
  emitToolUseDeltas,
  normalizeProviderUsage,
  type ProviderTokenUsage,
} from "../provider-common.js";

type ContinuationFallback = {
  from: ContinuationMode;
  to: ContinuationMode;
  reason: string;
};

function cloneConversationItem<
  T extends ResponsesConversationItem | AssembledOutputItem,
>(item: T): T {
  return structuredClone(item);
}

function isResponsesTransportState(
  state: ProviderTransportState | undefined,
): state is ResponsesTransportState {
  return state?.endpoint === "responses";
}

function createResponsesState(
  continuationMode: ContinuationMode,
): ResponsesTransportState {
  return {
    endpoint: "responses",
    continuationMode,
    syncedMessageIds: [],
    callIdByToolUseId: {},
    lastResponseId: undefined,
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
    callIdByToolUseId: { ...state.callIdByToolUseId },
    lastResponseId: state.lastResponseId,
  };
}

function isStateCompatibleWithTranscript(
  state: ResponsesTransportState,
  messages: TranscriptMessage[],
): boolean {
  const messageIds = new Set(messages.map((message) => message.id));
  return state.syncedMessageIds.every((messageId) => messageIds.has(messageId));
}

function emitDeltaBlocks(
  parsed: Record<string, unknown>,
  messageId: string,
  onChunk: OnChunkFn,
): void {
  const eventType = typeof parsed.type === "string" ? parsed.type : "";
  const delta = typeof parsed.delta === "string" ? parsed.delta : undefined;
  if (!delta || delta.length === 0) return;

  if (
    eventType === "response.output_text.delta" ||
    eventType === "response.text.delta"
  ) {
    onChunk({
      type: "assistant_block_delta",
      messageId,
      block: textBlock(delta),
    });
    return;
  }

  if (
    eventType === "response.reasoning_text.delta" ||
    eventType === "response.reasoning_summary_text.delta"
  ) {
    onChunk({
      type: "assistant_block_delta",
      messageId,
      block: reasoningBlock(delta),
    });
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
  modelContentByMessageId: UnifiedRequest["modelContentByMessageId"],
): {
  transportState: ResponsesTransportState;
  appendedItems: ResponsesConversationItem[];
} {
  const syncedMessageIds = new Set(state.syncedMessageIds);
  const appendedItems: ResponsesConversationItem[] = [];

  for (const message of messages) {
    if (syncedMessageIds.has(message.id)) continue;

    if (message.role === "system") {
      throw new Error("Responses conversation input must not contain system messages; use request.instructions.");
    }

    if (message.role === "assistant") {
      const serialized = serializeAssistantMessageToResponsesInput(message);
      const cloned = serialized.map((item) => cloneConversationItem(item));
      appendedItems.push(...cloned);
      for (const toolUse of getToolUses(message)) state.callIdByToolUseId[toolUse.id] = toolUse.id;
      syncedMessageIds.add(message.id);
      state.syncedMessageIds.push(message.id);
      continue;
    }

    const serialized =
      message.role === "user"
        ? serializeUserMessageToResponsesInput(message, modelContentByMessageId?.[message.id])
        : serializeToolMessageToResponsesInput(
            message,
            state.callIdByToolUseId,
          );

    const cloned = serialized.map((item) => cloneConversationItem(item));
    appendedItems.push(...cloned);
    syncedMessageIds.add(message.id);
    state.syncedMessageIds.push(message.id);
  }

  return { transportState: state, appendedItems };
}

function prepareResponsesRequest(
  request: UnifiedRequest,
): PreparedResponsesRequest {
  const requestedContinuationMode =
    request.transportProfile?.continuationMode ?? "previous-response-id";
  const candidateState = isResponsesTransportState(request.transportState)
    ? request.transportState
    : undefined;
  const stateWasInvalidated = Boolean(
    candidateState && !isStateCompatibleWithTranscript(candidateState, request.messages),
  );
  const baseState = candidateState && !stateWasInvalidated ? candidateState : undefined;
  const continuationMode =
    requestedContinuationMode === "previous-response-id" &&
    baseState?.lastResponseId
      ? "previous-response-id"
      : requestedContinuationMode === "none"
        ? "none"
        : "raw-output-replay";
  const transportState = cloneResponsesState(baseState, continuationMode);
  if (continuationMode !== "previous-response-id") {
    transportState.syncedMessageIds = [];
    transportState.callIdByToolUseId = {};
  }
  const { appendedItems } = appendUnsyncedConversationItems(
    transportState,
    request.messages,
    request.modelContentByMessageId,
  );
  const notices: ProviderNotice[] = [
    ...(stateWasInvalidated ? [{
      level: "warning" as const,
      code: "responses_transport_state_reset",
      message: "Responses continuation cache did not match the canonical transcript and was rebuilt.",
    }] : []),
  ];
  const body: Record<string, unknown> = {
    ...buildRequestConfigBody(request.resolvedLlmRequestConfig),
    model: request.model,
    stream: true,
  };

  const tools = buildResponsesTools(
    request.tools,
    request.transportProfile?.supportsStrictTools === true,
  );

  if (request.instructions.trim()) body.instructions = request.instructions;
  if (tools?.length) body.tools = tools;
  if (
    continuationMode === "previous-response-id" &&
    transportState.lastResponseId
  ) {
    body.previous_response_id = transportState.lastResponseId;
    if (appendedItems.length > 0) {
      body.input = appendedItems;
    }
  } else {
    body.input = appendedItems;
  }

  return { body, transportState, notices, continuationMode };
}

function commitResponsesTransportState(input: {
  transportState: ResponsesTransportState;
  assistantMessageId: string;
  output: AssembledOutputItem[];
  responseId?: string;
}): ResponsesTransportState {
  const next = cloneResponsesState(
    input.transportState,
    input.transportState.continuationMode,
  );
  next.lastResponseId = input.responseId ?? next.lastResponseId;
  if (!next.syncedMessageIds.includes(input.assistantMessageId)) {
    next.syncedMessageIds.push(input.assistantMessageId);
  }

  for (const item of input.output) {
    if (item.type !== "function_call") continue;
    const callId =
      typeof item.call_id === "string"
        ? item.call_id
        : typeof item.id === "string"
          ? item.id
          : undefined;
    if (callId) {
      next.callIdByToolUseId[callId] = callId;
    }
  }

  return next;
}

function isUnsupportedPreviousResponseIdResponse(
  status: number,
  text: string,
): boolean {
  if (
    status !== 400 &&
    status !== 404 &&
    status !== 405 &&
    status !== 422 &&
    status !== 501
  ) {
    return false;
  }

  const lowered = text.toLowerCase();
  return (
    lowered.includes("previous_response_id") ||
    lowered.includes("previous response") ||
    lowered.includes("conversation") ||
    lowered.includes("unsupported") ||
    lowered.includes("not implemented") ||
    lowered.includes("unknown")
  );
}

function buildContinuationFallbackReason(status: number, text: string): string {
  return `previous_response_id failed with HTTP ${status}: ${text}`;
}

async function postResponses(
  request: UnifiedRequest,
  baseUrl: string,
  headers: Record<string, string>,
): Promise<{
  res: Response;
  prepared: PreparedResponsesRequest;
  notices: ProviderNotice[];
  continuationFallback?: ContinuationFallback;
}> {
  const prepared = prepareResponsesRequest(request);
  let res = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(prepared.body),
  });

  if (res.ok) {
    return { res, prepared, notices: [] };
  }

  const text = await res.text();
  const status = res.status;
  if (
    prepared.continuationMode === "previous-response-id" &&
    isUnsupportedPreviousResponseIdResponse(res.status, text)
  ) {
    const fallbackPrepared = prepareResponsesRequest({
      ...request,
      transportProfile: request.transportProfile
        ? { ...request.transportProfile, continuationMode: "raw-output-replay" }
        : request.transportProfile,
    });
    res = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(fallbackPrepared.body),
    });

    if (!res.ok) {
      const fallbackText = await res.text();
      throw new Error(`Responses API error ${res.status}: ${fallbackText}`);
    }

    return {
      res,
      prepared: fallbackPrepared,
      notices: [
        {
          level: "warning",
          code: "response_statefulness_fallback",
          message:
            "Provider rejected previous_response_id. Retried with raw output replay.",
        },
      ],
      continuationFallback: {
        from: "previous-response-id",
        to: "raw-output-replay",
        reason: buildContinuationFallbackReason(status, text),
      },
    };
  }

  throw new Error(`Responses API error ${res.status}: ${text}`);
}

export async function chatStream(
  request: UnifiedRequest,
  baseUrl: string,
  onChunk: OnChunkFn,
  headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  const posted = await postResponses(request, baseUrl, headers);
  const prepared = posted.prepared;
  const messageId = randomUUID();
  const providerNotices: ProviderNotice[] = [...posted.notices];
  let output: Array<Record<string, unknown> & { type: string }> = [];
  let usage: ProviderTokenUsage | undefined;
  let responseId: string | undefined;
  const emittedToolUseIds = new Set<string>();
  let fatalStreamError: string | undefined;

  await readSSEStream(
    posted.res,
    (parsed) => {
      const streamError = consumeProviderStreamError(parsed, providerNotices);
      if (streamError.handled) {
        fatalStreamError = streamError.fatalError ?? fatalStreamError;
        return true;
      }

      emitDeltaBlocks(parsed, messageId, onChunk);
      const next = handleResponsesStreamingEvent(parsed, output);
      output = next.output;
      const eventType = typeof parsed.type === "string" ? parsed.type : "";
      const shouldEmitToolUses =
        eventType === "response.completed" ||
        (eventType === "response.output_item.done" &&
          typeof parsed.item === "object" &&
          parsed.item !== null &&
          "type" in parsed.item &&
          parsed.item.type === "function_call");

      if (shouldEmitToolUses) {
        const normalizedToolCalls = normalizeResponsesToolCalls({
          output,
          tools: request.tools,
          supportsConcatenatedJsonSplit:
            request.transportProfile?.supportsConcatenatedJsonSplit ?? true,
        }).toolCalls;
        emitToolUseDeltas(
          normalizedToolCalls,
          emittedToolUseIds,
          messageId,
          onChunk,
        );
      }

      if (next.metadata?.error) {
        providerNotices.push({
          level: "error",
          message: next.metadata.error,
        });
        fatalStreamError = next.metadata.error;
        return true;
      }

      if (next.metadata?.usage) {
        usage = next.metadata.usage as ProviderTokenUsage;
      }
      if (typeof next.metadata?.responseId === "string") {
        responseId = next.metadata.responseId;
      }

      return false;
    },
    { throwOnProviderError: false },
  );

  if (fatalStreamError && output.length === 0) {
    throw new Error(fatalStreamError);
  }

  const turn = finalizeResponsesOutput({
    messageId,
    output,
    usage: normalizeProviderUsage(usage),
    tools: request.tools,
    supportsConcatenatedJsonSplit:
      request.transportProfile?.supportsConcatenatedJsonSplit ?? true,
  });

  const response = buildUnifiedResponseFromTurn(turn);
  response.transportState = commitResponsesTransportState({
    transportState: prepared.transportState,
    assistantMessageId: response.message.id,
    output,
    responseId,
  });
  response.debug = {
    endpoint: "responses",
    continuationMode: prepared.continuationMode,
    responseId,
    outputCount: output.length,
    ...(posted.continuationFallback
      ? { continuationFallback: posted.continuationFallback }
      : {}),
  };
  if (prepared.notices.length > 0 || providerNotices.length > 0) {
    response.notices = [
      ...prepared.notices,
      ...providerNotices,
      ...(response.notices ?? []),
    ];
  }
  emitFinalStreamChunks(response, onChunk);
  return response;
}
