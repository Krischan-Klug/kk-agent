import { Fragment, type RefObject } from "react";
import Badge from "@/components/Badge";
import Spinner from "@/components/Spinner";
import MarkdownMessage from "@/components/MarkdownMessage";
import type {
  AgentLoopState,
  McpListItem,
  RunEvent,
  SessionMessage,
  SessionState,
} from "@/types/api";
import type { PendingPrompt, StreamingTurnState } from "./types";
import AgentTurnBubble from "./AgentTurnBubble";
import MessageAssets from "./MessageAssets";
import PendingPromptCard from "./PendingPromptCard";
import ToolCallCards from "./ToolCallCards";
import { buildToolCards, collectAssetRefs, collectReasoning, collectText, collectToolUses } from "./messageBlocks";
import { buildStreamingTurnGroup, groupMessages } from "./messageGrouping";
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
  mcps: McpListItem[];
  streaming: boolean;
  streamTurn: StreamingTurnState | null;
  streamRunEvents: RunEvent[];
  loopState: AgentLoopState | null;
  pendingPrompt: PendingPrompt | null;
  customAnswer: string;
  messagesRef: RefObject<HTMLDivElement | null>;
  onMessagesScroll: () => void;
  onCustomAnswerChange: (value: string) => void;
  onPromptResponse: (selectedKey: string) => void;
};

function renderSingleMessage(
  message: SessionMessage,
  session: SessionState,
  currentAgentName: string,
  mcps: McpListItem[],
) {
  if (message.role === "tool") return null;

  const text = collectText(message.content).trim();
  const reasoning = collectReasoning(message.content).trim();
  const assetRefs = collectAssetRefs(message.content);
  const assetsById = new Map(session.assets.map((asset) => [asset.id, asset]));
  const assets = assetRefs.map((ref) => assetsById.get(ref.assetId)).filter((asset) => asset !== undefined);
  const toolCalls = message.role === "assistant" ? buildToolCards(collectToolUses(message.content)) : [];
  const timestamp = formatChatTime(message.timestamp);

  return (
    <MessageBubble key={message.id} $role={message.role}>
      {message.role !== "user" && (
        <RoleLabel>
          <Badge variant={message.role === "system" ? "warning" : "info"}>
            {message.role === "system" ? "system" : currentAgentName}
          </Badge>
        </RoleLabel>
      )}

      {reasoning && (
        <ReasoningCard>
          <ReasoningSummary>Reasoning</ReasoningSummary>
          <CardContent>{reasoning}</CardContent>
        </ReasoningCard>
      )}

      {text && (message.role === "assistant" || message.role === "system"
        ? <MarkdownMessage content={text} />
        : text)}

      {assets.length > 0 && (
        <MessageAssets sessionId={session.id} assets={assets} />
      )}

      {toolCalls.length > 0 && (
        <ToolCallCards mcps={mcps} toolCalls={toolCalls} />
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
    : group.steps.map((step) => step.assistant.id);
}

function renderRunEvent(event: RunEvent) {
  return (
    <SystemNotice key={event.id} $severity={event.severity}>
      <strong>{event.severity === "error" ? "Error" : event.severity === "warning" ? "Warning" : "Info"}</strong>
      {` · ${event.message}`}
    </SystemNotice>
  );
}

export default function ChatMessages({
  session,
  currentAgentName,
  mcps,
  streaming,
  streamTurn,
  streamRunEvents,
  loopState,
  pendingPrompt,
  customAnswer,
  messagesRef,
  onMessagesScroll,
  onCustomAnswerChange,
  onPromptResponse,
}: Props) {
  const messageGroups = groupMessages(session.messages);
  const streamingGroup = streamTurn ? buildStreamingTurnGroup(streamTurn.steps) : null;
  const persistedEvents = session.runs.flatMap((run) => run.events);
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
        for (const event of events) renderedEventIds.add(event.id);
        return (
          <Fragment key={group.key}>
            {group.kind === "agent-turn"
              ? <AgentTurnBubble
                  sessionId={session.id}
                  currentAgentName={currentAgentName}
                  mcps={mcps}
                  turn={group}
                  artifacts={(session.runs.find((run) => run.userMessageId === group.userMessageId)?.artifactIds ?? [])
                    .map((assetId) => session.assets.find((asset) => asset.id === assetId))
                    .filter((asset) => asset !== undefined)}
                />
              : renderSingleMessage(group.message, session, currentAgentName, mcps)}
            {events.map(renderRunEvent)}
          </Fragment>
        );
      })}

      {persistedEvents.filter((event) => !renderedEventIds.has(event.id)).map(renderRunEvent)}

      {streamingGroup && (
        <AgentTurnBubble
          key={streamingGroup.key}
          sessionId={session.id}
          currentAgentName={currentAgentName}
          mcps={mcps}
          turn={streamingGroup}
          loopState={loopState}
        />
      )}

      {streamRunEvents.map(renderRunEvent)}

      {streaming && !streamingGroup && !pendingPrompt && (
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
