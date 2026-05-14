import type { TranscriptToolUseBlock } from "@/types/api";
import type { ActiveToolCall } from "./types";

export {
  collectAttachments,
  collectReasoning,
  collectText,
  collectToolResults,
  collectToolUses,
} from "kk-agent-contract";

export function getToolCallDisplayText(input: Record<string, unknown>): string | undefined {
  const value = input.tool_call_description;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return undefined;
}

export function buildToolCards(
  toolUses: TranscriptToolUseBlock[],
  toolResults = new Map<string, { content: string; isError: boolean }>(),
): ActiveToolCall[] {
  return toolUses.map((toolUse) => {
    const result = toolResults.get(toolUse.id);
    return {
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
      status: result ? (result.isError ? "error" : "completed") : "queued",
      displayText: getToolCallDisplayText(toolUse.input),
      ...(result ? { result } : {}),
    };
  });
}
