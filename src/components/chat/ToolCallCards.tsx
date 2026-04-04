import Badge from "@/components/Badge";
import Spinner from "@/components/Spinner";
import type { McpListItem } from "@/types/api";
import type { ActiveToolCall } from "./types";
import {
  CardContent,
  CardSummary,
  ToolBlockLabel,
  ToolCard,
  ToolEmoji,
  ToolLabel,
  ToolResultBlock,
} from "./ChatMessages.styled";

type Props = {
  mcps: McpListItem[];
  toolCalls: ActiveToolCall[];
};

function getToolEmoji(mcps: McpListItem[], toolName: string): string {
  for (const mcp of mcps) {
    if (mcp.tools.some((tool) => tool.name === toolName)) return mcp.emoji || "\u{1F6E0}\uFE0F";
  }
  return "\u{1F6E0}\uFE0F";
}

export default function ToolCallCards({ mcps, toolCalls }: Props) {
  return toolCalls.map((toolCall) => (
    <ToolCard key={toolCall.id}>
      <CardSummary>
        <ToolEmoji>{getToolEmoji(mcps, toolCall.name)}</ToolEmoji>
        <ToolLabel>{toolCall.name}</ToolLabel>
        {toolCall.status === "queued" || toolCall.status === "executing" ? (
          <>
            <Spinner size={12} />
            <Badge variant="info">{toolCall.status}</Badge>
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
        {toolCall.summary && (
          <>
            <ToolBlockLabel>Summary:</ToolBlockLabel>
            {toolCall.summary}
          </>
        )}
        {toolCall.detail && (
          <>
            <ToolBlockLabel>Status:</ToolBlockLabel>
            {toolCall.detail}
          </>
        )}
        <ToolBlockLabel>Arguments:</ToolBlockLabel>
        {JSON.stringify(toolCall.input, null, 2)}
        {toolCall.result && (
          <ToolResultBlock $isError={toolCall.result.isError}>
            <ToolBlockLabel>Result:</ToolBlockLabel>
            {toolCall.result.content}
          </ToolResultBlock>
        )}
      </CardContent>
    </ToolCard>
  ));
}
