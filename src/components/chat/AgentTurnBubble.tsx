import { useState } from "react";
import Badge from "@/components/Badge";
import MarkdownMessage from "@/components/MarkdownMessage";
import type { McpListItem } from "@/types/api";
import MessageAttachments from "./MessageAttachments";
import ToolCallCards from "./ToolCallCards";
import type { MessageGroup } from "./messageGrouping";
import { buildToolCards, collectAttachments, collectReasoning, collectText, collectToolUses } from "./messageBlocks";
import {
  CardContent,
  ExpandArrow,
  IterationHeader,
  IterationPill,
  IterationSection,
  MessageBubble,
  PhasePill,
  ReasoningCard,
  ReasoningSummary,
  RoleLabel,
  RoleMetaGroup,
} from "./ChatMessages.styled";

type Props = {
  currentAgentName: string;
  mcps: McpListItem[];
  turn: Extract<MessageGroup, { kind: "agent-turn" }>;
};

export default function AgentTurnBubble({ currentAgentName, mcps, turn }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { iterations } = turn;
  const finalIteration = iterations[iterations.length - 1]!;
  const totalToolCalls = iterations.reduce(
    (sum, iteration) => sum + collectToolUses(iteration.assistant.content).length,
    0,
  );
  const hasMultiple = iterations.length > 1 || totalToolCalls > 0;
  const finalReasoning = collectReasoning(finalIteration.assistant.content).trim();
  const finalText = collectText(finalIteration.assistant.content).trim();
  const finalAttachments = collectAttachments(finalIteration.assistant.content);

  return (
    <MessageBubble $role="assistant">
      <RoleLabel>
        <Badge variant="info">{currentAgentName}</Badge>
        {hasMultiple && (
          <RoleMetaGroup
            type="button"
            onClick={() => setExpanded((previous) => !previous)}
            aria-label={expanded ? "Details ausblenden" : "Details einblenden"}
            title={expanded ? "Details ausblenden" : "Details einblenden"}
          >
            <IterationPill>
              {iterations.length} Iteration{iterations.length > 1 ? "en" : ""}
            </IterationPill>
            {totalToolCalls > 0 && (
              <PhasePill>
                {totalToolCalls} Tool Call{totalToolCalls > 1 ? "s" : ""}
              </PhasePill>
            )}
            <ExpandArrow $expanded={expanded}>&#9654;</ExpandArrow>
          </RoleMetaGroup>
        )}
      </RoleLabel>

      {expanded && iterations.map((iteration, index) => {
        const toolCalls = buildToolCards(collectToolUses(iteration.assistant.content), iteration.toolResults);
        const reasoning = collectReasoning(iteration.assistant.content).trim();
        const text = collectText(iteration.assistant.content).trim();
        const attachments = collectAttachments(iteration.assistant.content);
        const isFinalIteration = index === iterations.length - 1;

        return (
          <IterationSection key={iteration.assistant.id}>
            <IterationHeader>
              <IterationPill>{isFinalIteration ? "#final" : `#${index + 1}`}</IterationPill>
              {toolCalls.length > 0 && (
                <PhasePill>{toolCalls.length} Tool{toolCalls.length > 1 ? "s" : ""}</PhasePill>
              )}
            </IterationHeader>

            {reasoning && (
              <ReasoningCard>
                <ReasoningSummary>Reasoning</ReasoningSummary>
                <CardContent>{reasoning}</CardContent>
              </ReasoningCard>
            )}

            {text && <MarkdownMessage content={text} />}

            {attachments.length > 0 && <MessageAttachments attachments={attachments} />}

            {toolCalls.length > 0 && <ToolCallCards mcps={mcps} toolCalls={toolCalls} />}
          </IterationSection>
        );
      })}

      {!expanded && finalReasoning && (
        <ReasoningCard>
          <ReasoningSummary>Reasoning</ReasoningSummary>
          <CardContent>{finalReasoning}</CardContent>
        </ReasoningCard>
      )}

      {!expanded && finalText && <MarkdownMessage content={finalText} />}

      {!expanded && finalAttachments.length > 0 && <MessageAttachments attachments={finalAttachments} />}
    </MessageBubble>
  );
}
