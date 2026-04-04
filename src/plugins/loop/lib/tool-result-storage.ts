import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { STATE_DIR } from "../../lib/state.js";

const TOOL_RESULT_DIR = join(STATE_DIR, "tool-results");
const PREVIEW_THRESHOLD_CHARS = 12_000;
const PREVIEW_CHARS = 2_400;
const AGGREGATED_CONTEXT_BUDGET = 32_000;

function buildPreview(content: string, previewChars: number): string {
  if (content.length <= previewChars) return content;
  const truncated = content.slice(0, previewChars);
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = lastNewline > Math.floor(previewChars * 0.5) ? lastNewline : previewChars;
  return `${content.slice(0, cutPoint)}\n...`;
}

export async function persistLargeToolResult(toolUseId: string, toolName: string, content: string): Promise<string> {
  const normalized = content.trim();
  if (!normalized) return content;
  if (normalized.length <= PREVIEW_THRESHOLD_CHARS) return normalized;

  await mkdir(TOOL_RESULT_DIR, { recursive: true });
  const filename = `${toolUseId}.txt`;
  await writeFile(join(TOOL_RESULT_DIR, filename), normalized, "utf-8");

  return [
    buildPreview(normalized, PREVIEW_CHARS),
    "",
    `[stored full ${toolName} result in state/tool-results/${filename}; ${normalized.length} chars total]`,
  ].join("\n");
}

export function fitToolResultsToBudget(results: Array<{ toolName: string; content: string }>): string[] {
  let remaining = AGGREGATED_CONTEXT_BUDGET;

  return results.map(({ toolName, content }) => {
    const normalized = content.trim();
    if (!normalized) return `(${toolName} completed with no output)`;
    if (normalized.length <= remaining) {
      remaining -= normalized.length;
      return normalized;
    }

    const sliceLength = Math.max(400, Math.min(remaining, PREVIEW_CHARS));
    remaining = Math.max(0, remaining - sliceLength);
    return [
      buildPreview(normalized, sliceLength),
      "",
      `[truncated to fit tool result budget; ${normalized.length} chars total]`,
    ].join("\n");
  });
}

