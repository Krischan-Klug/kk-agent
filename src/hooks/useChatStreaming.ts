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
  TranscriptToolResultBlock,
} from "@/types/api";
import type { PendingAttachment } from "@/hooks/useAttachments";
import type { ActiveToolCall, PendingPrompt, TokenDisplayStats } from "@/components/chat/types";

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
  const [streamMessage, setStreamMessage] = useState<SessionMessage | null>(null);
  const [streamToolCalls, setStreamToolCalls] = useState<ActiveToolCall[]>([]);
  const [streamSystemNotices, setStreamSystemNotices] = useState<string[]>([]);
  const [loopState, setLoopState] = useState<AgentLoopState | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenDisplayStats | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [customAnswer, setCustomAnswer] = useState("");
  const optimisticPreviewUrlsRef = useRef<string[]>([]);

  const resetStreamingState = useCallback(() => {
    setStreaming(false);
    setStreamMessage(null);
    setStreamToolCalls([]);
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
    setStreamMessage(null);
    setStreamToolCalls([]);
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
            setStreamMessage((previous) => {
              if (!previous || previous.id !== event.messageId) {
                return {
                  id: event.messageId,
                  role: "assistant",
                  content: [event.block],
                  timestamp: new Date().toISOString(),
                };
              }
              return {
                ...previous,
                content: mergeStreamBlock(previous.content, event.block),
              };
            });
            break;
          case "assistant_message_complete":
            setStreamMessage(event.message);
            break;
          case "tool_execution_update":
            setStreamToolCalls((previous) => {
              const next = [...previous];
              const index = next.findIndex((toolCall) => toolCall.id === event.toolUseId);
              const current: ActiveToolCall = index >= 0
                ? next[index]!
                : { id: event.toolUseId, name: event.toolName, input: {}, status: event.status };
              const updated: ActiveToolCall = {
                ...current,
                name: event.toolName,
                status: event.status,
                ...(event.detail ? { detail: event.detail } : {}),
                ...(event.summary ? { summary: event.summary } : {}),
                ...(event.result ? { result: getToolResult(event.result) } : {}),
              };

              if (index >= 0) next[index] = updated;
              else next.push(updated);
              return next;
            });
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
            await loadContextData(event.session.id);
            resetStreamingState();
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
    streamMessage,
    streamToolCalls,
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
