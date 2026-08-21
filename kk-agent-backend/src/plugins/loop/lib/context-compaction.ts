import {
  createTranscriptMessage,
  textBlock,
  type SessionContextState,
  type SessionContextUsage,
  type TranscriptMessage,
} from "kk-agent-contract";

const ABSOLUTE_COMPACTION_MAX_OUTPUT_TOKENS = 6_000;
export const MAX_AUTO_COMPACTION_FAILURES = 3;

export const COMPACTION_INSTRUCTIONS = `<context_compaction>
Create a dense, self-contained continuation summary of the conversation supplied below.

Preserve everything required to continue the work correctly:
- the user's current goal, requirements, constraints, and preferences;
- decisions already made and the reasoning that still matters;
- completed work, current state, pending work, and the next concrete steps;
- exact file paths, identifiers, commands, errors, test results, and important code details;
- unresolved questions, blockers, failed approaches, and safety constraints.

Do not continue the task, call tools, address the user, or add commentary. Omit obsolete repetition and raw tool chatter unless its result is still relevant. Return only the continuation summary in concise Markdown.
</context_compaction>`;

function finiteTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function estimateTextTokens(value: string): number {
  return value.length === 0 ? 0 : Math.ceil(value.length / 4);
}

export function estimateMessagesTokens(messages: TranscriptMessage[]): number {
  let chars = 0;
  let binaryReferences = 0;
  for (const message of messages) {
    chars += message.role.length + message.id.length + 16;
    for (const block of message.content) {
      if (block.type === "text" || block.type === "reasoning") chars += block.text.length;
      else if (block.type === "tool_use") chars += block.name.length + JSON.stringify(block.input).length + 24;
      else if (block.type === "tool_result") chars += block.content.length + block.tool_use_id.length + 24;
      else binaryReferences += 1;
    }
  }
  return Math.ceil(chars / 4) + (binaryReferences * 1_024);
}

export function getCompactionReserveTokens(limitTokens: number): number {
  const limit = finiteTokenCount(limitTokens);
  if (limit === 0) return 0;
  const desired = Math.max(8_000, Math.ceil(limit * 0.1));
  return Math.min(desired, Math.max(1, Math.floor(limit * 0.25)));
}

export function getCompactionThresholdTokens(limitTokens: number): number {
  const limit = finiteTokenCount(limitTokens);
  return Math.max(0, limit - getCompactionReserveTokens(limit));
}

export function getCompactionMaxOutputTokens(limitTokens: number): number {
  const reserve = getCompactionReserveTokens(limitTokens);
  return Math.min(
    ABSOLUTE_COMPACTION_MAX_OUTPUT_TOKENS,
    Math.max(1_000, Math.floor(reserve / 2)),
  );
}

export function shouldCompactContext(usedTokens: number, limitTokens: number): boolean {
  const limit = finiteTokenCount(limitTokens);
  return limit > 0 && finiteTokenCount(usedTokens) >= getCompactionThresholdTokens(limit);
}

export function projectContextMessages(
  messages: TranscriptMessage[],
  contextState: SessionContextState,
): TranscriptMessage[] {
  const compaction = contextState.activeCompaction;
  if (!compaction) return structuredClone(messages);
  const boundaryIndex = messages.findIndex((message) => message.id === compaction.throughMessageId);
  if (boundaryIndex < 0) return structuredClone(messages);
  const summaryMessage = createTranscriptMessage({
    id: `context-summary-${compaction.id}`,
    role: "user",
    timestamp: compaction.createdAt,
    content: [textBlock(`<context_summary>\n${compaction.summary.trim()}\n</context_summary>`)],
  });
  return [summaryMessage, ...structuredClone(messages.slice(boundaryIndex + 1))];
}

export function measureContextUsage(input: {
  messages: TranscriptMessage[];
  limitTokens: number;
  estimatedFixedTokens?: number;
  timestamp?: string;
}): SessionContextUsage {
  const limitTokens = finiteTokenCount(input.limitTokens);
  let latestUsageIndex = -1;
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    if (input.messages[index]?.usage) {
      latestUsageIndex = index;
      break;
    }
  }

  const latestUsage = latestUsageIndex >= 0 ? input.messages[latestUsageIndex]?.usage : undefined;
  const inputTokens = finiteTokenCount(latestUsage?.inputTokens);
  const outputTokens = finiteTokenCount(latestUsage?.outputTokens);
  const reasoningTokens = finiteTokenCount(latestUsage?.reasoningTokens);
  const estimatedTokens = finiteTokenCount(input.estimatedFixedTokens) + estimateMessagesTokens(input.messages);
  const usedTokens = latestUsage
    ? Math.max(
        inputTokens + outputTokens + estimateMessagesTokens(input.messages.slice(latestUsageIndex + 1)),
        estimatedTokens,
      )
    : estimatedTokens;

  return {
    limitTokens,
    inputTokens: latestUsage ? inputTokens : usedTokens,
    outputTokens,
    reasoningTokens,
    usedTokens,
    remainingTokens: Math.max(0, limitTokens - usedTokens),
    source: latestUsage ? "provider" : "estimated",
    updatedAt: input.timestamp ?? new Date().toISOString(),
  };
}
