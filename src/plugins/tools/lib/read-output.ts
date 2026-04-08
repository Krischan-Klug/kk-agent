import { truncateAtLine } from "../../lib/truncate.js";

const DEFAULT_READ_RESULT_MAX_CHARS = 8_000;

export function truncateSelfBoundedReadOutput(content: string, maxChars = DEFAULT_READ_RESULT_MAX_CHARS): string {
  if (content.length <= maxChars) return content;

  return [
    truncateAtLine(content, maxChars),
    "...",
    "",
    `[output truncated to stay within read tool limit; ${content.length} chars total. Narrow the read with offset and limit.]`,
  ].join("\n");
}

export { DEFAULT_READ_RESULT_MAX_CHARS };
