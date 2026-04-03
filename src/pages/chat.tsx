import { useEffect, useState } from "react";
import styled from "styled-components";
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
import { emitAppEvent, CHAT_DEBUG_TOGGLE_EVENT } from "@/lib/appEvents";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { useAttachments } from "@/hooks/useAttachments";
import { useChatSessionData } from "@/hooks/useChatSessionData";
import { useChatStreaming } from "@/hooks/useChatStreaming";
import { session as sessionApi } from "@/lib/api";

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
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTab, setDebugTab] = useState<ChatDebugTab | null>("prompt");
  const [debugPrompt, setDebugPrompt] = useState<string | null>(null);
  const { ref: messagesRef, scrollToBottom, handleScroll } = useChatAutoScroll();
  const attachments = useAttachments();

  const sessionData = useChatSessionData({
    setDebugOpen,
    onDebugOpen: (sessionId: string) => {
      sessionApi.getPrompt(sessionId)
        .then((result) => setDebugPrompt(result.systemPrompt))
        .catch(() => setDebugPrompt("[Fehler beim Laden]"));
    },
  });

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

  useEffect(
    scrollToBottom,
    [sessionData.session?.messages, streaming.streamContent, streaming.streamReasoning, streaming.streamToolCalls, scrollToBottom],
  );

  const modelInfo = sessionData.session ? sessionData.modelInfoMap.get(sessionData.session.model) : undefined;
  const modelSettings = sessionData.session ? sessionData.modelSettingsMap[sessionData.session.model] : undefined;
  const resolvedEndpoint = getResolvedEndpoint(modelInfo, modelSettings);
  const endpointCapabilities = getEndpointCapabilities(modelInfo, resolvedEndpoint);
  const reasoningLevels = modelInfo?.capabilities.supportsReasoning
    ? getReasoningLevels(modelInfo)
    : [...DEFAULT_REASONING_LEVELS];
  const reasoningOptions = reasoningLevels.map((level) => ({ value: level, label: level }));
  const resolvedEffort = getResolvedReasoningEffort(modelInfo, modelSettings, sessionData.session?.reasoningEffort);
  const resolvedLevelConfig = getDefaultLevelConfig(resolvedEffort);
  const resolvedTemp = sessionData.session
    ? (
      sessionData.session.temperature ??
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

  if (sessionData.loading) return <Spinner />;

  if (!sessionData.session) {
    return (
      <ChatWrapper>
        <EmptyState>
          <p>Keine aktive Session.</p>
          <Button onClick={() => void sessionData.handleNewSession()}>Neue Session starten</Button>
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
        internalTools={sessionData.toolMcps}
        debugMcps={sessionData.mcps}
        debugTasks={sessionData.tasks}
        debugSessionFacts={sessionData.sessionFacts}
        debugUserFacts={sessionData.userFacts}
        models={sessionData.models}
        onModelSwitch={sessionData.handleModelSwitch}
        onToolToggle={sessionData.handleToolToggle}
        onMcpToggle={sessionData.handleMcpToggle}
        onSaveTasks={sessionData.handleSaveTasks}
        onSaveSessionFacts={sessionData.handleSaveSessionFacts}
        onSaveUserFacts={sessionData.handleSaveUserFacts}
      />
      <ChatMessages
        session={sessionData.session}
        currentAgentName={sessionData.currentAgentName}
        mcps={[...sessionData.toolMcps, ...sessionData.mcps]}
        streaming={streaming.streaming}
        streamContent={streaming.streamContent}
        streamReasoning={streaming.streamReasoning}
        streamToolCalls={streaming.streamToolCalls}
        streamRetryNotices={streaming.streamRetryNotices}
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
        activeMode={activeSession.activeMode}
        showReasoningControl={showReasoningControl}
        showTemperatureControl={showTemperatureControl}
        resolvedEffort={resolvedEffort}
        resolvedTemp={resolvedTemp}
        reasoningOptions={reasoningOptions}
        temperatureOptions={temperatureOptions}
        maxCtx={maxCtx}
        tokenStats={streaming.tokenStats}
        tasks={sessionData.tasks}
        loopState={streaming.loopState}
        pendingAttachments={attachments.pendingAttachments}
        onInputChange={streaming.setInput}
        onKeyDown={streaming.handleKeyDown}
        onReasoningSelect={sessionData.handleReasoningEffort}
        onTemperatureSelect={sessionData.handleTemperature}
        onAgentSwitch={(agentId) => void streaming.handleAgentSwitch(agentId, sessionData.handleAgentSwitch)}
        onModeSwitch={(mode) => void sessionData.handleModeSwitch(mode)}
        onSend={() => void streaming.handleSend()}
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
    </ChatWrapper>
  );
}
