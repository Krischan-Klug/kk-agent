import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  buildTemperatureOptions,
  getEndpointCapabilities,
  getReasoningLevels,
  getResolvedEndpoint,
  getResolvedReasoningEffort,
} from "@/lib/modelCapabilities";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import ChatDebugPanel, { type ChatDebugTab } from "@/components/ChatDebugPanel";
import ChatComposer from "@/components/chat/ChatComposer";
import CreateSessionModal from "@/components/chat/CreateSessionModal";
import ChatMessages from "@/components/chat/ChatMessages";
import { EmptyState } from "@/components/chat/ChatMessages.styled";
import { emitAppEvent, CHAT_DEBUG_TOGGLE_EVENT } from "@/lib/appEvents";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { useAttachments } from "@/hooks/useAttachments";
import { useChatSessionData } from "@/hooks/useChatSessionData";
import { useChatStreaming } from "@/hooks/useChatStreaming";
import { session as sessionApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { resolveDefaultSessionAgentId, resolveSessionCreationContext, type SessionCreationContext } from "@/lib/sessionFactory";
import type { SessionRuntimeMcpDebug, SessionRuntimeSkillDebug, SessionRuntimeToolDebug } from "@/types/api";

const logger = createLogger("chat");

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
  const [debugMetaMessages, setDebugMetaMessages] = useState<string[] | null>(null);
  const [debugRuntimeTools, setDebugRuntimeTools] = useState<SessionRuntimeToolDebug[] | null>(null);
  const [debugRuntimeMcps, setDebugRuntimeMcps] = useState<SessionRuntimeMcpDebug[] | null>(null);
  const [debugRuntimeSkills, setDebugRuntimeSkills] = useState<SessionRuntimeSkillDebug[] | null>(null);
  const [sessionCreateContext, setSessionCreateContext] = useState<SessionCreationContext | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const debugPromptRequestRef = useRef(0);
  const attachments = useAttachments();

  const refreshDebugPrompt = useCallback(async (sessionId: string) => {
    const requestId = ++debugPromptRequestRef.current;
    try {
      const result = await sessionApi.getPrompt(sessionId);
      if (requestId === debugPromptRequestRef.current) {
        setDebugPrompt(result.systemPrompt);
        setDebugMetaMessages(result.metaMessages);
        setDebugRuntimeTools(result.runtimeTools);
        setDebugRuntimeMcps(result.runtimeMcps);
        setDebugRuntimeSkills(result.runtimeSkills);
      }
    } catch {
      if (requestId === debugPromptRequestRef.current) {
        setDebugPrompt("[Fehler beim Laden]");
        setDebugMetaMessages(["[Fehler beim Laden]"]);
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

  const streaming = useChatStreaming({
    session: sessionData.session,
    pendingAttachments: attachments.pendingAttachments,
    consumePendingAttachments: attachments.consumePendingAttachments,
    clearAttachments: attachments.clearAttachments,
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
    streaming.loopState?.iteration,
    streaming.loopState?.status,
  ]);

  useEffect(
    scrollToBottom,
    [sessionData.session?.messages, streaming.streamTurn, scrollToBottom],
  );

  const modelInfo = sessionData.session ? sessionData.modelInfoMap.get(sessionData.session.model) : undefined;
  const modelSettings = sessionData.session ? sessionData.modelSettingsMap[sessionData.session.model] : undefined;
  const resolvedEndpoint = getResolvedEndpoint(modelInfo, modelSettings);
  const endpointCapabilities = getEndpointCapabilities(modelInfo, resolvedEndpoint);
  const reasoningLevels = getReasoningLevels(modelInfo);
  const reasoningOptions = reasoningLevels.map((level) => ({ value: level, label: level }));
  const resolvedEffort = getResolvedReasoningEffort(
    modelInfo,
    modelSettings,
    sessionData.session?.llmRequestConfig?.common?.reasoningEffort,
  );
  const resolvedTemp = sessionData.session
    ? (
      sessionData.session.llmRequestConfig?.common?.temperature ??
      endpointCapabilities.temperatureRange?.min ??
      1.0
    )
    : 1.0;
  const temperatureOptions = buildTemperatureOptions(endpointCapabilities.temperatureRange);
  const showReasoningControl = reasoningLevels.length > 0;
  const showTemperatureControl = endpointCapabilities.temperatureSupported && temperatureOptions.length > 0;
  const maxCtx = modelInfo?.contextLength ?? modelInfo?.maxContextLength ?? 0;

  async function beginNewSession() {
    try {
      const context = await resolveSessionCreationContext(
        sessionData.agents,
        resolveDefaultSessionAgentId(sessionData.agents),
      );
      if (context.requiresProviderSelection) {
        setSessionCreateContext(context);
        return;
      }

      setCreatingSession(true);
      await sessionData.handleNewSession(context.selectedProviderId);
    } catch (err) {
      logger.error("Failed to create session:", err);
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleCreateSessionWithProvider(providerId: string) {
    try {
      setCreatingSession(true);
      await sessionData.handleNewSession(providerId);
      setSessionCreateContext(null);
    } catch (err) {
      logger.error("Failed to create session with provider:", err);
    } finally {
      setCreatingSession(false);
    }
  }

  if (sessionData.loading) return <Spinner />;

  if (!sessionData.session) {
    return (
      <ChatWrapper>
        <EmptyState>
          <p>Keine aktive Session.</p>
          <Button onClick={() => void beginNewSession()} disabled={creatingSession}>Neue Session starten</Button>
        </EmptyState>
        <CreateSessionModal
          open={sessionCreateContext !== null}
          context={sessionCreateContext}
          creating={creatingSession}
          onCreate={(providerId) => { void handleCreateSessionWithProvider(providerId); }}
          onClose={() => setSessionCreateContext(null)}
        />
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
        debugMetaMessages={debugMetaMessages}
        debugRuntimeTools={debugRuntimeTools}
        debugRuntimeMcps={debugRuntimeMcps}
        debugRuntimeSkills={debugRuntimeSkills}
        internalTools={sessionData.toolMcps}
        debugMcps={sessionData.mcps}
        skills={sessionData.skills}
        debugTasks={sessionData.tasks}
        debugSessionFacts={sessionData.sessionFacts}
        debugUserFacts={sessionData.userFacts}
        providers={sessionData.providers}
        models={sessionData.models}
        selectedEndpoint={activeSession.llmRequestConfig?.common?.endpoint ?? resolvedEndpoint}
        onProviderSwitch={sessionData.handleProviderSwitch}
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
        resolvedTemp={resolvedTemp}
        reasoningOptions={reasoningOptions}
        temperatureOptions={temperatureOptions}
        onReasoningSelect={sessionData.handleReasoningEffort}
        onTemperatureSelect={sessionData.handleTemperature}
        onLlmRequestConfigChange={sessionData.handleLlmRequestConfig}
      />
      <ChatMessages
        session={sessionData.session}
        currentAgentName={sessionData.currentAgentName}
        mcps={[...sessionData.toolMcps, ...sessionData.mcps]}
        streaming={streaming.streaming}
        streamTurn={streaming.streamTurn}
        streamSystemNotices={streaming.streamSystemNotices}
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
        sending={streaming.sending || attachments.uploading}
        agents={sessionData.agents}
        currentAgentId={activeSession.agentId}
        activeModeId={activeSession.activeModeId}
        maxCtx={maxCtx}
        tokenStats={streaming.tokenStats}
        tasks={sessionData.tasks}
        loopState={streaming.loopState}
        pendingAttachments={attachments.pendingAttachments}
        onInputChange={streaming.setInput}
        onKeyDown={streaming.handleKeyDown}
        onAgentSwitch={(agentId) => void streaming.handleAgentSwitch(agentId, sessionData.handleAgentSwitch)}
        onModeSwitch={(mode) => void sessionData.handleModeSwitch(mode)}
        onSend={() => void streaming.handleSend()}
        onAbort={() => void sessionApi.abort(activeSession.id)}
        onFilesSelected={(files) => { void attachments.addFiles(activeSession.id, files); }}
        onRemoveAttachment={attachments.removeAttachment}
      />
      <FloatingDebugButton
        type="button"
        aria-label="Debug umschalten"
        title="Debug umschalten"
        onClick={() => emitAppEvent(CHAT_DEBUG_TOGGLE_EVENT)}
      >
        Debug
      </FloatingDebugButton>
      <CreateSessionModal
        open={sessionCreateContext !== null}
        context={sessionCreateContext}
        creating={creatingSession}
        onCreate={(providerId) => { void handleCreateSessionWithProvider(providerId); }}
        onClose={() => setSessionCreateContext(null)}
      />
    </ChatWrapper>
  );
}
