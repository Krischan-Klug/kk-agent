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

function isActiveToolCall(toolCall: ActiveToolCall): boolean {
  return toolCall.status === "queued" || toolCall.status === "executing" || toolCall.status === "yielded";
}

function collectStreamingActiveToolCalls(iterations: Props["turn"]["iterations"]): ActiveToolCall[] {
  const byId = new Map<string, ActiveToolCall>();
  for (const iteration of iterations) {
    for (const toolCall of iteration.toolCalls) {
      if (!isActiveToolCall(toolCall)) continue;
      byId.set(toolCall.id, toolCall);
    }
  }
  return [...byId.values()];
}

function collectLatestToolCall(iterations: Props["turn"]["iterations"]): ActiveToolCall | null {
  for (let index = iterations.length - 1; index >= 0; index -= 1) {
    const iteration = iterations[index];
    const lastToolCall = iteration?.toolCalls.at(-1);
    if (lastToolCall) return lastToolCall;
  }
  return null;
}

function collectLatestAttachments(iterations: Props["turn"]["iterations"]) {
  for (let index = iterations.length - 1; index >= 0; index -= 1) {
    const iteration = iterations[index];
    const attachments = iteration ? collectAttachments(iteration.assistant.content) : [];
    if (attachments.length > 0) return attachments;
  }
  return [];
}

function buildToolCallSignature(toolCalls: ActiveToolCall[]): string {
  return JSON.stringify(
    toolCalls.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      status: toolCall.status,
      input: toolCall.input,
      displayText: toolCall.displayText,
      detail: toolCall.detail,
      summary: toolCall.summary,
      result: toolCall.result,
    })),
  );
}

const TOOLCALL_HIDE_DELAY_MS = 1200;

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
  const collapsedAttachments = useMemo(() => collectLatestAttachments(iterations), [iterations]);
  const activeToolCalls = useMemo(() => collectStreamingActiveToolCalls(iterations), [iterations]);
  const latestToolCall = useMemo(() => collectLatestToolCall(iterations), [iterations]);
  const targetCollapsedToolCalls = useMemo(
    () => turn.streaming
      ? (activeToolCalls.length > 0 ? activeToolCalls : latestToolCall ? [latestToolCall] : [])
      : (latestToolCall ? [latestToolCall] : []),
    [activeToolCalls, latestToolCall, turn.streaming],
  );
  const targetCollapsedToolCallsSignature = buildToolCallSignature(targetCollapsedToolCalls);
  const [retainedToolCalls, setRetainedToolCalls] = useState<ActiveToolCall[]>(targetCollapsedToolCalls);
  const collapsedToolCalls = targetCollapsedToolCalls.length > 0 ? targetCollapsedToolCalls : retainedToolCalls;
  const showThinking = Boolean(turn.streaming) && finalReasoning.length > 0;
  const animateThinking = showThinking && finalText.length === 0;

  useEffect(() => {
    if (targetCollapsedToolCalls.length > 0) {
      const timeout = window.setTimeout(() => {
        setRetainedToolCalls((previous) =>
          buildToolCallSignature(previous) === targetCollapsedToolCallsSignature ? previous : targetCollapsedToolCalls,
        );
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    if (retainedToolCalls.length === 0) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setRetainedToolCalls([]);
    }, TOOLCALL_HIDE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [retainedToolCalls.length, targetCollapsedToolCalls, targetCollapsedToolCallsSignature]);

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
            aria-label={expanded ? "Hide details" : "Show details"}
            title={expanded ? "Hide details" : "Show details"}
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

      {!expanded && collapsedToolCalls.length > 0 && (
        <ToolCallCards mcps={mcps} toolCalls={collapsedToolCalls} />
      )}

      {!expanded && collapsedAttachments.length > 0 && (
        <MessageAttachments sessionId={sessionId} attachments={collapsedAttachments} />
      )}

      <MessageFooter>
        <MessageTimestamp>{formatChatTime(finalIteration.assistant.timestamp)}</MessageTimestamp>
      </MessageFooter>
    </MessageBubble>
  );
}
