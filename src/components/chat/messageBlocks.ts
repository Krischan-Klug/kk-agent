import type { TranscriptToolUseBlock } from "@/types/api";
import type { ActiveToolCall } from "./types";

export {
  collectAttachments,
  collectReasoning,
  collectText,
  collectToolResults,
  collectToolUses,
} from "kk-agent-contract";

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
      ...(result ? { result } : {}),
    };
  });
}
