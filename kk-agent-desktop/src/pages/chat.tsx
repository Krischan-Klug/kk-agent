import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
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
import { reportError } from "@/lib/errorReporting";
import { resolveDefaultSessionAgentId } from "@/lib/sessionFactory";
import { getSessionModelRef } from "@/lib/modelRefs";
import type { ReasoningEffort, SessionPromptDebug } from "kk-agent-contract";

const REASONING_COLORS: Record<ReasoningEffort, string> = {
  none: "var(--text-muted)",
  low: "var(--success)",
  medium: "var(--info)",
  high: "var(--accent)",
  xhigh: "var(--warning)",
};

const ChatWrapper = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  max-height: calc(100vh - 2 * var(--space-lg));
`;

const JumpToLatestButton = styled(Button).attrs({ size: "sm" })`
  position: absolute;
  left: 50%;
  bottom: 104px;
  transform: translateX(-50%);
  z-index: 30;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
`;

const FloatingDebugButton = styled(Button).attrs({ size: "sm" })`
  position: fixed;
  left: var(--space-lg);
  bottom: var(--space-lg);
  z-index: 40;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
`;

export default function ChatPage() {
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTab, setDebugTab] = useState<ChatDebugTab>("model-input");
  const [debug, setDebug] = useState<SessionPromptDebug | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const debugPromptRequestRef = useRef(0);
  const assets = useAssets();

  const refreshDebugPrompt = useCallback(async (sessionId: string) => {
    const requestId = ++debugPromptRequestRef.current;
    try {
      const result = await sessionApi.getPrompt(sessionId);
      if (requestId === debugPromptRequestRef.current) {
        setDebug(result);
      }
    } catch (error) {
      reportError("Failed to load debug information", error);
      if (requestId === debugPromptRequestRef.current) {
        setDebug(null);
      }
    }
  }, []);

  const sessionData = useChatSessionData({
    setDebugOpen,
    onDebugOpen: refreshDebugPrompt,
  });
  const {
    ref: messagesRef,
    scrollToBottom,
    jumpToLatest,
    handleScroll,
    hasUnseenContent,
  } = useChatAutoScroll(sessionData.session?.id);
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
  const sessionId = sessionData.session?.id;

  useEffect(() => {
    if (!debugOpen || !sessionId) {
      debugPromptRequestRef.current++;
      return;
    }

    queueMicrotask(() => {
      void refreshDebugPrompt(sessionId);
    });
  }, [
    debugOpen,
    refreshDebugPrompt,
    sessionId,
    streaming.loopState?.status,
  ]);

  useEffect(
    scrollToBottom,
    [sessionData.session?.messages, streaming.streamTurn, scrollToBottom],
  );

  useEffect(() => {
    if (streaming.sending) jumpToLatest();
  }, [jumpToLatest, streaming.sending]);

  const modelInfo = sessionData.session ? sessionData.modelInfoMap.get(getSessionModelRef(sessionData.session)) : undefined;
  const modelSettings = sessionData.session ? sessionData.modelSettingsMap[getSessionModelRef(sessionData.session)] : undefined;
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
  const contextUsage = sessionData.session?.contextState.usage;
  const maxCtx = contextUsage?.limitTokens ?? 0;
  const tokenStats = streaming.tokenStats ?? (contextUsage
    ? {
        input: contextUsage.inputTokens,
        output: contextUsage.outputTokens,
        reasoning: contextUsage.reasoningTokens,
        used: contextUsage.usedTokens,
      }
    : null);

  async function beginNewSession() {
    try {
      setCreatingSession(true);
      await sessionData.handleNewSession(resolveDefaultSessionAgentId(sessionData.agents));
    } catch (err) {
      reportError("Failed to create session", err);
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
        tab={debugTab}
        onTabChange={setDebugTab}
        session={activeSession}
        loopState={streaming.loopState}
        streamRunEvents={streaming.streamRunEvents}
        debug={debug}
      />
      <ChatMessages
        session={sessionData.session}
        currentAgentName={sessionData.currentAgentName}
        capabilities={[...sessionData.internalTools, ...sessionData.mcps]}
        streaming={streaming.streaming}
        streamTurn={streaming.streamTurn}
        streamRunEvents={streaming.streamRunEvents}
        pendingPrompt={streaming.pendingPrompt}
        customAnswer={streaming.customAnswer}
        messagesRef={messagesRef}
        onMessagesScroll={handleScroll}
        onCustomAnswerChange={streaming.setCustomAnswer}
        onPromptResponse={streaming.handlePromptResponse}
      />
      {hasUnseenContent && (
        <JumpToLatestButton type="button" onClick={jumpToLatest}>
          ↓ Zur neuesten Nachricht
        </JumpToLatestButton>
      )}
      <ChatComposer
        input={streaming.input}
        sending={streaming.sending || assets.uploading}
        aborting={streaming.aborting}
        agents={sessionData.agents}
        currentAgentId={activeSession.agentId}
        reasoningValue={resolvedEffort}
        reasoningOptions={reasoningOptions}
        approvalMode={activeSession.approvalMode}
        maxCtx={maxCtx}
        tokenStats={tokenStats}
        tasks={sessionData.tasks}
        pendingAssets={assets.pendingAssets}
        onInputChange={streaming.setInput}
        onKeyDown={streaming.handleKeyDown}
        onAgentSwitch={(agentId) => void streaming.handleAgentSwitch(agentId, sessionData.handleAgentSwitch)}
        onReasoningSelect={(effort) => void sessionData.handleReasoningEffort(effort)}
        onApprovalModeSwitch={(approvalMode) => void sessionData.handleApprovalModeSwitch(approvalMode)}
        onSend={() => void streaming.handleSend()}
        onAbort={() => void streaming.handleAbort()}
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
