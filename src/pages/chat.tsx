import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { agent as agentApi, mcp as mcpApi, provider as providerApi, session as sessionApi, tools as toolsApi } from "@/lib/api";
import type {
  AgentDefinition,
  AgentLoopState,
  AttachmentDisplayMeta,
  McpListItem,
  MemoryFact,
  ModelInfo,
  ModelSettings,
  SessionState,
  StreamEvent,
  TaskItem,
} from "@/types/api";
import {
  DEFAULT_REASONING_LEVELS,
  buildTemperatureOptions,
  getDefaultLevelConfig,
  getEndpointCapabilities,
  getReasoningLevels,
  getResolvedEndpoint,
  getResolvedReasoningEffort,
} from "@/lib/modelCapabilities";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import ChatDebugPanel, { type ChatDebugTab } from "@/components/ChatDebugPanel";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessages from "@/components/chat/ChatMessages";
import type { ActiveToolCall, PendingPrompt, TokenDisplayStats } from "@/components/chat/types";
import { addAppEventListener, CHAT_DEBUG_TOGGLE_EVENT, emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { clearActiveSessionId, getActiveSessionId } from "@/lib/sessionState";
import { createAndActivateSession, resolveDefaultSessionAgentId } from "@/lib/sessionFactory";
import { logUiError } from "@/lib/uiLogger";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { useAttachments } from "@/hooks/useAttachments";

const ChatWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: calc(100vh - 2 * var(--space-lg));
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: var(--space-md);
  color: var(--text-secondary);
`;

const FloatingDebugButton = styled.button`
  position: fixed;
  right: var(--space-lg);
  bottom: var(--space-lg);
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px var(--space-sm);
  background: var(--accent-muted);
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);

  &:hover {
    background: var(--accent);
    color: var(--bg-base);
    border-color: var(--accent);
  }
`;

export default function ChatPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [modelInfoMap, setModelInfoMap] = useState<Map<string, ModelInfo>>(new Map());
  const [modelSettingsMap, setModelSettingsMap] = useState<Record<string, ModelSettings>>({});
  const [mcps, setMcps] = useState<McpListItem[]>([]);
  const [toolMcps, setToolMcps] = useState<McpListItem[]>([]);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [streamToolCalls, setStreamToolCalls] = useState<ActiveToolCall[]>([]);
  const [streamRetryNotices, setStreamRetryNotices] = useState<string[]>([]);
  const [loopState, setLoopState] = useState<AgentLoopState | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenDisplayStats | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [customAnswer, setCustomAnswer] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTab, setDebugTab] = useState<ChatDebugTab | null>("prompt");
  const [debugPrompt, setDebugPrompt] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [sessionFacts, setSessionFacts] = useState<MemoryFact[]>([]);
  const [userFacts, setUserFacts] = useState<MemoryFact[]>([]);
  const optimisticPreviewUrlsRef = useRef<string[]>([]);
  const { ref: messagesRef, scrollToBottom, handleScroll } = useChatAutoScroll();
  const { pendingAttachments, uploading, addFiles, removeAttachment, clearAttachments } = useAttachments();

  const loadAvailableMcps = useCallback(async (): Promise<{ tools: McpListItem[]; mcps: McpListItem[] }> => {
    const [internalTools, externalMcps] = await Promise.all([toolsApi.list(), mcpApi.list()]);
    return { tools: internalTools, mcps: externalMcps };
  }, []);

  function resetStreamingState() {
    setStreaming(false);
    setStreamContent("");
    setStreamReasoning("");
    setStreamToolCalls([]);
    setStreamRetryNotices([]);
    setLoopState(null);
    setPendingPrompt(null);
  }

  const loadContextData = useCallback(async (sessionId: string) => {
    try {
      const [taskResult, sessionMemoryResult, userMemoryResult] = await Promise.all([
        toolsApi.listTasks(sessionId),
        toolsApi.listSessionMemory(sessionId),
        toolsApi.listUserMemory(),
      ]);
      setTasks(taskResult.tasks);
      setSessionFacts(sessionMemoryResult.facts);
      setUserFacts(userMemoryResult.facts);
    } catch (err) {
      logUiError("chat-context-load", err);
    }
  }, []);

  const loadSession = useCallback(() => {
    const id = getActiveSessionId();
    if (!id) {
      setSession(null);
      setTasks([]);
      setSessionFacts([]);
      setUserFacts([]);
      setLoading(false);
      return;
    }

    sessionApi
      .get(id)
      .then((nextSession) => {
        setSession(nextSession);
        void providerApi.getModels(nextSession.providerId).then((result) => {
          setModels(result.models.map((model) => model.id));
          setModelInfoMap(new Map(result.models.map((model) => [model.id, model])));
          setModelSettingsMap(result.modelSettings ?? {});
        }).catch(() => {});
        void loadContextData(nextSession.id);
      })
      .catch(() => {
        clearActiveSessionId();
        setSession(null);
        setTasks([]);
        setSessionFacts([]);
        setUserFacts([]);
      })
      .finally(() => setLoading(false));
  }, [loadContextData]);

  const loadDebugData = useCallback((sessionId: string) => {
    sessionApi.getPrompt(sessionId).then((result) => setDebugPrompt(result.systemPrompt)).catch(() => setDebugPrompt("[Fehler beim Laden]"));
    loadAvailableMcps()
      .then(({ tools, mcps }) => {
        setToolMcps(tools);
        setMcps(mcps);
      })
      .catch(() => {});
    void loadContextData(sessionId);
  }, [loadAvailableMcps, loadContextData]);

  useEffect(() => {
    loadSession();
    loadAvailableMcps()
      .then(({ tools, mcps }) => {
        setToolMcps(tools);
        setMcps(mcps);
      })
      .catch(() => {});
    agentApi.list().then(setAgents).catch(() => {});

    return addAppEventListener(SESSION_CHANGED_EVENT, loadSession);
  }, [loadAvailableMcps, loadSession]);

  useEffect(() => addAppEventListener(CHAT_DEBUG_TOGGLE_EVENT, () => {
    setDebugOpen((prev) => {
      const next = !prev;
      if (next && session) loadDebugData(session.id);
      return next;
    });
  }), [loadDebugData, session]);

  useEffect(scrollToBottom, [session?.messages, streamContent, streamReasoning, streamToolCalls, scrollToBottom]);

  const modelInfo = session ? modelInfoMap.get(session.model) : undefined;
  const modelSettings = session ? modelSettingsMap[session.model] : undefined;
  const resolvedEndpoint = getResolvedEndpoint(modelInfo, modelSettings);
  const endpointCapabilities = getEndpointCapabilities(modelInfo, resolvedEndpoint);
  const reasoningLevels = modelInfo?.capabilities.supportsReasoning
    ? getReasoningLevels(modelInfo)
    : [...DEFAULT_REASONING_LEVELS];
  const reasoningOptions = reasoningLevels.map((level) => ({ value: level, label: level }));
  const resolvedEffort = getResolvedReasoningEffort(modelInfo, modelSettings, session?.reasoningEffort);
  const resolvedLevelConfig = getDefaultLevelConfig(resolvedEffort);
  const resolvedTemp = session
    ? (
      session.temperature ??
      modelSettings?.levels?.[resolvedEffort]?.temperature ??
      resolvedLevelConfig?.temperature ??
      endpointCapabilities.temperatureRange?.min ??
      1.0
    )
    : 1.0;
  const temperatureOptions = buildTemperatureOptions(endpointCapabilities.temperatureRange);
  const showReasoningControl = reasoningLevels.length > 0;
  const showTemperatureControl = endpointCapabilities.temperatureSupported && temperatureOptions.length > 0;
  const maxCtx = modelInfo?.contextLength ?? modelInfo?.maxContextLength ?? 0;
  const currentAgentName = session
    ? agents.find((agent) => agent.id === session.agentId)?.name ?? session.agentId
    : "assistant";

  async function handleSend() {
    const hasText = input.trim().length > 0;
    const hasAttachments = pendingAttachments.length > 0;
    if ((!hasText && !hasAttachments) || !session || sending) return;
    const message = input.trim() || " ";
    const optimisticAttachments = pendingAttachments;
    const attachmentIds = optimisticAttachments.map((attachment) => attachment.id);
    optimisticPreviewUrlsRef.current = optimisticAttachments
      .map((attachment) => attachment.previewUrl)
      .filter((previewUrl): previewUrl is string => Boolean(previewUrl));
    setInput("");
    clearAttachments({ revokeUrls: false });
    setSending(true);
    setStreaming(true);
    setStreamContent("");
    setStreamReasoning("");
    setStreamToolCalls([]);
    setStreamRetryNotices([]);
    setLoopState(null);
    setTokenStats(null);

    setSession((prev) => {
      if (!prev) return prev;

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
        ...prev,
        messages: [
          ...prev.messages,
          {
            role: "user" as const,
            content: message,
            ...(attachments ? { attachments } : {}),
          },
        ],
      };
    });

    try {
      await sessionApi.chatStream(session.id, message, (event: StreamEvent) => {
        switch (event.type) {
          case "content":
            setStreamContent((prev) => prev + event.content);
            break;
          case "reasoning":
            setStreamReasoning((prev) => prev + event.content);
            break;
          case "content_reset":
            setStreamContent("");
            setStreamReasoning("");
            break;
          case "retry_notice":
            setStreamRetryNotices((prev) => [...prev, event.message]);
            break;
          case "tool_call":
            setStreamToolCalls((prev) => [...prev, { id: event.toolCall.id, name: event.toolCall.name, arguments: event.toolCall.arguments }]);
            break;
          case "tool_result":
            setStreamToolCalls((prev) => {
              const matched = prev.find((toolCall) => toolCall.id === event.toolCallId);
              if (matched && session && (matched.name === "update_tasks" || matched.name === "remember_facts")) {
                void loadContextData(session.id);
              }
              return prev.map((toolCall) => toolCall.id === event.toolCallId
                ? { ...toolCall, result: { content: event.content, isError: event.isError } }
                : toolCall);
            });
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
            void loadContextData(event.session.id);
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
  }

  async function updateSessionAndSet(body: Parameters<typeof sessionApi.update>[1]) {
    if (!session) return;
    const nextSession = await sessionApi.update(session.id, body);
    setSession(nextSession);
    const modelsResult = await providerApi.getModels(nextSession.providerId);
    setModels(modelsResult.models.map((model) => model.id));
    setModelInfoMap(new Map(modelsResult.models.map((model) => [model.id, model])));
    setModelSettingsMap(modelsResult.modelSettings ?? {});
    await loadContextData(nextSession.id);
  }

  async function handleModelSwitch(model: string) {
    if (!session || model === session.model) return;
    try {
      await updateSessionAndSet({ model });
    } catch (err) {
      logUiError("chat-model-switch", err);
    }
  }

  async function handleMcpToggle(mcpId: string, enabled: boolean) {
    if (!session) return;
    try {
      await updateSessionAndSet({
        activeMcpIds: enabled
          ? [...session.activeMcpIds, mcpId]
          : session.activeMcpIds.filter((id) => id !== mcpId),
      });
    } catch (err) {
      logUiError("chat-mcp-toggle", err);
    }
  }

  async function handleToolToggle(toolId: string, enabled: boolean) {
    if (!session) return;
    try {
      await updateSessionAndSet({
        activeToolIds: enabled
          ? [...session.activeToolIds, toolId]
          : session.activeToolIds.filter((id) => id !== toolId),
      });
    } catch (err) {
      logUiError("chat-tool-toggle", err);
    }
  }

  async function handleReasoningEffort(value: string) {
    if (!session) return;
    try {
      await updateSessionAndSet({ reasoningEffort: value || undefined });
    } catch (err) {
      logUiError("chat-reasoning", err);
    }
  }

  async function handleTemperature(value: string) {
    if (!session) return;
    try {
      await updateSessionAndSet({ temperature: Number(value) });
    } catch (err) {
      logUiError("chat-temperature", err);
    }
  }

  async function handleAgentSwitch(agentId: string) {
    if (!session || agentId === session.agentId) return;
    try {
      await updateSessionAndSet({ agentId });
      setTokenStats(null);
      emitAppEvent(SESSION_CHANGED_EVENT);
    } catch (err) {
      logUiError("chat-agent-switch", err);
    }
  }

  async function handleNewSession() {
    try {
      const newSession = await createAndActivateSession(agents, resolveDefaultSessionAgentId(agents));
      setSession(newSession);
      setTokenStats(null);
      await loadContextData(newSession.id);
    } catch (err) {
      logUiError("chat-new-session", err);
    }
  }

  async function handleSaveTasks(nextTasks: TaskItem[]) {
    if (!session) return;
    try {
      const result = await toolsApi.replaceTasks(session.id, nextTasks);
      setTasks(result.tasks);
    } catch (err) {
      logUiError("chat-save-tasks", err);
    }
  }

  async function handleSaveSessionFacts(nextFacts: MemoryFact[]) {
    if (!session) return;
    try {
      const result = await toolsApi.replaceSessionMemory(session.id, nextFacts);
      setSessionFacts(result.facts);
    } catch (err) {
      logUiError("chat-save-session-memory", err);
    }
  }

  async function handleSaveUserFacts(nextFacts: MemoryFact[]) {
    try {
      const result = await toolsApi.replaceUserMemory(nextFacts);
      setUserFacts(result.facts);
    } catch (err) {
      logUiError("chat-save-user-memory", err);
    }
  }

  async function handlePromptResponse(selectedKey: string) {
    if (!session || !pendingPrompt) return;
    try {
      await sessionApi.respondToPrompt(session.id, pendingPrompt.promptId, selectedKey);
      setPendingPrompt(null);
    } catch (err) {
      logUiError("chat-prompt-response", err);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  if (loading) return <Spinner />;

  if (!session) {
    return (
      <ChatWrapper>
        <EmptyState>
          <p>Keine aktive Session.</p>
          <Button onClick={() => void handleNewSession()}>Neue Session starten</Button>
        </EmptyState>
      </ChatWrapper>
    );
  }

  return (
    <ChatWrapper>
      <ChatDebugPanel
        open={debugOpen}
        debugTab={debugTab}
        onTabChange={setDebugTab}
        session={session}
        loopState={loopState}
        debugPrompt={debugPrompt}
        internalTools={toolMcps}
        debugMcps={mcps}
        debugTasks={tasks}
        debugSessionFacts={sessionFacts}
        debugUserFacts={userFacts}
        models={models}
        onModelSwitch={handleModelSwitch}
        onToolToggle={handleToolToggle}
        onMcpToggle={handleMcpToggle}
        onSaveTasks={handleSaveTasks}
        onSaveSessionFacts={handleSaveSessionFacts}
        onSaveUserFacts={handleSaveUserFacts}
      />
      <ChatMessages
        session={session}
        currentAgentName={currentAgentName}
        mcps={mcps}
        streaming={streaming}
        streamContent={streamContent}
        streamReasoning={streamReasoning}
        streamToolCalls={streamToolCalls}
        streamRetryNotices={streamRetryNotices}
        loopState={loopState}
        pendingPrompt={pendingPrompt}
        customAnswer={customAnswer}
        messagesRef={messagesRef}
        onMessagesScroll={handleScroll}
        onCustomAnswerChange={setCustomAnswer}
        onPromptResponse={handlePromptResponse}
      />
      <ChatComposer
        input={input}
        sending={sending || uploading}
        agents={agents}
        currentAgentId={session.agentId}
        showReasoningControl={showReasoningControl}
        showTemperatureControl={showTemperatureControl}
        resolvedEffort={resolvedEffort}
        resolvedTemp={resolvedTemp}
        reasoningOptions={reasoningOptions}
        temperatureOptions={temperatureOptions}
        maxCtx={maxCtx}
        tokenStats={tokenStats}
        pendingAttachments={pendingAttachments}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        onReasoningSelect={handleReasoningEffort}
        onTemperatureSelect={handleTemperature}
        onAgentSwitch={handleAgentSwitch}
        onSend={handleSend}
        onFilesSelected={(files) => { if (session) void addFiles(session.id, files); }}
        onRemoveAttachment={removeAttachment}
      />
      <FloatingDebugButton
        type="button"
        aria-label="Debug umschalten"
        title="Debug umschalten"
        onClick={() => emitAppEvent(CHAT_DEBUG_TOGGLE_EVENT)}
      >
        Debug
      </FloatingDebugButton>
    </ChatWrapper>
  );
}
