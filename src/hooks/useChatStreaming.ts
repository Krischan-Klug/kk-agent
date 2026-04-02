import { useCallback, useRef, useState } from "react";
import { session as sessionApi } from "@/lib/api";
import { emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { logUiError } from "@/lib/uiLogger";
import type { AgentLoopState, AttachmentDisplayMeta, SessionState, StreamEvent } from "@/types/api";
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
  const [streamContent, setStreamContent] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [streamToolCalls, setStreamToolCalls] = useState<ActiveToolCall[]>([]);
  const [streamRetryNotices, setStreamRetryNotices] = useState<string[]>([]);
  const [loopState, setLoopState] = useState<AgentLoopState | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenDisplayStats | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [customAnswer, setCustomAnswer] = useState("");
  const optimisticPreviewUrlsRef = useRef<string[]>([]);

  const resetStreamingState = useCallback(() => {
    setStreaming(false);
    setStreamContent("");
    setStreamReasoning("");
    setStreamToolCalls([]);
    setStreamRetryNotices([]);
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
    setStreamContent("");
    setStreamReasoning("");
    setStreamToolCalls([]);
    setStreamRetryNotices([]);
    setLoopState(null);
    setTokenStats(null);

    setSession((previous) => {
      if (!previous) return previous;

      const attachments: AttachmentDisplayMeta[] | undefined = optimisticAttachments.length > 0
        ? optimisticAttachments.map((attachment) => ({
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          category: attachment.category,
          size: attachment.size,
          previewDataUrl: attachment.previewUrl,
        }))
        : undefined;

      return {
        ...previous,
        messages: [
          ...previous.messages,
          {
            role: "user" as const,
            content: message,
            ...(attachments ? { attachments } : {}),
          },
        ],
      };
    });

    try {
      await sessionApi.chatStream(session.id, message, async (event: StreamEvent) => {
        switch (event.type) {
          case "content":
            setStreamContent((previous) => previous + event.content);
            break;
          case "reasoning":
            setStreamReasoning((previous) => previous + event.content);
            break;
          case "content_reset":
            setStreamContent("");
            setStreamReasoning("");
            break;
          case "retry_notice":
            setStreamRetryNotices((previous) => [...previous, event.message]);
            break;
          case "tool_call":
            setStreamToolCalls((previous) => [
              ...previous,
              { id: event.toolCall.id, name: event.toolCall.name, arguments: event.toolCall.arguments },
            ]);
            break;
          case "tool_result":
            setStreamToolCalls((previous) => previous.map((toolCall) => (
              toolCall.id === event.toolCallId
                ? { ...toolCall, result: { content: event.content, isError: event.isError } }
                : toolCall
            )));
            break;
          case "loop_state":
            setLoopState(event.state);
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
    streamContent,
    streamReasoning,
    streamToolCalls,
    streamRetryNotices,
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
