import type { RefObject } from "react";
import Badge from "@/components/Badge";
import Spinner from "@/components/Spinner";
import MarkdownMessage from "@/components/MarkdownMessage";
import type { AgentLoopState, McpListItem, SessionMessage, SessionState } from "@/types/api";
import type { ActiveToolCall, PendingPrompt } from "./types";
import MessageAttachments from "./MessageAttachments";
import AgentTurnBubble from "./AgentTurnBubble";
import PendingPromptCard from "./PendingPromptCard";
import ToolCallCards from "./ToolCallCards";
import {
  CardContent,
  EmptyState,
  IterationPill,
  LoadingWrap,
  MessageBubble,
  Messages,
  PhasePill,
  ReasoningCard,
  ReasoningSummary,
  RoleLabel,
  StreamingDot,
  SystemNotice,
} from "./ChatMessages.styled";
import { groupMessages } from "./messageGrouping";

type Props = {
  session: SessionState;
  currentAgentName: string;
  mcps: McpListItem[];
  streaming: boolean;
  streamContent: string;
  streamReasoning: string;
  streamToolCalls: ActiveToolCall[];
  streamRetryNotices: string[];
  loopState: AgentLoopState | null;
  pendingPrompt: PendingPrompt | null;
  customAnswer: string;
  messagesRef: RefObject<HTMLDivElement | null>;
  onMessagesScroll: () => void;
  onCustomAnswerChange: (value: string) => void;
  onPromptResponse: (selectedKey: string) => void;
};

function renderSingleMessage(message: SessionMessage, index: number, currentAgentName: string) {
  if (message.role === "tool") return null;

  return (
    <MessageBubble key={index} $role={message.role}>
      {message.role !== "user" && (
        <RoleLabel>
          <Badge variant={message.role === "system" ? "warning" : "info"}>
            {message.role === "system" ? "system" : currentAgentName}
          </Badge>
        </RoleLabel>
      )}

      {message.reasoning?.trim() && (
        <ReasoningCard>
          <ReasoningSummary>Reasoning</ReasoningSummary>
          <CardContent>{message.reasoning.trim()}</CardContent>
        </ReasoningCard>
      )}

      {message.role === "assistant" ? <MarkdownMessage content={message.content} /> : message.content}

      {message.attachments && message.attachments.length > 0 && (
        <MessageAttachments attachments={message.attachments} />
      )}
    </MessageBubble>
  );
}

export default function ChatMessages({
  session,
  currentAgentName,
  mcps,
  streaming,
  streamContent,
  streamReasoning,
  streamToolCalls,
  streamRetryNotices,
  loopState,
  pendingPrompt,
  customAnswer,
  messagesRef,
  onMessagesScroll,
  onCustomAnswerChange,
  onPromptResponse,
}: Props) {
  return (
    <Messages ref={messagesRef} onScroll={onMessagesScroll}>
      {session.messages.length === 0 && !streaming && (
        <EmptyState>
          <p>Schreibe eine Nachricht um zu starten.</p>
        </EmptyState>
      )}

      {groupMessages(session.messages).map((group) => {
        if (group.kind === "single") {
          return renderSingleMessage(group.message, group.index, currentAgentName);
        }

        return (
          <AgentTurnBubble
            key={group.indices[0]}
            currentAgentName={currentAgentName}
            mcps={mcps}
            turn={group}
            turnKey={group.indices[0]}
          />
        );
      })}

      {streamRetryNotices.map((message, index) => (
        <SystemNotice key={`stream-retry-${index}`}>{message}</SystemNotice>
      ))}

      {streaming && (streamContent || streamReasoning || streamToolCalls.length > 0) && (
        <MessageBubble $role="assistant">
          <RoleLabel>
            <Badge variant="info">{currentAgentName}</Badge>
            <StreamingDot />
            {loopState && <IterationPill>Iteration {loopState.iteration}/{loopState.maxIterations}</IterationPill>}
            {loopState && <PhasePill>{loopState.mode}</PhasePill>}
          </RoleLabel>

          {streamReasoning && (
            <ReasoningCard open>
              <ReasoningSummary>Reasoning</ReasoningSummary>
              <CardContent>{streamReasoning}</CardContent>
            </ReasoningCard>
          )}

          <MarkdownMessage content={streamContent} />
          {streamToolCalls.length > 0 && <ToolCallCards mcps={mcps} toolCalls={streamToolCalls} />}
        </MessageBubble>
      )}

      {streaming && !streamContent && !streamReasoning && streamToolCalls.length === 0 && !pendingPrompt && (
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
