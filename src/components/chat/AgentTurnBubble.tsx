import { useState } from "react";
import Badge from "@/components/Badge";
import MarkdownMessage from "@/components/MarkdownMessage";
import type { McpListItem } from "@/types/api";
import type { ActiveToolCall } from "./types";
import type { MessageGroup } from "./messageGrouping";
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
import ToolCallCards from "./ToolCallCards";

type Props = {
  currentAgentName: string;
  mcps: McpListItem[];
  turn: Extract<MessageGroup, { kind: "agent-turn" }>;
  turnKey: number;
};

export default function AgentTurnBubble({ currentAgentName, mcps, turn, turnKey }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { iterations } = turn;
  const finalIteration = iterations[iterations.length - 1];
  const totalToolCalls = iterations.reduce((sum, iteration) => sum + (iteration.assistant.tool_calls?.length ?? 0), 0);
  const hasMultiple = iterations.length > 1 || totalToolCalls > 0;

  return (
    <MessageBubble key={turnKey} $role="assistant">
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
        const toolCalls: ActiveToolCall[] = (iteration.assistant.tool_calls ?? []).map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
          result: iteration.toolResults.get(toolCall.id),
        }));

        return (
          <IterationSection key={index}>
            <IterationHeader>
              <IterationPill>#{index + 1}</IterationPill>
              {toolCalls.length > 0 && (
                <PhasePill>{toolCalls.length} Tool{toolCalls.length > 1 ? "s" : ""}</PhasePill>
              )}
            </IterationHeader>
            {iteration.assistant.reasoning?.trim() && (
              <ReasoningCard>
                <ReasoningSummary>Reasoning</ReasoningSummary>
                <CardContent>{iteration.assistant.reasoning.trim()}</CardContent>
              </ReasoningCard>
            )}
            {iteration.assistant.content?.trim() && (
              <MarkdownMessage content={iteration.assistant.content} />
            )}
            {toolCalls.length > 0 && <ToolCallCards mcps={mcps} toolCalls={toolCalls} />}
          </IterationSection>
        );
      })}

      {!expanded && finalIteration.assistant.reasoning?.trim() && (
        <ReasoningCard>
          <ReasoningSummary>Reasoning</ReasoningSummary>
          <CardContent>{finalIteration.assistant.reasoning.trim()}</CardContent>
        </ReasoningCard>
      )}

      {finalIteration.assistant.content?.trim() && (
        <MarkdownMessage content={finalIteration.assistant.content} />
      )}
    </MessageBubble>
  );
}
