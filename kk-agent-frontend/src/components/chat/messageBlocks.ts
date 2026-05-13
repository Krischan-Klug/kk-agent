import type { TranscriptToolUseBlock } from "@/types/api";
import type { ActiveToolCall } from "./types";

export {
  collectAttachments,
  collectReasoning,
  collectText,
  collectToolResults,
  collectToolUses,
} from "@krischan-klug/kk-agent-contract";

export function getToolCallDisplayText(input: Record<string, unknown>): string | undefined {
  const description = input.description;
  if (typeof description !== "string") return undefined;
  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
