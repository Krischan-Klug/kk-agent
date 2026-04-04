const DEFAULT_READ_RESULT_MAX_CHARS = 8_000;

function buildTruncatedPreview(content: string, maxChars: number): string {
  const truncated = content.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = lastNewline > Math.floor(maxChars * 0.5) ? lastNewline : maxChars;
  return content.slice(0, cutPoint);
}

export function truncateSelfBoundedReadOutput(content: string, maxChars = DEFAULT_READ_RESULT_MAX_CHARS): string {
  if (content.length <= maxChars) return content;

  return [
    buildTruncatedPreview(content, maxChars),
    "...",
    "",
    `[output truncated to stay within read tool limit; ${content.length} chars total. Narrow the read with offset and limit.]`,
  ].join("\n");
}

export { DEFAULT_READ_RESULT_MAX_CHARS };
