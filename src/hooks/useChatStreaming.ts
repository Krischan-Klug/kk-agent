import { useCallback, useRef, useState } from "react";
import { session as sessionApi } from "@/lib/api";
import { emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { logUiError } from "@/lib/uiLogger";
import type {
  AgentLoopState,
  SessionMessage,
  SessionState,
  StreamEvent,
  TranscriptAttachmentRefBlock,
  TranscriptBlock,
  TranscriptToolUseBlock,
  TranscriptToolResultBlock,
} from "@/types/api";
import type { PendingAttachment } from "@/hooks/useAttachments";
import type { ActiveToolCall, PendingPrompt, StreamingTurnState, TokenDisplayStats } from "@/components/chat/types";

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

  iterations.push({
    assistant,
    toolCalls: syncIterationToolCalls(assistant, []),
  });
  return { iterations };
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
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamTurn, setStreamTurn] = useState<StreamingTurnState | null>(null);
  const [streamSystemNotices, setStreamSystemNotices] = useState<string[]>([]);
  const [loopState, setLoopState] = useState<AgentLoopState | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenDisplayStats | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [customAnswer, setCustomAnswer] = useState("");
  const optimisticPreviewUrlsRef = useRef<string[]>([]);

  const resetStreamingState = useCallback(() => {
    setStreaming(false);
    setStreamTurn(null);
    setStreamSystemNotices([]);
    setLoopState(null);
    setPendingPrompt(null);
  }, []);

  const handleSend = useCallback(async () => {
    const hasText = input.trim().length > 0;
    const hasAttachments = pendingAttachments.length > 0;
    if ((!hasText && !hasAttachments) || !session || sending) return;

    const message = input.trim() || " ";
    const optimisticAttachments = consumePendingAttachments();
    const attachmentIds = optimisticAttachments.map((attachment) => attachment.id);

    optimisticPreviewUrlsRef.current = optimisticAttachments
      .map((attachment) => attachment.previewUrl)
      .filter((previewUrl): previewUrl is string => Boolean(previewUrl));

    setInput("");
    setSending(true);
    setStreaming(true);
    setStreamTurn(null);
    setStreamSystemNotices([]);
    setLoopState(null);
    setTokenStats(null);

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
            setStreamTurn((previous) => updateIterationAssistant(previous, event.messageId, (assistant) => {
              if (!assistant) return createDraftAssistantMessage(event.messageId, event.block);
              return {
                ...assistant,
                content: mergeStreamBlock(assistant.content, event.block),
              };
            }));
            break;
          case "assistant_message_complete":
            setStreamTurn((previous) => updateIterationAssistant(previous, event.message.id, () => event.message));
            break;
          case "tool_execution_update":
            setStreamTurn((previous) => updateIterationToolCall(previous, event));
            if (event.result && ["create_tasks", "update_tasks", "solve_tasks"].includes(event.toolName)) {
              await loadContextData(session.id);
            }
            break;
          case "turn_state":
            setLoopState(event.state);
            break;
          case "system_notice":
            setStreamSystemNotices((previous) => [...previous, event.message]);
            break;
          case "stats":
            if (event.source === "provider") {
              setTokenStats({ input: event.inputTokens, output: event.outputTokens, reasoning: event.reasoningTokens });
            }
            break;
          case "user_prompt":
            setPendingPrompt({ promptId: event.promptId, question: event.question, choices: event.choices });
            break;
          case "done":
            for (const previewUrl of optimisticPreviewUrlsRef.current) {
              URL.revokeObjectURL(previewUrl);
            }
            optimisticPreviewUrlsRef.current = [];
            clearAttachments();
            setSession(event.session);
            resetStreamingState();
            await loadContextData(event.session.id);
            emitAppEvent(SESSION_CHANGED_EVENT);
            if (debugOpen) loadDebugData(event.session.id);
            break;
          case "error":
            logUiError("chat-stream", event.message);
            resetStreamingState();
            break;
        }
      }, attachmentIds.length > 0 ? attachmentIds : undefined);
    } catch (err) {
      logUiError("chat-stream", err);
      resetStreamingState();
    } finally {
      setSending(false);
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
    sending,
    session,
    setSession,
  ]);

  const handlePromptResponse = useCallback(async (selectedKey: string) => {
    if (!session || !pendingPrompt) return;
    try {
      await sessionApi.respondToPrompt(session.id, pendingPrompt.promptId, selectedKey);
      setPendingPrompt(null);
    } catch (err) {
      logUiError("chat-prompt-response", err);
    }
  }, [pendingPrompt, session]);

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
    setTokenStats(null);
    emitAppEvent(SESSION_CHANGED_EVENT);
  }, []);

  return {
    input,
    setInput,
    sending,
    streaming,
    streamTurn,
    streamSystemNotices,
    loopState,
    tokenStats,
    pendingPrompt,
    customAnswer,
    setCustomAnswer,
    handleSend,
    handlePromptResponse,
    handleKeyDown,
    handleAgentSwitch,
  };
}
