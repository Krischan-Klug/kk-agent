import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/Badge";
import MarkdownMessage from "@/components/MarkdownMessage";
import type { AgentLoopState, AssetMeta, McpListItem } from "@/types/api";
import MessageAssets from "./MessageAssets";
import ToolCallCards from "./ToolCallCards";
import type { MessageGroup } from "./messageGrouping";
import { collectReasoning, collectText } from "./messageBlocks";
import {
  CardContent,
  ExpandArrow,
  StepHeader,
  StepPill,
  StepSection,
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
  artifacts?: AssetMeta[];
};

function isActiveToolCall(toolCall: ActiveToolCall): boolean {
  return toolCall.status === "queued" || toolCall.status === "executing" || toolCall.status === "yielded";
}

function collectStreamingActiveToolCalls(steps: Props["turn"]["steps"]): ActiveToolCall[] {
  const byId = new Map<string, ActiveToolCall>();
  for (const step of steps) {
    for (const toolCall of step.toolCalls) {
      if (!isActiveToolCall(toolCall)) continue;
      byId.set(toolCall.id, toolCall);
    }
  }
  return [...byId.values()];
}

function collectLatestToolCall(steps: Props["turn"]["steps"]): ActiveToolCall | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    const lastToolCall = step?.toolCalls.at(-1);
    if (lastToolCall) return lastToolCall;
  }
  return null;
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

export default function AgentTurnBubble({ sessionId, currentAgentName, mcps, turn, loopState, artifacts = [] }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { steps } = turn;
  const finalStep = steps[steps.length - 1]!;
  const totalToolCalls = steps.reduce((sum, step) => sum + step.toolCalls.length, 0);
  const hasToggle = turn.streaming || steps.length > 1 || totalToolCalls > 0;
  const finalReasoning = collectReasoning(finalStep.assistant.content).trim();
  const finalText = collectText(finalStep.assistant.content).trim();
  const activeToolCalls = useMemo(() => collectStreamingActiveToolCalls(steps), [steps]);
  const latestToolCall = useMemo(() => collectLatestToolCall(steps), [steps]);
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
        {turn.streaming && loopState && (
          <StepPill>Step {loopState.step} · Attempt {loopState.attempt}</StepPill>
        )}
        {hasToggle && (
          <RoleMetaGroup
            type="button"
            onClick={() => setExpanded((previous) => !previous)}
            aria-label={expanded ? "Hide details" : "Show details"}
            title={expanded ? "Hide details" : "Show details"}
          >
            {expanded && !turn.streaming && (
              <StepPill>{steps.length} Step{steps.length > 1 ? "s" : ""}</StepPill>
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

      {expanded && steps.map((step, index) => {
        const reasoning = collectReasoning(step.assistant.content).trim();
        const text = collectText(step.assistant.content).trim();
        const isFinalStep = index === steps.length - 1;
        const showStepThinking = Boolean(turn.streaming) && isFinalStep && reasoning.length > 0;
        const animateStepThinking = showStepThinking && text.length === 0;

        return (
          <StepSection key={step.assistant.id}>
            <StepHeader>
              <StepPill>{isFinalStep ? "#final" : `#${index + 1}`}</StepPill>
              {step.toolCalls.length > 0 && (
                <PhasePill>{step.toolCalls.length} Tool{step.toolCalls.length > 1 ? "s" : ""}</PhasePill>
              )}
            </StepHeader>

            {reasoning && (
              <ReasoningCard>
                {renderReasoningSummary(showStepThinking, animateStepThinking)}
                <CardContent>{reasoning}</CardContent>
              </ReasoningCard>
            )}

            {text && <MarkdownMessage content={text} />}

            {step.toolCalls.length > 0 && <ToolCallCards mcps={mcps} toolCalls={step.toolCalls} />}
          </StepSection>
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

      {artifacts.length > 0 && <MessageAssets sessionId={sessionId} assets={artifacts} />}

      <MessageFooter>
        <MessageTimestamp>{formatChatTime(finalStep.assistant.timestamp)}</MessageTimestamp>
      </MessageFooter>
    </MessageBubble>
  );
}
