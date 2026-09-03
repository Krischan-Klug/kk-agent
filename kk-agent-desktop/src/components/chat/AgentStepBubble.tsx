import Badge from "@/components/Badge";
import MarkdownMessage from "@/components/MarkdownMessage";
import type { AssetMeta } from "kk-agent-contract";
import type { RuntimeCapability } from "@/types/runtime";
import MessageAssets from "./MessageAssets";
import ToolCallCards from "./ToolCallCards";
import { collectReasoning, collectText } from "./messageBlocks";
import {
  CardContent,
  MessageBubble,
  MessageFooter,
  MessageTimestamp,
  ReasoningCard,
  ReasoningSummary,
  RoleLabel,
  StreamingDot,
  ThinkingLabel,
  ThinkingSuffix,
} from "./ChatMessages.styled";
import type { AgentStepView } from "./types";

type Props = {
  sessionId: string;
  currentAgentName: string;
  capabilities: RuntimeCapability[];
  step: AgentStepView;
  streaming?: boolean;
  artifacts?: AssetMeta[];
};

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

export default function AgentStepBubble({
  sessionId,
  currentAgentName,
  capabilities,
  step,
  streaming = false,
  artifacts = [],
}: Props) {
  const reasoning = collectReasoning(step.assistant.content).trim();
  const text = collectText(step.assistant.content).trim();
  const showThinking = streaming && reasoning.length > 0;
  const animateThinking = showThinking && text.length === 0;

  return (
    <MessageBubble $role="assistant">
      <RoleLabel>
        <Badge variant="info">{currentAgentName}</Badge>
        {streaming && <StreamingDot />}
      </RoleLabel>

      {reasoning && (
        <ReasoningCard>
          {renderReasoningSummary(showThinking, animateThinking)}
          <CardContent>{reasoning}</CardContent>
        </ReasoningCard>
      )}

      {text && <MarkdownMessage content={text} />}

      {step.toolCalls.length > 0 && <ToolCallCards capabilities={capabilities} toolCalls={step.toolCalls} />}

      {artifacts.length > 0 && <MessageAssets sessionId={sessionId} assets={artifacts} />}

      <MessageFooter>
        <MessageTimestamp>{formatChatTime(step.assistant.timestamp)}</MessageTimestamp>
      </MessageFooter>
    </MessageBubble>
  );
}
