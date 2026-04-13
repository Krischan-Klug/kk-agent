import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/Badge";
import MarkdownMessage from "@/components/MarkdownMessage";
import type { AgentLoopState, McpListItem } from "@/types/api";
import MessageAttachments from "./MessageAttachments";
import ToolCallCards from "./ToolCallCards";
import type { MessageGroup } from "./messageGrouping";
import { collectAttachments, collectReasoning, collectText } from "./messageBlocks";
import {
  CardContent,
  ExpandArrow,
  IterationHeader,
  IterationPill,
  IterationSection,
  MessageBubble,
  MessageFooter,
  MessageTimestamp,
  PhasePill,
  ReasoningCard,
  ReasoningSummary,
  RoleLabel,
  RoleMetaGroup,
  StreamingDot,
  ThinkingLabel,
  ThinkingSuffix,
} from "./ChatMessages.styled";
import type { ActiveToolCall } from "./types";

type Props = {
  sessionId: string;
  currentAgentName: string;
  mcps: McpListItem[];
  turn: Extract<MessageGroup, { kind: "agent-turn" }>;
  loopState?: AgentLoopState | null;
};

function collectLatestAttachments(iterations: Props["turn"]["iterations"]) {
  for (let index = iterations.length - 1; index >= 0; index -= 1) {
    const iteration = iterations[index];
    const attachments = iteration ? collectAttachments(iteration.assistant.content) : [];
    if (attachments.length > 0) return attachments;
  }
  return [];
}





function formatChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function renderReasoningSummary(isThinking: boolean, animateThinking: boolean) {
  return (
    <ReasoningSummary>
      <ThinkingLabel>
        Reasoning
        {isThinking && <ThinkingSuffix $active={animateThinking} />}
      </ThinkingLabel>
    </ReasoningSummary>
  );
}

export default function AgentTurnBubble({ sessionId, currentAgentName, mcps, turn, loopState }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { iterations } = turn;
  const finalIteration = iterations[iterations.length - 1]!;
  const totalToolCalls = iterations.reduce((sum, iteration) => sum + iteration.toolCalls.length, 0);
  const hasToggle = turn.streaming || iterations.length > 1 || totalToolCalls > 0;
  const finalReasoning = collectReasoning(finalIteration.assistant.content).trim();
  const finalText = collectText(finalIteration.assistant.content).trim();
  const collapsedAttachments = collectLatestAttachments(iterations);
  const showThinking = Boolean(turn.streaming) && finalReasoning.length > 0;
  const animateThinking = showThinking && finalText.length === 0;

  return (
    <MessageBubble $role="assistant">
      <RoleLabel>
        <Badge variant="info">{currentAgentName}</Badge>
        {turn.streaming && <StreamingDot />}
        {turn.streaming && loopState && <IterationPill>Iteration {loopState.iteration}</IterationPill>}
        {hasToggle && (
          <RoleMetaGroup
            type="button"
            onClick={() => setExpanded((previous) => !previous)}
            aria-label={expanded ? "Details ausblenden" : "Details einblenden"}
            title={expanded ? "Details ausblenden" : "Details einblenden"}
          >
            {expanded && !turn.streaming && (
              <IterationPill>
                {iterations.length} Iteration{iterations.length > 1 ? "en" : ""}
              </IterationPill>
            )}
            {expanded && totalToolCalls > 0 && (
              <PhasePill>
                {totalToolCalls} Tool Call{totalToolCalls > 1 ? "s" : ""}
              </PhasePill>
            )}
            <ExpandArrow $expanded={expanded}>&#9654;</ExpandArrow>
          </RoleMetaGroup>
        )}
      </RoleLabel>
      {expanded && iterations.map((iteration, index) => {
        const reasoning = collectReasoning(iteration.assistant.content).trim();
        const text = collectText(iteration.assistant.content).trim();
        const attachments = collectAttachments(iteration.assistant.content);
        const isFinalIteration = index === iterations.length - 1;
        const showIterationThinking = Boolean(turn.streaming) && isFinalIteration && reasoning.length > 0;
        const animateIterationThinking = showIterationThinking && text.length === 0;

        return (
          <IterationSection key={iteration.assistant.id}>
            <IterationHeader>
              <IterationPill>{isFinalIteration ? "#final" : `#${index + 1}`}</IterationPill>
              {iteration.toolCalls.length > 0 && (
                <PhasePill>{iteration.toolCalls.length} Tool{iteration.toolCalls.length > 1 ? "s" : ""}</PhasePill>
              )}
            </IterationHeader>

            {reasoning && (
              <ReasoningCard>
                {renderReasoningSummary(showIterationThinking, animateIterationThinking)}
                <CardContent>{reasoning}</CardContent>
              </ReasoningCard>
            )}

            {text && <MarkdownMessage content={text} />}

            {attachments.length > 0 && <MessageAttachments sessionId={sessionId} attachments={attachments} />}

            {iteration.toolCalls.length > 0 && <ToolCallCards mcps={mcps} toolCalls={iteration.toolCalls} />}
          </IterationSection>
        );
      })}

      {!expanded && finalReasoning && (
        <ReasoningCard>
          {renderReasoningSummary(showThinking, animateThinking)}
          <CardContent>{finalReasoning}</CardContent>
        </ReasoningCard>
      )}

      {!expanded && finalText && <MarkdownMessage content={finalText} />}



      {!expanded && collapsedAttachments.length > 0 && (
        <MessageAttachments sessionId={sessionId} attachments={collapsedAttachments} />
      )}

      <MessageFooter>
        <MessageTimestamp>{formatChatTime(finalIteration.assistant.timestamp)}</MessageTimestamp>
      </MessageFooter>
    </MessageBubble>
  );
}
