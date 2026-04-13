import { randomUUID } from "node:crypto";

export type AttachmentCategory = "image" | "text" | "pdf";
export type AttachmentSource = "user" | "assistant";
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
  source: AttachmentSource;
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
  source: AttachmentSource;
  size: number;
  previewDataUrl?: string;
}): TranscriptAttachmentRefBlock {
  return { type: "attachment_ref", ...input };
}

export function getMessageText(message: Pick<TranscriptMessage, "content">): string {
  return message.content
    .filter((block): block is TranscriptTextBlock => block.type === "text")
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
    if (block.type === "text") return block.text.trim().length > 0;
    return block.type === "tool_use" || block.type === "attachment_ref";
  });
}

export function normalizeToolResultContent(toolName: string, content: string): string {
  return content.trim().length > 0 ? content : `(${toolName} completed with no output)`;
}

function syntheticInterruptedToolResults(toolUses: TranscriptToolUseBlock[]): TranscriptMessage {
  return createTranscriptMessage({
    role: "tool",
    content: toolUses.map((toolUse) => toolResultBlock(
      toolUse.id,
      `[Tool result missing for ${toolUse.name}; synthetic error inserted]`,
      true,
    )),
  });
}

export function repairTranscript(messages: TranscriptMessage[]): TranscriptMessage[] {
  const repaired: TranscriptMessage[] = [];
  const seenToolUseIds = new Set<string>();
  const resolvedToolUseIds = new Set<string>();
  const toolNameById = new Map<string, string>();

  for (const original of messages) {
    if (original.role === "assistant") {
      const dedupedContent: TranscriptBlock[] = [];
      let removedToolUse = false;
      for (const block of original.content) {
        if (block.type !== "tool_use") {
          dedupedContent.push(block);
          continue;
        }
        if (seenToolUseIds.has(block.id)) {
          removedToolUse = true;
          continue;
        }
        seenToolUseIds.add(block.id);
        toolNameById.set(block.id, block.name);
        dedupedContent.push(block);
      }

      repaired.push({
        ...original,
        content: dedupedContent.length > 0
          ? dedupedContent
          : [textBlock(original.content.length === 0
            ? "[Assistant turn contained no visible content]"
            : removedToolUse
              ? "[Assistant turn interrupted]"
              : "[Assistant turn contained no visible content]")],
      });
      continue;
    }

    if (original.role === "tool") {
      const dedupedResults = getToolResults(original)
        .filter((block) => {
          if (!seenToolUseIds.has(block.tool_use_id)) return false;
          if (resolvedToolUseIds.has(block.tool_use_id)) return false;
          resolvedToolUseIds.add(block.tool_use_id);
          return true;
        })
        .map((block) => ({
          ...block,
          content: normalizeToolResultContent(toolNameById.get(block.tool_use_id) ?? "tool", block.content),
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
  for (let index = 0; index < repaired.length;) {
    const message = repaired[index]!;

    if (message.role !== "assistant") {
      finalMessages.push(message);
      index++;
      continue;
    }

    const toolUses = getToolUses(message);
    if (toolUses.length === 0) {
      finalMessages.push(
        hasVisibleAssistantContent(message)
          ? message
          : { ...message, content: [textBlock("[Assistant turn contained no visible content]")] },
      );
      index++;
      continue;
    }

    let lookahead = index + 1;
    const contiguousToolMessages: TranscriptMessage[] = [];
    const nextResults = new Set<string>();
    while (lookahead < repaired.length && repaired[lookahead]?.role === "tool") {
      const nextMessage = repaired[lookahead]!;
      contiguousToolMessages.push(nextMessage);
      for (const block of getToolResults(nextMessage)) {
        nextResults.add(block.tool_use_id);
      }
      lookahead++;
    }

    const missingToolUses = toolUses.filter((toolUse) => !nextResults.has(toolUse.id));
    finalMessages.push(message);

    if (contiguousToolMessages.length === 0) {
      if (missingToolUses.length > 0) {
        finalMessages.push(syntheticInterruptedToolResults(missingToolUses));
      }
      index = lookahead;
      continue;
    }

    if (missingToolUses.length > 0) {
      const [firstToolMessage, ...restToolMessages] = contiguousToolMessages;
      finalMessages.push({
        ...firstToolMessage!,
        content: [
          ...getToolResults(syntheticInterruptedToolResults(missingToolUses)),
          ...getToolResults(firstToolMessage!),
        ],
      });
      finalMessages.push(...restToolMessages);
      index = lookahead;
      continue;
    }

    finalMessages.push(...contiguousToolMessages);
    index = lookahead;
  }

  return finalMessages;
}
