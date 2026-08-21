import { useCallback, useEffect, useRef, useState } from "react";
import { session as sessionApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import {
  getChatStreamSnapshot,
  resetChatStreamSnapshot,
  subscribeChatStreamSnapshot,
  updateChatStreamSnapshot,
} from "@/lib/chatStreamState";
import type {
  SessionMessage,
  SessionState,
  RunEvent,
  StreamEvent,
  TranscriptAssetRefBlock,
  TranscriptBlock,
  TranscriptToolUseBlock,
  TranscriptToolResultBlock,
} from "@/types/api";
import type { PendingAsset } from "@/hooks/useAssets";
import type { ActiveToolCall, StreamingTurnState } from "@/components/chat/types";
import { getToolCallDisplayText } from "@/components/chat/messageBlocks";

const logger = createLogger("chat-stream");

type Options = {
  session: SessionState | null;
  pendingAssets: PendingAsset[];
  clearAssets: () => void;
  loadContextData: (sessionId: string) => Promise<void>;
  loadDebugData: (sessionId: string) => void;
  setSession: React.Dispatch<React.SetStateAction<SessionState | null>>;
  debugOpen: boolean;
};

function mergeStreamBlock(existing: TranscriptBlock[], block: TranscriptBlock): TranscriptBlock[] {
  const last = existing.at(-1);

  if (block.type === "text" || block.type === "reasoning") {
    if (last && last.type === block.type) {
      return [...existing.slice(0, -1), { ...last, text: last.text + block.text }];
    }
    return [...existing, block];
  }

  if (block.type === "tool_use") {
    const next = [...existing];
    const existingIndex = next.findIndex((entry) => entry.type === "tool_use" && entry.id === block.id);
    if (existingIndex >= 0) {
      next[existingIndex] = block;
      return next;
    }
  }

  return [...existing, block];
}

function createDraftAssistantMessage(messageId: string, block?: TranscriptBlock): SessionMessage {
  return {
    id: messageId,
    role: "assistant",
    content: block ? [block] : [],
    timestamp: new Date().toISOString(),
  };
}

function collectToolUsesFromMessage(message: SessionMessage): TranscriptToolUseBlock[] {
  return message.content.filter((entry): entry is TranscriptToolUseBlock => entry.type === "tool_use");
}

function syncStepToolCalls(assistant: SessionMessage, existingToolCalls: ActiveToolCall[]): ActiveToolCall[] {
  const toolUses = collectToolUsesFromMessage(assistant);
  const existingById = new Map(existingToolCalls.map((toolCall) => [toolCall.id, toolCall]));

  const synced = toolUses.map((toolUse) => {
    const existing = existingById.get(toolUse.id);
    const displayText = getToolCallDisplayText(toolUse.input, toolUse.name);
    return existing
      ? {
          ...existing,
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
          ...(displayText ? { displayText } : {}),
        }
      : {
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
          status: "queued" as const,
          ...(displayText ? { displayText } : {}),
        };
  });

  for (const toolCall of existingToolCalls) {
    if (!toolUses.some((toolUse) => toolUse.id === toolCall.id)) {
      synced.push(toolCall);
    }
  }

  return synced;
}

function completeYieldedToolCalls(steps: StreamingTurnState["steps"]): StreamingTurnState["steps"] {
  return steps.map((step) => ({
    ...step,
    toolCalls: step.toolCalls.map((toolCall) =>
      toolCall.status === "yielded"
        ? {
            ...toolCall,
            status: "completed",
            detail: toolCall.detail ?? `${toolCall.name} completed`,
            summary: toolCall.summary ?? `${toolCall.name} completed`,
          }
        : toolCall,
    ),
  }));
}

function updateStepAssistant(
  previous: StreamingTurnState | null,
  messageId: string,
  updateAssistant: (assistant: SessionMessage | null) => SessionMessage,
): StreamingTurnState {
  const steps = previous?.steps ? [...previous.steps] : [];
  const index = steps.findIndex((step) => step.assistant.id === messageId);

  if (index >= 0) {
    const current = steps[index]!;
    const assistant = updateAssistant(current.assistant);
    steps[index] = {
      ...current,
      assistant,
      toolCalls: syncStepToolCalls(assistant, current.toolCalls),
    };
    return { steps };
  }

  const assistant = updateAssistant(null);
  const lastStep = steps.at(-1);
  if (
    lastStep &&
    lastStep.assistant.id.startsWith("stream-tool-") &&
    (
      collectToolUsesFromMessage(assistant).some((toolUse) => lastStep.toolCalls.some((toolCall) => toolCall.id === toolUse.id)) ||
      lastStep.assistant.content.length === 0
    )
  ) {
    steps[steps.length - 1] = {
      ...lastStep,
      assistant,
      toolCalls: syncStepToolCalls(assistant, lastStep.toolCalls),
    };
    return { steps };
  }

  const nextStep = {
    assistant,
    toolCalls: syncStepToolCalls(assistant, []),
  };
  return {
    steps: [
      ...completeYieldedToolCalls(steps),
      nextStep,
    ],
  };
}

function updateStepToolCall(previous: StreamingTurnState | null, event: Extract<StreamEvent, { type: "tool_execution_update" }>): StreamingTurnState {
  const steps = previous?.steps ? [...previous.steps] : [];
  let stepIndex = steps.findIndex((step) =>
    step.toolCalls.some((toolCall) => toolCall.id === event.toolUseId) ||
    collectToolUsesFromMessage(step.assistant).some((toolUse) => toolUse.id === event.toolUseId),
  );

  if (stepIndex < 0) {
    if (steps.length === 0) {
      steps.push({
        assistant: createDraftAssistantMessage(`stream-tool-${event.toolUseId}`),
        toolCalls: [],
      });
      stepIndex = 0;
    } else {
      stepIndex = steps.length - 1;
    }
  }

  const step = steps[stepIndex]!;
  const toolCallIndex = step.toolCalls.findIndex((toolCall) => toolCall.id === event.toolUseId);
  const currentToolCall: ActiveToolCall = toolCallIndex >= 0
    ? step.toolCalls[toolCallIndex]!
    : { id: event.toolUseId, name: event.toolName, input: event.input ?? {}, status: event.status };
  const input = event.input ?? currentToolCall.input;
  const displayText = getToolCallDisplayText(input, event.toolName);

  const updatedToolCall: ActiveToolCall = {
    ...currentToolCall,
    id: event.toolUseId,
    name: event.toolName,
    input,
    status: event.status,
    ...(displayText ? { displayText } : {}),
    ...(event.detail ? { detail: event.detail } : {}),
    ...(event.summary ? { summary: event.summary } : {}),
    ...(event.result ? { result: getToolResult(event.result) } : {}),
    ...(event.metadata ? { metadata: event.metadata } : {}),
  };

  const toolCalls = [...step.toolCalls];
  if (toolCallIndex >= 0) toolCalls[toolCallIndex] = updatedToolCall;
  else toolCalls.push(updatedToolCall);

  steps[stepIndex] = {
    ...step,
    toolCalls: syncStepToolCalls(step.assistant, toolCalls),
  };

  return { steps };
}

function buildOptimisticUserMessage(message: string, assets: PendingAsset[]): SessionMessage {
  const content: TranscriptBlock[] = [{ type: "text", text: message }];

  for (const asset of assets) {
    const block: TranscriptAssetRefBlock = { type: "asset_ref", assetId: asset.id };
    content.push(block);
  }

  return {
    id: `optimistic-user-${Date.now()}`,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
}

function getToolResult(message: SessionMessage | undefined): { content: string; isError: boolean; metadata?: Record<string, unknown> } | undefined {
  if (!message) return undefined;
  const block = message.content.find((entry): entry is TranscriptToolResultBlock => entry.type === "tool_result");
  if (!block) return undefined;
  return { content: block.content, isError: block.is_error === true, metadata: block.metadata };
}

function createTransportRunEvent(session: SessionState, message: string): RunEvent {
  return {
    id: `transport-${Date.now()}`,
    runId: `transport-${session.id}`,
    sessionId: session.id,
    anchorMessageId: session.messages.at(-1)?.id ?? session.id,
    kind: "run_failed",
    severity: "error",
    visibility: "user",
    terminal: true,
    errorCategory: "internal",
    code: "transport_error",
    message: "The connection to the agent was interrupted. The last saved state was restored.",
    detail: message,
    step: 0,
    attempt: 0,
    createdAt: new Date().toISOString(),
  };
}

function findSubmittedUserMessage(
  current: SessionState,
  previousMessageIds: Set<string>,
  text: string,
  assetIds: string[],
): boolean {
  return current.messages.some((message) => {
    if (message.role !== "user" || previousMessageIds.has(message.id)) return false;
    const messageText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const messageAssetIds = message.content
      .filter((block): block is TranscriptAssetRefBlock => block.type === "asset_ref")
      .map((block) => block.assetId);
    return messageText === text && assetIds.every((id) => messageAssetIds.includes(id));
  });
}

export function useChatStreaming({
  session,
  pendingAssets,
  clearAssets,
  loadContextData,
  loadDebugData,
  setSession,
  debugOpen,
}: Options) {
  const [input, setInput] = useState("");
  const [streamSnapshot, setStreamSnapshot] = useState(() => getChatStreamSnapshot(session?.id));
  const mountedRef = useRef(true);

  const setCustomAnswer = useCallback((value: string) => {
    if (!session) {
      setStreamSnapshot((previous) => ({ ...previous, customAnswer: value }));
      return;
    }
    updateChatStreamSnapshot(session.id, (previous) => ({ ...previous, customAnswer: value }));
  }, [session]);

  const resetStreamingState = useCallback(() => {
    if (!session) return;
    resetChatStreamSnapshot(session.id);
  }, [session]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setStreamSnapshot(getChatStreamSnapshot(session?.id));
    if (!session) return;
    return subscribeChatStreamSnapshot(session.id, () => {
      setStreamSnapshot(getChatStreamSnapshot(session.id));
    });
  }, [session]);

  const handleSend = useCallback(async () => {
    const hasText = input.trim().length > 0;
    const hasAssets = pendingAssets.length > 0;
    if ((!hasText && !hasAssets) || !session || streamSnapshot.sending) return;

    const message = input.trim() || " ";
    const optimisticAssets = pendingAssets;
    const assetIds = optimisticAssets.map((asset) => asset.id);
    const previousMessageIds = new Set(session.messages.map((entry) => entry.id));
    const previousRunIds = new Set(session.runs.map((entry) => entry.id));
    let completed = false;
    let transportError: string | undefined;

    setInput("");
    updateChatStreamSnapshot(session.id, (previous) => ({
      ...previous,
      sending: true,
      streaming: true,
      streamTurn: null,
      streamRunEvents: [],
      loopState: null,
      tokenStats: null,
      pendingPrompt: null,
    }));

    setSession((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        messages: [...previous.messages, buildOptimisticUserMessage(message, optimisticAssets)],
      };
    });

    try {
      await sessionApi.chatStream(session.id, message, async (event: StreamEvent) => {
        switch (event.type) {
          case "assistant_block_delta":
            updateChatStreamSnapshot(session.id, (previous) => ({
              ...previous,
              streamTurn: updateStepAssistant(previous.streamTurn, event.messageId, (assistant) => {
                if (!assistant) return createDraftAssistantMessage(event.messageId, event.block);
                return {
                  ...assistant,
                  content: mergeStreamBlock(assistant.content, event.block),
                };
              }),
            }));
            break;
          case "assistant_message_complete":
            updateChatStreamSnapshot(session.id, (previous) => ({
              ...previous,
              streamTurn: updateStepAssistant(previous.streamTurn, event.message.id, () => event.message),
            }));
            break;
          case "assistant_attempt_discarded":
            updateChatStreamSnapshot(session.id, (previous) => {
              if (!previous.streamTurn) return previous;
              const discarded = new Set(event.messageIds);
              return {
                ...previous,
                streamTurn: {
                  steps: previous.streamTurn.steps.filter((step) => !discarded.has(step.assistant.id)),
                },
              };
            });
            break;
          case "tool_execution_update":
            updateChatStreamSnapshot(session.id, (previous) => ({
              ...previous,
              streamTurn: updateStepToolCall(previous.streamTurn, event),
            }));
            if (event.result && ["create_tasks", "update_tasks", "solve_tasks"].includes(event.toolName)) {
              if (mountedRef.current) await loadContextData(session.id);
            }
            break;
          case "turn_state":
            updateChatStreamSnapshot(session.id, (previous) => ({ ...previous, loopState: event.state }));
            break;
          case "run_event":
            updateChatStreamSnapshot(session.id, (previous) => ({
              ...previous,
              streamRunEvents: previous.streamRunEvents.some((entry) => entry.id === event.event.id)
                ? previous.streamRunEvents
                : [...previous.streamRunEvents, event.event],
            }));
            break;
          case "stats":
            if (event.source === "provider") {
              updateChatStreamSnapshot(session.id, (previous) => ({
                ...previous,
                tokenStats: {
                  input: event.inputTokens,
                  output: event.outputTokens,
                  reasoning: event.reasoningTokens,
                  used: event.inputTokens + event.outputTokens,
                },
              }));
            }
            break;
          case "user_prompt":
            updateChatStreamSnapshot(session.id, (previous) => ({
              ...previous,
              pendingPrompt: {
                purpose: event.purpose,
                promptId: event.promptId,
                question: event.question,
                choices: event.choices,
              },
            }));
            break;
          case "done":
            completed = true;
            clearAssets();
            if (mountedRef.current) {
              setSession(event.session);
            }
            resetStreamingState();
            if (mountedRef.current) {
              await loadContextData(event.session.id);
            }
            emitAppEvent(SESSION_CHANGED_EVENT);
            if (debugOpen && mountedRef.current) loadDebugData(event.session.id);
            break;
          case "transport_error":
            logger.error(event.message);
            transportError = event.message;
            break;
        }
      }, assetIds.length > 0 ? assetIds : undefined);
      if (!completed) throw new Error(transportError ?? "The chat stream ended before completion.");
    } catch (err) {
      logger.error(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      let currentSession = session;
      try {
        currentSession = await sessionApi.get(session.id);
        if (mountedRef.current) setSession(currentSession);
        if (findSubmittedUserMessage(currentSession, previousMessageIds, message, assetIds)) {
          clearAssets();
        } else if (mountedRef.current && hasText) {
          setInput(input);
        }
      } catch (reloadError) {
        logger.warn(reloadError);
        if (mountedRef.current && hasText) setInput(input);
      }
      updateChatStreamSnapshot(session.id, (previous) => ({
        ...previous,
        sending: false,
        streaming: false,
        streamRunEvents: currentSession.runs
          .filter((run) => !previousRunIds.has(run.id))
          .some((run) => run.events.some((event) => event.terminal))
          ? previous.streamRunEvents
          : [...previous.streamRunEvents, createTransportRunEvent(currentSession, errorMessage)],
      }));
    } finally {
      if (!completed) {
        updateChatStreamSnapshot(session.id, (previous) => ({ ...previous, sending: false, streaming: false }));
      }
    }
  }, [
    clearAssets,
    debugOpen,
    input,
    loadContextData,
    loadDebugData,
    pendingAssets,
    resetStreamingState,
    session,
    setSession,
    streamSnapshot.sending,
  ]);

  const handlePromptResponse = useCallback(async (selectedKey: string) => {
    if (!session || !streamSnapshot.pendingPrompt) return;
    try {
      await sessionApi.respondToPrompt(session.id, streamSnapshot.pendingPrompt.promptId, selectedKey);
      updateChatStreamSnapshot(session.id, (previous) => ({ ...previous, pendingPrompt: null }));
    } catch (err) {
      logger.error(err);
    }
  }, [session, streamSnapshot.pendingPrompt]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const handleAgentSwitch = useCallback(async (
    agentId: string,
    onSwitch: (agentId: string) => Promise<void>,
  ) => {
    await onSwitch(agentId);
    if (session) {
      updateChatStreamSnapshot(session.id, (previous) => ({ ...previous, tokenStats: null }));
    }
    emitAppEvent(SESSION_CHANGED_EVENT);
  }, [session]);

  return {
    input,
    setInput,
    sending: streamSnapshot.sending,
    streaming: streamSnapshot.streaming,
    streamTurn: streamSnapshot.streamTurn,
    streamRunEvents: streamSnapshot.streamRunEvents,
    loopState: streamSnapshot.loopState,
    tokenStats: streamSnapshot.tokenStats,
    pendingPrompt: streamSnapshot.pendingPrompt,
    customAnswer: streamSnapshot.customAnswer,
    setCustomAnswer,
    handleSend,
    handlePromptResponse,
    handleKeyDown,
    handleAgentSwitch,
  };
}
