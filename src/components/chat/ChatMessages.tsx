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
import type { ActiveToolCall, PendingPrompt } from "./types";
import AgentTurnBubble from "./AgentTurnBubble";
import MessageAttachments from "./MessageAttachments";
import PendingPromptCard from "./PendingPromptCard";
import ToolCallCards from "./ToolCallCards";
import { buildToolCards, collectAttachments, collectReasoning, collectText, collectToolUses } from "./messageBlocks";
import { groupMessages } from "./messageGrouping";
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

type Props = {
  session: SessionState;
  currentAgentName: string;
  mcps: McpListItem[];
  streaming: boolean;
  streamMessage: SessionMessage | null;
  streamToolCalls: ActiveToolCall[];
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
  currentAgentName: string,
  mcps: McpListItem[],
) {
  if (message.role === "tool") return null;

  const text = collectText(message.content).trim();
  const reasoning = collectReasoning(message.content).trim();
  const attachments = collectAttachments(message.content);
  const toolCalls = message.role === "assistant" ? buildToolCards(collectToolUses(message.content)) : [];

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
        <MessageAttachments attachments={attachments} />
      )}

      {toolCalls.length > 0 && (
        <ToolCallCards mcps={mcps} toolCalls={toolCalls} />
      )}
    </MessageBubble>
  );
}

export default function ChatMessages({
  session,
  currentAgentName,
  mcps,
  streaming,
  streamMessage,
  streamToolCalls,
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

  return (
    <Messages ref={messagesRef} onScroll={onMessagesScroll}>
      {session.messages.length === 0 && !streaming && (
        <EmptyState>
          <p>Schreibe eine Nachricht um zu starten.</p>
        </EmptyState>
      )}

      {messageGroups.map((group) => (
        group.kind === "agent-turn"
          ? <AgentTurnBubble key={group.key} currentAgentName={currentAgentName} mcps={mcps} turn={group} />
          : renderSingleMessage(group.message, currentAgentName, mcps)
      ))}

      {streamSystemNotices.map((message, index) => (
        <SystemNotice key={`stream-notice-${index}`}>{message}</SystemNotice>
      ))}

      {streaming && streamMessage && (
        <MessageBubble $role="assistant">
          <RoleLabel>
            <Badge variant="info">{currentAgentName}</Badge>
            <StreamingDot />
            {loopState && <IterationPill>Iteration {loopState.iteration}/{loopState.maxIterations}</IterationPill>}
            {loopState && <PhasePill>{loopState.mode}</PhasePill>}
          </RoleLabel>

          {collectReasoning(streamMessage.content).trim() && (
            <ReasoningCard open>
              <ReasoningSummary>Reasoning</ReasoningSummary>
              <CardContent>{collectReasoning(streamMessage.content).trim()}</CardContent>
            </ReasoningCard>
          )}

          {collectText(streamMessage.content).trim() && (
            <MarkdownMessage content={collectText(streamMessage.content)} />
          )}

          {collectAttachments(streamMessage.content).length > 0 && (
            <MessageAttachments attachments={collectAttachments(streamMessage.content)} />
          )}

          {(() => {
            const streamedToolUses = collectToolUses(streamMessage.content);
            const mergedToolCalls = streamedToolUses.length > 0
              ? streamedToolUses.map((toolUse) => {
                  const execution = streamToolCalls.find((toolCall) => toolCall.id === toolUse.id);
                  return execution
                    ? {
                        ...execution,
                        id: toolUse.id,
                        name: toolUse.name,
                        input: toolUse.input,
                      }
                    : {
                        id: toolUse.id,
                        name: toolUse.name,
                        input: toolUse.input,
                        status: "queued" as const,
                      };
                })
              : streamToolCalls;

            return mergedToolCalls.length > 0 ? <ToolCallCards mcps={mcps} toolCalls={mergedToolCalls} /> : null;
          })()}
        </MessageBubble>
      )}

      {streaming && !streamMessage && streamToolCalls.length === 0 && !pendingPrompt && (
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
