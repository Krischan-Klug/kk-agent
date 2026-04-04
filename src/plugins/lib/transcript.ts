import { randomUUID } from "node:crypto";

export type AttachmentCategory = "image" | "text" | "pdf";
export type TranscriptRole = "system" | "user" | "assistant" | "tool";
export type TranscriptStopReason = "stop" | "tool_use" | "length";

export interface TranscriptUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface TranscriptTextBlock {
  type: "text";
  text: string;
}

export interface TranscriptReasoningBlock {
  type: "reasoning";
  text: string;
}

export interface TranscriptToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TranscriptToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface TranscriptAttachmentRefBlock {
  type: "attachment_ref";
  attachmentId?: string;
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  size: number;
  previewDataUrl?: string;
}

export type TranscriptBlock =
  | TranscriptTextBlock
  | TranscriptReasoningBlock
  | TranscriptToolUseBlock
  | TranscriptToolResultBlock
  | TranscriptAttachmentRefBlock;

export interface TranscriptMessage {
  id: string;
  role: TranscriptRole;
  content: TranscriptBlock[];
  timestamp: string;
  requestId?: string;
  stopReason?: TranscriptStopReason;
  isMeta?: boolean;
  isApiError?: boolean;
  usage?: TranscriptUsage;
}

export function createTranscriptMessage(input: {
  role: TranscriptRole;
  content?: TranscriptBlock[];
  requestId?: string;
  stopReason?: TranscriptStopReason;
  isMeta?: boolean;
  isApiError?: boolean;
  usage?: TranscriptUsage;
  timestamp?: string;
  id?: string;
}): TranscriptMessage {
  return {
    id: input.id ?? randomUUID(),
    role: input.role,
    content: input.content ?? [],
    timestamp: input.timestamp ?? new Date().toISOString(),
    requestId: input.requestId,
    stopReason: input.stopReason,
    isMeta: input.isMeta,
    isApiError: input.isApiError,
    usage: input.usage,
  };
}

export function textBlock(text: string): TranscriptTextBlock {
  return { type: "text", text };
}

export function reasoningBlock(text: string): TranscriptReasoningBlock {
  return { type: "reasoning", text };
}

export function toolUseBlock(id: string, name: string, input: Record<string, unknown>): TranscriptToolUseBlock {
  return { type: "tool_use", id, name, input };
}

export function toolResultBlock(toolUseId: string, content: string, isError?: boolean): TranscriptToolResultBlock {
  return { type: "tool_result", tool_use_id: toolUseId, content, ...(isError ? { is_error: true } : {}) };
}

export function attachmentRefBlock(input: {
  attachmentId?: string;
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  size: number;
  previewDataUrl?: string;
}): TranscriptAttachmentRefBlock {
  return { type: "attachment_ref", ...input };
}

export function getMessageText(message: Pick<TranscriptMessage, "content">): string {
  return message.content
    .filter((block): block is TranscriptTextBlock | TranscriptReasoningBlock => block.type === "text" || block.type === "reasoning")
    .map((block) => block.text)
    .join("");
}

export function getMessageReasoning(message: Pick<TranscriptMessage, "content">): string {
  return message.content
    .filter((block): block is TranscriptReasoningBlock => block.type === "reasoning")
    .map((block) => block.text)
    .join("");
}

export function getToolUses(message: Pick<TranscriptMessage, "content">): TranscriptToolUseBlock[] {
  return message.content.filter((block): block is TranscriptToolUseBlock => block.type === "tool_use");
}

export function getToolResults(message: Pick<TranscriptMessage, "content">): TranscriptToolResultBlock[] {
  return message.content.filter((block): block is TranscriptToolResultBlock => block.type === "tool_result");
}

export function hasVisibleAssistantContent(message: Pick<TranscriptMessage, "content">): boolean {
  return message.content.some((block) => {
    if (block.type === "text" || block.type === "reasoning") return block.text.trim().length > 0;
    return block.type === "tool_use";
  });
}

export function normalizeToolResultContent(toolName: string, content: string): string {
  return content.trim().length > 0 ? content : `(${toolName} completed with no output)`;
}

function syntheticInterruptedToolResult(toolUse: TranscriptToolUseBlock): TranscriptMessage {
  return createTranscriptMessage({
    role: "tool",
    content: [toolResultBlock(toolUse.id, `[Tool result missing for ${toolUse.name}; synthetic error inserted]`, true)],
  });
}

export function repairTranscript(messages: TranscriptMessage[]): TranscriptMessage[] {
  const repaired: TranscriptMessage[] = [];
  const seenToolUseIds = new Set<string>();
  const resolvedToolUseIds = new Set<string>();

  for (const original of messages) {
    if (original.role === "assistant") {
      const dedupedContent: TranscriptBlock[] = [];
      for (const block of original.content) {
        if (block.type !== "tool_use") {
          dedupedContent.push(block);
          continue;
        }
        if (seenToolUseIds.has(block.id)) continue;
        seenToolUseIds.add(block.id);
        dedupedContent.push(block);
      }

      repaired.push({
        ...original,
        content: dedupedContent.length > 0 ? dedupedContent : [textBlock("[Assistant turn interrupted]")],
      });
      continue;
    }

    if (original.role === "tool") {
      const dedupedResults = getToolResults(original).filter((block) => {
        if (!seenToolUseIds.has(block.tool_use_id)) return false;
        if (resolvedToolUseIds.has(block.tool_use_id)) return false;
        resolvedToolUseIds.add(block.tool_use_id);
        return true;
      }).map((block) => ({
        ...block,
        content: block.content.trim().length > 0 ? block.content : "[Tool completed with no output]",
      }));

      if (dedupedResults.length === 0) continue;
      repaired.push({
        ...original,
        content: dedupedResults,
      });
      continue;
    }

    repaired.push(original);
  }

  const finalMessages: TranscriptMessage[] = [];
  for (let index = 0; index < repaired.length; index++) {
    const message = repaired[index]!;
    finalMessages.push(message);

    if (message.role !== "assistant") continue;
    const toolUses = getToolUses(message);
    if (toolUses.length === 0) {
      if (!hasVisibleAssistantContent(message)) {
        finalMessages[finalMessages.length - 1] = {
          ...message,
          content: [textBlock("[Assistant turn contained no visible content]")],
        };
      }
      continue;
    }

    let lookahead = index + 1;
    const nextResults = new Set<string>();
    while (lookahead < repaired.length && repaired[lookahead]?.role === "tool") {
      for (const block of getToolResults(repaired[lookahead]!)) {
        nextResults.add(block.tool_use_id);
      }
      lookahead++;
    }

    for (const toolUse of toolUses) {
      if (!nextResults.has(toolUse.id)) {
        finalMessages.push(syntheticInterruptedToolResult(toolUse));
      }
    }
  }

  return finalMessages;
}
