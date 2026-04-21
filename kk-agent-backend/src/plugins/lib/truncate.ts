/**
 * Truncate content at a clean line boundary within maxChars.
 * If the content is shorter than maxChars, it is returned unchanged.
 */
export function truncateAtLine(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const truncated = content.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = lastNewline > Math.floor(maxChars * 0.5) ? lastNewline : maxChars;
  return content.slice(0, cutPoint);
}
