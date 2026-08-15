import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  buildTemperatureOptions,
  getReasoningLevels,
  getResolvedReasoningEffort,
} from "@/lib/modelCapabilities";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import ChatDebugPanel, { type ChatDebugTab } from "@/components/ChatDebugPanel";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessages from "@/components/chat/ChatMessages";
import { EmptyState } from "@/components/chat/ChatMessages.styled";
import { emitAppEvent, CHAT_DEBUG_TOGGLE_EVENT } from "@/lib/appEvents";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { useAssets } from "@/hooks/useAssets";
import { useChatSessionData } from "@/hooks/useChatSessionData";
import { useChatStreaming } from "@/hooks/useChatStreaming";
import { session as sessionApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { resolveDefaultSessionAgentId } from "@/lib/sessionFactory";
import { getSessionModelRef } from "@/lib/modelRefs";
import type {
  ReasoningEffort,
  SessionRuntimeMcpDebug,
  SessionRuntimeSkillDebug,
  SessionRuntimeToolDebug,
} from "@/types/api";

const logger = createLogger("chat");

const REASONING_COLORS: Record<ReasoningEffort, string> = {
  none: "#9d9d9d",
  low: "#1eff00",
  medium: "#0070dd",
  high: "#a335ee",
  xhigh: "#ff8000",
};

const ChatWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: calc(100vh - 2 * var(--space-lg));
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
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTab, setDebugTab] = useState<ChatDebugTab | null>("prompt");
  const [debugPrompt, setDebugPrompt] = useState<string | null>(null);
  const [debugRuntimeContext, setDebugRuntimeContext] = useState<string | null>(null);
  const [debugRuntimeTools, setDebugRuntimeTools] = useState<SessionRuntimeToolDebug[] | null>(null);
  const [debugRuntimeMcps, setDebugRuntimeMcps] = useState<SessionRuntimeMcpDebug[] | null>(null);
  const [debugRuntimeSkills, setDebugRuntimeSkills] = useState<SessionRuntimeSkillDebug[] | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const debugPromptRequestRef = useRef(0);
  const assets = useAssets();

  const refreshDebugPrompt = useCallback(async (sessionId: string) => {
    const requestId = ++debugPromptRequestRef.current;
    try {
      const result = await sessionApi.getPrompt(sessionId);
      if (requestId === debugPromptRequestRef.current) {
        setDebugPrompt(result.systemPrompt);
        setDebugRuntimeContext(result.runtimeContext);
        setDebugRuntimeTools(result.runtimeTools);
        setDebugRuntimeMcps(result.runtimeMcps);
        setDebugRuntimeSkills(result.runtimeSkills);
      }
    } catch {
      if (requestId === debugPromptRequestRef.current) {
        setDebugPrompt("[Error loading]");
        setDebugRuntimeContext("[Error loading]");
        setDebugRuntimeTools([]);
        setDebugRuntimeMcps([]);
        setDebugRuntimeSkills([]);
      }
    }
  }, []);

  const sessionData = useChatSessionData({
    setDebugOpen,
    onDebugOpen: refreshDebugPrompt,
  });
  const { ref: messagesRef, scrollToBottom, handleScroll } = useChatAutoScroll(sessionData.session?.id);
  const previousSessionIdRef = useRef<string | undefined>(undefined);
  const discardAssets = assets.discardAssets;

  useEffect(() => {
    const sessionId = sessionData.session?.id;
    if (previousSessionIdRef.current && previousSessionIdRef.current !== sessionId) discardAssets();
    previousSessionIdRef.current = sessionId;
  }, [discardAssets, sessionData.session?.id]);

  const streaming = useChatStreaming({
    session: sessionData.session,
    pendingAssets: assets.pendingAssets,
    clearAssets: assets.clearAssets,
    loadContextData: sessionData.loadContextData,
    loadDebugData: sessionData.loadDebugData,
    setSession: sessionData.setSession,
    debugOpen,
  });

  useEffect(() => {
    if (!debugOpen || !sessionData.session) {
      debugPromptRequestRef.current++;
      return;
    }

    queueMicrotask(() => {
      void refreshDebugPrompt(sessionData.session!.id);
    });
  }, [
    debugOpen,
    refreshDebugPrompt,
    sessionData.session,
    sessionData.tasks,
    sessionData.sessionFacts,
    sessionData.userFacts,
    streaming.loopState?.step,
    streaming.loopState?.attempt,
    streaming.loopState?.status,
  ]);

  useEffect(
    scrollToBottom,
    [sessionData.session?.messages, streaming.streamTurn, scrollToBottom],
  );

  const modelInfo = sessionData.session ? sessionData.modelInfoMap.get(getSessionModelRef(sessionData.session)) : undefined;
  const modelSettings = sessionData.session ? sessionData.modelSettingsMap[getSessionModelRef(sessionData.session)] : undefined;
  const endpointCapabilities = modelInfo?.capabilities?.endpointCapabilities ?? {
    temperatureSupported: false,
  };
  const reasoningLevels = getReasoningLevels(modelInfo);
  const reasoningOptions = reasoningLevels.map((level) => ({
    value: level,
    label: level,
    color: REASONING_COLORS[level],
  }));
  const resolvedEffort = getResolvedReasoningEffort(
    modelInfo,
    modelSettings,
    sessionData.session?.llmRequestConfig?.reasoning?.effort,
  );
  const resolvedReasoningHistory =
    sessionData.session?.llmRequestConfig?.reasoning?.history ??
    modelSettings?.llmRequestConfig?.reasoning?.history ??
    "auto";
  const profileSampling = resolvedEffort === "none"
    ? modelInfo?.profile?.sampling.direct
    : modelInfo?.profile?.sampling.thinking;
  const resolvedTemp = sessionData.session
    ? (
      sessionData.session.llmRequestConfig?.sampling?.temperature ??
      modelSettings?.llmRequestConfig?.sampling?.temperature ??
      profileSampling?.temperature ??
      1.0
    )
    : 1.0;
  const temperatureOptions = buildTemperatureOptions(endpointCapabilities.temperatureRange);
  const showReasoningControl = reasoningLevels.length > 0;
  const showTemperatureControl = endpointCapabilities.temperatureSupported && temperatureOptions.length > 0;
  const maxCtx = modelInfo?.contextLength ?? modelInfo?.maxContextLength ?? 0;

  async function beginNewSession() {
    try {
      setCreatingSession(true);
      await sessionData.handleNewSession(resolveDefaultSessionAgentId(sessionData.agents));
    } catch (err) {
      logger.error("Failed to create session:", err);
    } finally {
      setCreatingSession(false);
    }
  }

  if (sessionData.loading) return <Spinner />;

  if (!sessionData.session) {
    return (
      <ChatWrapper>
        <EmptyState>
          <p>No active session.</p>
          <Button onClick={() => void beginNewSession()} disabled={creatingSession}>Start new session</Button>
        </EmptyState>
      </ChatWrapper>
    );
  }

  const activeSession = sessionData.session;

  return (
    <ChatWrapper>
      <ChatDebugPanel
        open={debugOpen}
        debugTab={debugTab}
        onTabChange={setDebugTab}
        session={sessionData.session}
        loopState={streaming.loopState}
        debugPrompt={debugPrompt}
        debugRuntimeContext={debugRuntimeContext}
        debugRuntimeTools={debugRuntimeTools}
        debugRuntimeMcps={debugRuntimeMcps}
        debugRuntimeSkills={debugRuntimeSkills}
        internalTools={sessionData.toolMcps}
        debugMcps={sessionData.mcps}
        skills={sessionData.skills}
        debugTasks={sessionData.tasks}
        debugSessionFacts={sessionData.sessionFacts}
        debugUserFacts={sessionData.userFacts}
        models={sessionData.models}
        onModelSwitch={sessionData.handleModelSwitch}
        onToolToggle={sessionData.handleToolToggle}
        onMcpToggle={sessionData.handleMcpToggle}
        onSkillToggle={sessionData.handleSkillToggle}
        onSaveTasks={sessionData.handleSaveTasks}
        onSaveSessionFacts={sessionData.handleSaveSessionFacts}
        onSaveUserFacts={sessionData.handleSaveUserFacts}
        showReasoningControl={showReasoningControl}
        showTemperatureControl={showTemperatureControl}
        resolvedEffort={resolvedEffort ?? "default"}
        resolvedReasoningHistory={resolvedReasoningHistory}
        resolvedTemp={resolvedTemp}
        reasoningOptions={reasoningOptions}
        temperatureOptions={temperatureOptions}
        onReasoningSelect={sessionData.handleReasoningEffort}
        onReasoningHistorySelect={sessionData.handleReasoningHistory}
        onTemperatureSelect={sessionData.handleTemperature}
        onLlmRequestConfigChange={sessionData.handleLlmRequestConfig}
      />
      <ChatMessages
        session={sessionData.session}
        currentAgentName={sessionData.currentAgentName}
        mcps={[...sessionData.toolMcps, ...sessionData.mcps]}
        streaming={streaming.streaming}
        streamTurn={streaming.streamTurn}
        streamRunEvents={streaming.streamRunEvents}
        loopState={streaming.loopState}
        pendingPrompt={streaming.pendingPrompt}
        customAnswer={streaming.customAnswer}
        messagesRef={messagesRef}
        onMessagesScroll={handleScroll}
        onCustomAnswerChange={streaming.setCustomAnswer}
        onPromptResponse={streaming.handlePromptResponse}
      />
      <ChatComposer
        input={streaming.input}
        sending={streaming.sending || assets.uploading}
        agents={sessionData.agents}
        currentAgentId={activeSession.agentId}
        reasoningValue={resolvedEffort}
        reasoningOptions={reasoningOptions}
        activeModeId={activeSession.activeModeId}
        maxCtx={maxCtx}
        tokenStats={streaming.tokenStats}
        tasks={sessionData.tasks}
        loopState={streaming.loopState}
        pendingAssets={assets.pendingAssets}
        onInputChange={streaming.setInput}
        onKeyDown={streaming.handleKeyDown}
        onAgentSwitch={(agentId) => void streaming.handleAgentSwitch(agentId, sessionData.handleAgentSwitch)}
        onReasoningSelect={(effort) => void sessionData.handleReasoningEffort(effort)}
        onModeSwitch={(mode) => void sessionData.handleModeSwitch(mode)}
        onSend={() => void streaming.handleSend()}
        onAbort={() => void sessionApi.abort(activeSession.id)}
        onFilesSelected={(files) => { void assets.addFiles(activeSession.id, files); }}
        onRemoveAsset={assets.removeAsset}
      />
      <FloatingDebugButton
        type="button"
        aria-label="Toggle debug"
        title="Toggle debug"
        onClick={() => emitAppEvent(CHAT_DEBUG_TOGGLE_EVENT)}
      >
        Debug
      </FloatingDebugButton>
    </ChatWrapper>
  );
}
