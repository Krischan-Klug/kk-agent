import Badge from "@/components/Badge";
import Spinner from "@/components/Spinner";
import SkillIcon from "@/components/SkillIcon";
import type { ReactNode } from "react";
import type { McpListItem } from "@/types/api";
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
  mcps: McpListItem[];
  toolCalls: ActiveToolCall[];
};

function getToolIcon(mcps: McpListItem[], toolName: string): ReactNode {
  for (const mcp of mcps) {
    if (mcp.tools.some((tool) => tool.name === toolName)) {
      return mcp.id === "skill" ? <SkillIcon /> : mcp.emoji || "\u{1F6E0}\uFE0F";
    }
  }
  return "\u{1F6E0}\uFE0F";
}

export default function ToolCallCards({ mcps, toolCalls }: Props) {
  return toolCalls.map((toolCall) => {
    const metadataSummary = getToolCardMetadataSummary(toolCall);
    const metadataDetails = renderToolCardBody(toolCall);
    const shellName = toolCall.name === "Terminal" && typeof toolCall.metadata?.shellDisplayName === "string"
      ? toolCall.metadata.shellDisplayName
      : undefined;
    return (
      <ToolCard key={toolCall.id}>
        <CardSummary>
          <ToolEmoji>{getToolIcon(mcps, toolCall.name)}</ToolEmoji>
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
