import type { RefObject } from "react";
import Badge from "@/components/Badge";
import Spinner from "@/components/Spinner";
import MarkdownMessage from "@/components/MarkdownMessage";
import type {
  AgentLoopState,
  McpListItem,
  SessionMessage,
  SessionState,
} from "@/types/api";
import type { PendingPrompt, StreamingTurnState } from "./types";
import AgentTurnBubble from "./AgentTurnBubble";
import MessageAttachments from "./MessageAttachments";
import PendingPromptCard from "./PendingPromptCard";
import ToolCallCards from "./ToolCallCards";
import { buildToolCards, collectAttachments, collectReasoning, collectText, collectToolUses } from "./messageBlocks";
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
  streamSystemNotices: string[];
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
  sessionId: string,
  currentAgentName: string,
  mcps: McpListItem[],
) {
  if (message.role === "tool" || message.isMeta) return null;

  const text = collectText(message.content).trim();
  const reasoning = collectReasoning(message.content).trim();
  const attachments = collectAttachments(message.content);
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

      {attachments.length > 0 && (
        <MessageAttachments sessionId={sessionId} attachments={attachments} />
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

export default function ChatMessages({
  session,
  currentAgentName,
  mcps,
  streaming,
  streamTurn,
  streamSystemNotices,
  loopState,
  pendingPrompt,
  customAnswer,
  messagesRef,
  onMessagesScroll,
  onCustomAnswerChange,
  onPromptResponse,
}: Props) {
  const messageGroups = groupMessages(session.messages);
  const streamingGroup = streamTurn ? buildStreamingTurnGroup(streamTurn.iterations) : null;

  return (
    <Messages ref={messagesRef} onScroll={onMessagesScroll}>
      {session.messages.length === 0 && !streaming && (
        <EmptyState>
          <p>Send a message to start.</p>
        </EmptyState>
      )}

      {messageGroups.map((group) => (
        group.kind === "agent-turn"
          ? <AgentTurnBubble key={group.key} sessionId={session.id} currentAgentName={currentAgentName} mcps={mcps} turn={group} />
          : renderSingleMessage(group.message, session.id, currentAgentName, mcps)
      ))}

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

      {streamSystemNotices.map((message, index) => (
        <SystemNotice key={`stream-notice-${index}`}>{message}</SystemNotice>
      ))}

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
