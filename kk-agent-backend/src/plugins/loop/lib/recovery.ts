import type { TranscriptMessage } from "../../lib/transcript.js";

function estimateMessageChars(message: TranscriptMessage): number {
  try {
    return JSON.stringify(message).length;
  } catch {
    return 0;
  }
}

export function estimateTranscriptChars(messages: TranscriptMessage[]): number {
  let total = 0;
  for (const message of messages) total += estimateMessageChars(message);
  return total;
}

/**
 * Drops the oldest assistant/user pairs until the transcript is under targetChars.
 * Always preserves the very first user message (which typically carries the
 * original task) and the final (most recent) pair so the model has a clear
 * prompt and an immediate handoff.
 *
 * Returns the trimmed message list and the number of messages removed.
 */
export function snipOldestToolCycles(
  messages: TranscriptMessage[],
  targetChars: number,
): { messages: TranscriptMessage[]; removed: number } {
  if (messages.length <= 3) return { messages, removed: 0 };
  const result = [...messages];
  // Index 0 is the initial user message — preserve it. Drop from index 1 upward.
  // Keep at least the last two messages (assistant + tool_result or user follow-up).
  let removed = 0;
  // Pair-drop: need room for first + pair + last 2 = at least 5 to drop a pair safely.
  while (estimateTranscriptChars(result) > targetChars && result.length >= 5) {
    result.splice(1, 2);
    removed += 2;
  }
  // Single-drop: need first + 1 + last 2 = at least 4.
  while (estimateTranscriptChars(result) > targetChars && result.length >= 4) {
    result.splice(1, 1);
    removed += 1;
  }
  return { messages: result, removed };
}

export const OUTPUT_CONTINUE_INSTRUCTION =
  "Your previous response was truncated because it hit the output token limit. Continue exactly where you stopped. Do not repeat yourself and do not apologize.";

export const PTL_SNIP_NOTICE =
  "Older context was trimmed to recover from a context overflow. Continue the task.";
