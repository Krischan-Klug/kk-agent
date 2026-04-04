import type {
  TranscriptAttachmentRefBlock,
  TranscriptBlock,
  TranscriptReasoningBlock,
  TranscriptTextBlock,
  TranscriptToolResultBlock,
  TranscriptToolUseBlock,
} from "@/types/api";
import type { ActiveToolCall } from "./types";

export function collectText(blocks: TranscriptBlock[]): string {
  return blocks
    .filter((block): block is TranscriptTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function collectReasoning(blocks: TranscriptBlock[]): string {
  return blocks
    .filter((block): block is TranscriptReasoningBlock => block.type === "reasoning")
    .map((block) => block.text)
    .join("");
}

export function collectAttachments(blocks: TranscriptBlock[]): TranscriptAttachmentRefBlock[] {
  return blocks.filter((block): block is TranscriptAttachmentRefBlock => block.type === "attachment_ref");
}

export function collectToolUses(blocks: TranscriptBlock[]): TranscriptToolUseBlock[] {
  return blocks.filter((block): block is TranscriptToolUseBlock => block.type === "tool_use");
}

export function collectToolResults(blocks: TranscriptBlock[]): TranscriptToolResultBlock[] {
  return blocks.filter((block): block is TranscriptToolResultBlock => block.type === "tool_result");
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
      ...(result ? { result } : {}),
    };
  });
}
