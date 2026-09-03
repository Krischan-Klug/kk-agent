import Badge from "@/components/Badge";
import Spinner from "@/components/Spinner";
import SkillIcon from "@/components/SkillIcon";
import type { ReactNode } from "react";
import type { RuntimeCapability } from "@/types/api";
import type { ActiveToolCall } from "./types";
import { getToolCardMetadataSummary, renderToolCardBody } from "./toolCardRenderers";
import {
  CardContent,
  CardSummary,
  ToolBlockLabel,
  ToolCard,
  ToolContentSection,
  ToolDisplayText,
  ToolEmoji,
  ToolLabel,
  ToolResultBlock,
} from "./ChatMessages.styled";

type Props = {
  capabilities: RuntimeCapability[];
  toolCalls: ActiveToolCall[];
};

function getToolIcon(capabilities: RuntimeCapability[], toolName: string): ReactNode {
  for (const capability of capabilities) {
    if (capability.tools.some((tool) => tool.name === toolName)) {
      return capability.id === "skill" ? <SkillIcon /> : capability.emoji || "\u{1F6E0}\uFE0F";
    }
  }
  return "\u{1F6E0}\uFE0F";
}

export default function ToolCallCards({ capabilities, toolCalls }: Props) {
  return toolCalls.map((toolCall) => {
    const metadataSummary = getToolCardMetadataSummary(toolCall);
    const metadataDetails = renderToolCardBody(toolCall);
    const shellName = toolCall.name === "Terminal" && typeof toolCall.metadata?.shellDisplayName === "string"
      ? toolCall.metadata.shellDisplayName
      : undefined;
    return (
      <ToolCard key={toolCall.id}>
        <CardSummary>
          <ToolEmoji>{getToolIcon(capabilities, toolCall.name)}</ToolEmoji>
          <ToolLabel>{shellName ? `${toolCall.name} · ${shellName}` : toolCall.name}</ToolLabel>
          {toolCall.displayText && <ToolDisplayText>{toolCall.displayText}</ToolDisplayText>}
          {toolCall.status === "queued" || toolCall.status === "executing" || toolCall.status === "yielded" ? (
            <>
              <Spinner size={12} />
              <Badge variant="info">{toolCall.status === "yielded" ? "processing" : toolCall.status}</Badge>
            </>
          ) : toolCall.status === "discarded" || toolCall.status === "invalid" ? (
            <Badge variant="warning">{toolCall.status}</Badge>
          ) : toolCall.result ? (
            <Badge variant={toolCall.result.isError ? "danger" : "success"}>
              {toolCall.result.isError ? "Failed" : "Fertig"}
            </Badge>
          ) : (
            <Badge variant="info">{toolCall.status}</Badge>
          )}
        </CardSummary>
        <CardContent>
          {metadataSummary && (
            <ToolContentSection>
              <ToolBlockLabel>Details:</ToolBlockLabel>
              {metadataSummary}
            </ToolContentSection>
          )}
          {toolCall.summary && (
            <ToolContentSection>
              <ToolBlockLabel>Summary:</ToolBlockLabel>
              {toolCall.summary}
            </ToolContentSection>
          )}
          {toolCall.detail && (
            <ToolContentSection>
              <ToolBlockLabel>Status:</ToolBlockLabel>
              {toolCall.detail}
            </ToolContentSection>
          )}
          {metadataDetails && (
            <ToolContentSection>
              <ToolBlockLabel>Metadata:</ToolBlockLabel>
              {metadataDetails}
            </ToolContentSection>
          )}
          <ToolContentSection>
            <ToolBlockLabel>Arguments:</ToolBlockLabel>
            {JSON.stringify(toolCall.input, null, 2)}
          </ToolContentSection>
          {toolCall.result && (
            <ToolResultBlock $isError={toolCall.result.isError}>
              <ToolBlockLabel>Result:</ToolBlockLabel>
              {toolCall.result.content}
            </ToolResultBlock>
          )}
        </CardContent>
      </ToolCard>
    );
  });
}
