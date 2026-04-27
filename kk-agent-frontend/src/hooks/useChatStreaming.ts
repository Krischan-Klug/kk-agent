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
  StreamEvent,
  TranscriptAttachmentRefBlock,
  TranscriptBlock,
  TranscriptToolUseBlock,
  TranscriptToolResultBlock,
} from "@/types/api";
import type { PendingAttachment } from "@/hooks/useAttachments";
import type { ActiveToolCall, StreamingTurnState } from "@/components/chat/types";

const logger = createLogger("chat-stream");

type Options = {
  session: SessionState | null;
  pendingAttachments: PendingAttachment[];
  consumePendingAttachments: () => PendingAttachment[];
  clearAttachments: (options?: { revokeUrls?: boolean }) => void;
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

function syncIterationToolCalls(assistant: SessionMessage, existingToolCalls: ActiveToolCall[]): ActiveToolCall[] {
  const toolUses = collectToolUsesFromMessage(assistant);
  const existingById = new Map(existingToolCalls.map((toolCall) => [toolCall.id, toolCall]));

  const synced = toolUses.map((toolUse) => {
    const existing = existingById.get(toolUse.id);
    return existing
      ? {
          ...existing,
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        }
      : {
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
          status: "queued" as const,
        };
  });

  for (const toolCall of existingToolCalls) {
    if (!toolUses.some((toolUse) => toolUse.id === toolCall.id)) {
      synced.push(toolCall);
    }
  }

  return synced;
}

function completeYieldedToolCalls(iterations: StreamingTurnState["iterations"]): StreamingTurnState["iterations"] {
  return iterations.map((iteration) => ({
    ...iteration,
    toolCalls: iteration.toolCalls.map((toolCall) =>
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

function updateIterationAssistant(
  previous: StreamingTurnState | null,
  messageId: string,
  updateAssistant: (assistant: SessionMessage | null) => SessionMessage,
): StreamingTurnState {
  const iterations = previous?.iterations ? [...previous.iterations] : [];
  const index = iterations.findIndex((iteration) => iteration.assistant.id === messageId);

  if (index >= 0) {
    const current = iterations[index]!;
    const assistant = updateAssistant(current.assistant);
    iterations[index] = {
      ...current,
      assistant,
      toolCalls: syncIterationToolCalls(assistant, current.toolCalls),
    };
    return { iterations };
  }

  const assistant = updateAssistant(null);
  const lastIteration = iterations.at(-1);
  if (
    lastIteration &&
    lastIteration.assistant.id.startsWith("stream-tool-") &&
    (
      collectToolUsesFromMessage(assistant).some((toolUse) => lastIteration.toolCalls.some((toolCall) => toolCall.id === toolUse.id)) ||
      lastIteration.assistant.content.length === 0
    )
  ) {
    iterations[iterations.length - 1] = {
      ...lastIteration,
      assistant,
      toolCalls: syncIterationToolCalls(assistant, lastIteration.toolCalls),
    };
    return { iterations };
  }

  const nextIteration = {
    assistant,
    toolCalls: syncIterationToolCalls(assistant, []),
  };
  return {
    iterations: [
      ...completeYieldedToolCalls(iterations),
      nextIteration,
    ],
  };
}

function updateIterationToolCall(previous: StreamingTurnState | null, event: Extract<StreamEvent, { type: "tool_execution_update" }>): StreamingTurnState {
  const iterations = previous?.iterations ? [...previous.iterations] : [];
  let iterationIndex = iterations.findIndex((iteration) =>
    iteration.toolCalls.some((toolCall) => toolCall.id === event.toolUseId) ||
    collectToolUsesFromMessage(iteration.assistant).some((toolUse) => toolUse.id === event.toolUseId),
  );

  if (iterationIndex < 0) {
    if (iterations.length === 0) {
      iterations.push({
        assistant: createDraftAssistantMessage(`stream-tool-${event.toolUseId}`),
        toolCalls: [],
      });
      iterationIndex = 0;
    } else {
      iterationIndex = iterations.length - 1;
    }
  }

  const iteration = iterations[iterationIndex]!;
  const toolCallIndex = iteration.toolCalls.findIndex((toolCall) => toolCall.id === event.toolUseId);
  const currentToolCall: ActiveToolCall = toolCallIndex >= 0
    ? iteration.toolCalls[toolCallIndex]!
    : { id: event.toolUseId, name: event.toolName, input: {}, status: event.status };

  const updatedToolCall: ActiveToolCall = {
    ...currentToolCall,
    id: event.toolUseId,
    name: event.toolName,
    status: event.status,
    ...(event.detail ? { detail: event.detail } : {}),
    ...(event.summary ? { summary: event.summary } : {}),
    ...(event.result ? { result: getToolResult(event.result) } : {}),
  };

  const toolCalls = [...iteration.toolCalls];
  if (toolCallIndex >= 0) toolCalls[toolCallIndex] = updatedToolCall;
  else toolCalls.push(updatedToolCall);

  iterations[iterationIndex] = {
    ...iteration,
    toolCalls: syncIterationToolCalls(iteration.assistant, toolCalls),
  };

  return { iterations };
}

function buildOptimisticUserMessage(message: string, attachments: PendingAttachment[]): SessionMessage {
  const content: TranscriptBlock[] = [{ type: "text", text: message }];

  for (const attachment of attachments) {
    const block: TranscriptAttachmentRefBlock = {
      type: "attachment_ref",
      attachmentId: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      category: attachment.category,
      source: attachment.source,
      size: attachment.size,
      previewDataUrl: attachment.previewUrl,
    };
    content.push(block);
  }

  return {
    id: `optimistic-user-${Date.now()}`,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
}

function getToolResult(message: SessionMessage | undefined): { content: string; isError: boolean } | undefined {
  if (!message) return undefined;
  const block = message.content.find((entry): entry is TranscriptToolResultBlock => entry.type === "tool_result");
  if (!block) return undefined;
  return { content: block.content, isError: block.is_error === true };
}

export function useChatStreaming({
  session,
  pendingAttachments,
  consumePendingAttachments,
  clearAttachments,
  loadContextData,
  loadDebugData,
  setSession,
  debugOpen,
}: Options) {
  const [input, setInput] = useState("");
  const [streamSnapshot, setStreamSnapshot] = useState(() => getChatStreamSnapshot(session?.id));
  const optimisticPreviewUrlsRef = useRef<string[]>([]);
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
    const hasAttachments = pendingAttachments.length > 0;
    if ((!hasText && !hasAttachments) || !session || streamSnapshot.sending) return;

    const message = input.trim() || " ";
    const optimisticAttachments = consumePendingAttachments();
    const attachmentIds = optimisticAttachments.map((attachment) => attachment.id);

    optimisticPreviewUrlsRef.current = optimisticAttachments
      .map((attachment) => attachment.previewUrl)
      .filter((previewUrl): previewUrl is string => Boolean(previewUrl));

    setInput("");
    updateChatStreamSnapshot(session.id, (previous) => ({
      ...previous,
      sending: true,
      streaming: true,
      streamTurn: null,
      streamSystemNotices: [],
      loopState: null,
      tokenStats: null,
      pendingPrompt: null,
    }));

    setSession((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        messages: [...previous.messages, buildOptimisticUserMessage(message, optimisticAttachments)],
      };
    });

    try {
      await sessionApi.chatStream(session.id, message, async (event: StreamEvent) => {
        switch (event.type) {
          case "assistant_block_delta":
            updateChatStreamSnapshot(session.id, (previous) => ({
              ...previous,
              streamTurn: updateIterationAssistant(previous.streamTurn, event.messageId, (assistant) => {
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
              streamTurn: updateIterationAssistant(previous.streamTurn, event.message.id, () => event.message),
            }));
            break;
          case "tool_execution_update":
            updateChatStreamSnapshot(session.id, (previous) => ({
              ...previous,
              streamTurn: updateIterationToolCall(previous.streamTurn, event),
            }));
            if (event.result && ["create_tasks", "update_tasks", "solve_tasks"].includes(event.toolName)) {
              if (mountedRef.current) await loadContextData(session.id);
            }
            break;
          case "turn_state":
            updateChatStreamSnapshot(session.id, (previous) => ({ ...previous, loopState: event.state }));
            break;
          case "system_notice":
            updateChatStreamSnapshot(session.id, (previous) => ({
              ...previous,
              streamSystemNotices: [...previous.streamSystemNotices, event.message],
            }));
            break;
          case "stats":
            if (event.source === "provider") {
              updateChatStreamSnapshot(session.id, (previous) => ({
                ...previous,
                tokenStats: { input: event.inputTokens, output: event.outputTokens, reasoning: event.reasoningTokens },
              }));
            }
            break;
          case "user_prompt":
            updateChatStreamSnapshot(session.id, (previous) => ({
              ...previous,
              pendingPrompt: { promptId: event.promptId, question: event.question, choices: event.choices },
            }));
            break;
          case "done":
            for (const previewUrl of optimisticPreviewUrlsRef.current) {
              URL.revokeObjectURL(previewUrl);
            }
            optimisticPreviewUrlsRef.current = [];
            clearAttachments();
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
          case "error":
            logger.error(event.message);
            resetStreamingState();
            break;
        }
      }, attachmentIds.length > 0 ? attachmentIds : undefined);
    } catch (err) {
      logger.error(err);
      resetStreamingState();
    } finally {
      updateChatStreamSnapshot(session.id, (previous) => ({ ...previous, sending: false }));
    }
  }, [
    clearAttachments,
    consumePendingAttachments,
    debugOpen,
    input,
    loadContextData,
    loadDebugData,
    pendingAttachments.length,
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
    streamSystemNotices: streamSnapshot.streamSystemNotices,
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
