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
  metadata?: Record<string, unknown>;
}

export interface TranscriptAssetRefBlock {
  type: "asset_ref";
  assetId: string;
}

export type TranscriptBlock =
  | TranscriptTextBlock
  | TranscriptReasoningBlock
  | TranscriptToolUseBlock
  | TranscriptToolResultBlock
  | TranscriptAssetRefBlock;

export interface TranscriptMessage {
  id: string;
  role: TranscriptRole;
  content: TranscriptBlock[];
  timestamp: string;
  requestId?: string;
  stopReason?: TranscriptStopReason;
  usage?: TranscriptUsage;
}

export type ToolExecutionStatus =
  | "queued"
  | "executing"
  | "yielded"
  | "completed"
  | "error"
  | "discarded"
  | "invalid";

export type RuntimeToolSource = "internal" | "mcp";

export interface RunToolCallStats {
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
  byTool: Array<{
    name: string;
    total: number;
    succeeded: number;
    failed: number;
    pending: number;
  }>;
}

function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTranscriptMessage(input: {
  role: TranscriptRole;
  content?: TranscriptBlock[];
  requestId?: string;
  stopReason?: TranscriptStopReason;
  usage?: TranscriptUsage;
  timestamp?: string;
  id?: string;
}): TranscriptMessage {
  return {
    id: input.id ?? generateId(),
    role: input.role,
    content: input.content ?? [],
    timestamp: input.timestamp ?? new Date().toISOString(),
    requestId: input.requestId,
    stopReason: input.stopReason,
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

export function toolResultBlock(
  toolUseId: string,
  content: string,
  isError?: boolean,
  metadata?: Record<string, unknown>,
): TranscriptToolResultBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    ...(isError ? { is_error: true } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export function assetRefBlock(assetId: string): TranscriptAssetRefBlock {
  return { type: "asset_ref", assetId };
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

export function getAssetRefs(message: Pick<TranscriptMessage, "content">): TranscriptAssetRefBlock[] {
  return message.content.filter((block): block is TranscriptAssetRefBlock => block.type === "asset_ref");
}

export function collectText(blocks: TranscriptBlock[]): string {
  return getMessageText({ content: blocks });
}

export function collectReasoning(blocks: TranscriptBlock[]): string {
  return getMessageReasoning({ content: blocks });
}

export function collectToolUses(blocks: TranscriptBlock[]): TranscriptToolUseBlock[] {
  return getToolUses({ content: blocks });
}

export function collectToolResults(blocks: TranscriptBlock[]): TranscriptToolResultBlock[] {
  return getToolResults({ content: blocks });
}

export function collectAssetRefs(blocks: TranscriptBlock[]): TranscriptAssetRefBlock[] {
  return getAssetRefs({ content: blocks });
}

export function summarizeRunToolCalls(
  messages: TranscriptMessage[],
  userMessageId: string,
): RunToolCallStats | null {
  const start = messages.findIndex((message) => message.id === userMessageId && message.role === "user");
  if (start < 0) return null;

  const nextUserOffset = messages.slice(start + 1).findIndex((message) => message.role === "user");
  const end = nextUserOffset < 0 ? messages.length : start + 1 + nextUserOffset;
  const runMessages = messages.slice(start + 1, end);
  const uses = runMessages.flatMap((message) => getToolUses(message));
  const results = new Map(runMessages.flatMap((message) => getToolResults(message)
    .map((block) => [block.tool_use_id, block] as const)));
  const byTool = new Map<string, RunToolCallStats["byTool"][number]>();
  let succeeded = 0;
  let failed = 0;
  let pending = 0;

  for (const use of uses) {
    const aggregate = byTool.get(use.name) ?? {
      name: use.name,
      total: 0,
      succeeded: 0,
      failed: 0,
      pending: 0,
    };
    aggregate.total += 1;
    const result = results.get(use.id);
    if (!result) {
      aggregate.pending += 1;
      pending += 1;
    } else if (result.is_error) {
      aggregate.failed += 1;
      failed += 1;
    } else {
      aggregate.succeeded += 1;
      succeeded += 1;
    }
    byTool.set(use.name, aggregate);
  }

  return {
    total: uses.length,
    succeeded,
    failed,
    pending,
    byTool: [...byTool.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function hasVisibleAssistantContent(message: Pick<TranscriptMessage, "content">): boolean {
  return message.content.some((block) => {
    if (block.type === "text") return block.text.trim().length > 0;
    return block.type === "tool_use";
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
