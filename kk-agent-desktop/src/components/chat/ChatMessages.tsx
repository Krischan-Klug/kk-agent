import { Fragment, type RefObject } from "react";
import Badge from "@/components/Badge";
import Spinner from "@/components/Spinner";
import MarkdownMessage from "@/components/MarkdownMessage";
import {
  summarizeRunToolCalls,
  type RunEvent,
  type SessionState,
  type TranscriptMessage,
} from "kk-agent-contract";
import type { RuntimeCapability } from "@/types/runtime";
import type { PendingPrompt, StreamingTurnState } from "./types";
import AgentStepBubble from "./AgentStepBubble";
import MessageAssets from "./MessageAssets";
import PendingPromptCard from "./PendingPromptCard";
import { collectAssetRefs, collectReasoning, collectText } from "./messageBlocks";
import { buildStreamingStepGroups, groupMessages } from "./messageGrouping";
import {
  CardContent,
  EmptyState,
  LoadingWrap,
  MessageBubble,
  MessageFooter,
  MessageTimestamp,
  Messages,
  ReasoningCard,
  ReasoningSummary,
  RoleLabel,
  SystemNotice,
} from "./ChatMessages.styled";

type Props = {
  session: SessionState;
  currentAgentName: string;
  capabilities: RuntimeCapability[];
  streaming: boolean;
  streamTurn: StreamingTurnState | null;
  streamRunEvents: RunEvent[];
  pendingPrompt: PendingPrompt | null;
  customAnswer: string;
  messagesRef: RefObject<HTMLDivElement | null>;
  onMessagesScroll: () => void;
  onCustomAnswerChange: (value: string) => void;
  onPromptResponse: (selectedKey: string) => void;
};

function renderSingleMessage(
  message: TranscriptMessage,
  session: SessionState,
) {
  if (message.role === "tool") return null;

  const text = collectText(message.content).trim();
  const reasoning = collectReasoning(message.content).trim();
  const assetRefs = collectAssetRefs(message.content);
  const assetsById = new Map(session.assets.map((asset) => [asset.id, asset]));
  const assets = assetRefs.map((ref) => assetsById.get(ref.assetId)).filter((asset) => asset !== undefined);
  const timestamp = formatChatTime(message.timestamp);

  return (
    <MessageBubble key={message.id} $role={message.role}>
      {message.role !== "user" && (
        <RoleLabel>
          <Badge variant="warning">system</Badge>
        </RoleLabel>
      )}

      {reasoning && (
        <ReasoningCard>
          <ReasoningSummary>Reasoning</ReasoningSummary>
          <CardContent>{reasoning}</CardContent>
        </ReasoningCard>
      )}

      {text && (message.role === "system" ? <MarkdownMessage content={text} /> : text)}

      {assets.length > 0 && (
        <MessageAssets sessionId={session.id} assets={assets} />
      )}

      {message.role !== "system" && (
        <MessageFooter>
          <MessageTimestamp>{timestamp}</MessageTimestamp>
        </MessageFooter>
      )}
    </MessageBubble>
  );
}

function formatChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function groupMessageIds(group: ReturnType<typeof groupMessages>[number]): string[] {
  return group.kind === "single"
    ? [group.message.id]
    : [group.step.assistant.id];
}

function renderRunEvent(event: RunEvent) {
  const label = event.kind === "context_compacted"
    ? "Context"
    : event.severity === "error"
      ? "Error"
      : event.severity === "warning"
        ? "Warning"
        : "Info";
  return (
    <SystemNotice key={event.id} $severity={event.severity}>
      <strong>{label}</strong>
      {` · ${event.message}`}
    </SystemNotice>
  );
}

export default function ChatMessages({
  session,
  currentAgentName,
  capabilities,
  streaming,
  streamTurn,
  streamRunEvents,
  pendingPrompt,
  customAnswer,
  messagesRef,
  onMessagesScroll,
  onCustomAnswerChange,
  onPromptResponse,
}: Props) {
  const messageGroups = groupMessages(session.messages);
  const streamingStepGroups = streamTurn ? buildStreamingStepGroups(streamTurn.steps) : [];
  const lastStepIdByUserMessage = new Map<string, string>();
  for (const group of messageGroups) {
    if (group.kind === "agent-step" && group.userMessageId) {
      lastStepIdByUserMessage.set(group.userMessageId, group.step.assistant.id);
    }
  }
  const persistedEvents = session.runs
    .flatMap((run) => run.events)
    .filter((event) => event.visibility === "user");
  const visibleStreamRunEvents = streamRunEvents.filter((event) => event.visibility === "user");
  const renderedEventIds = new Set<string>();

  return (
    <Messages ref={messagesRef} onScroll={onMessagesScroll}>
      {session.messages.length === 0 && !streaming && (
        <EmptyState>
          <p>Send a message to start.</p>
        </EmptyState>
      )}

      {messageGroups.map((group) => {
        const ids = new Set(groupMessageIds(group));
        const events = persistedEvents.filter((event) => ids.has(event.anchorMessageId));
        const run = group.kind === "agent-step" && group.userMessageId
          ? session.runs.find((candidate) => candidate.userMessageId === group.userMessageId)
          : undefined;
        const isFinalRunStep = group.kind === "agent-step"
          && Boolean(group.userMessageId)
          && lastStepIdByUserMessage.get(group.userMessageId!) === group.step.assistant.id;
        for (const event of events) renderedEventIds.add(event.id);
        return (
          <Fragment key={group.key}>
            {group.kind === "agent-step"
              ? <AgentStepBubble
                  sessionId={session.id}
                  currentAgentName={currentAgentName}
                  capabilities={capabilities}
                  step={group.step}
                  artifacts={(isFinalRunStep
                    ? (run?.artifactIds ?? [])
                    : [])
                    .map((assetId) => session.assets.find((asset) => asset.id === assetId))
                    .filter((asset) => asset !== undefined)}
                  toolStats={isFinalRunStep && run?.status !== "running" && group.userMessageId
                    ? summarizeRunToolCalls(session.messages, group.userMessageId)
                    : null}
                />
              : renderSingleMessage(group.message, session)}
            {events.map(renderRunEvent)}
          </Fragment>
        );
      })}

      {persistedEvents.filter((event) => !renderedEventIds.has(event.id)).map(renderRunEvent)}

      {streamingStepGroups.map((group) => (
        <AgentStepBubble
          key={group.key}
          sessionId={session.id}
          currentAgentName={currentAgentName}
          capabilities={capabilities}
          step={group.step}
          streaming={group.streaming}
        />
      ))}

      {visibleStreamRunEvents.map(renderRunEvent)}

      {streaming && streamingStepGroups.length === 0 && !pendingPrompt && (
        <LoadingWrap>
          <Spinner />
        </LoadingWrap>
      )}

      {pendingPrompt && (
        <PendingPromptCard
          pendingPrompt={pendingPrompt}
          customAnswer={customAnswer}
          onCustomAnswerChange={onCustomAnswerChange}
          onPromptResponse={onPromptResponse}
        />
      )}
    </Messages>
  );
}
