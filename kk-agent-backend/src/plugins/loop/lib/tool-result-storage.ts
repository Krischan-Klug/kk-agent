import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getStateDirPath } from "../../lib/state.js";
import { truncateAtLine } from "../../lib/truncate.js";

const TOOL_RESULT_DIR = getStateDirPath("tool-results");
// Above this limit, tool output is persisted to disk and only a preview is sent to the model.
const PREVIEW_THRESHOLD_CHARS = 12_000;
// How many chars of a large result to keep inline as the preview.
const PREVIEW_CHARS = 2_400;
// Total char budget across all tool results in a single iteration before truncation kicks in.
const AGGREGATED_CONTEXT_BUDGET = 32_000;

type ResultPolicy = {
  previewThresholdChars?: number;
  previewChars?: number;
  contextBudgetChars?: number;
  persistLargeResults?: boolean;
  excludeFromContextBudget?: boolean;
};

function buildPreview(content: string, previewChars: number): string {
  if (content.length <= previewChars) return content;
  return `${truncateAtLine(content, previewChars)}\n...`;
}

function resolvePreviewThreshold(policy?: ResultPolicy): number {
  return Math.max(1, policy?.previewThresholdChars ?? PREVIEW_THRESHOLD_CHARS);
}

function resolvePreviewChars(policy?: ResultPolicy): number {
  return Math.max(200, policy?.previewChars ?? PREVIEW_CHARS);
}

function resolveContextBudget(results: Array<{ policy?: ResultPolicy }>): number {
  const explicit = results
    .map((result) => result.policy?.contextBudgetChars)
    .filter((value): value is number => typeof value === "number" && value > 0);
  return explicit.length > 0 ? Math.min(...explicit) : AGGREGATED_CONTEXT_BUDGET;
}

export async function persistLargeToolResult(
  toolUseId: string,
  toolName: string,
  content: string,
  policy?: ResultPolicy,
): Promise<string> {
  const normalized = content.trim();
  if (!normalized) return content;
  // Self-bounded read-style tools must never be re-persisted. Writing them to a file
  // just so the model reads that file back through the same tool is circular.
  if (policy?.persistLargeResults === false) return normalized;
  const previewThresholdChars = resolvePreviewThreshold(policy);
  const previewChars = resolvePreviewChars(policy);
  if (normalized.length <= previewThresholdChars) return normalized;

  await mkdir(TOOL_RESULT_DIR, { recursive: true });
  const filename = `${toolUseId}.txt`;
  const storedPath = join(TOOL_RESULT_DIR, filename);
  await writeFile(storedPath, normalized, "utf-8");

  return [
    buildPreview(normalized, previewChars),
    "",
    `[stored full ${toolName} result in ${storedPath}; ${normalized.length} chars total]`,
  ].join("\n");
}

export function fitToolResultsToBudget(results: Array<{ toolName: string; content: string; policy?: ResultPolicy }>): string[] {
  let remaining = resolveContextBudget(results);

  return results.map(({ toolName, content, policy }) => {
    const normalized = content.trim();
    if (!normalized) return `(${toolName} completed with no output)`;
    if (policy?.excludeFromContextBudget) return normalized;
    if (normalized.length <= remaining) {
      remaining -= normalized.length;
      return normalized;
    }

    const sliceLength = Math.max(400, Math.min(remaining, resolvePreviewChars(policy)));
    remaining = Math.max(0, remaining - sliceLength);
    return [
      buildPreview(normalized, sliceLength),
      "",
      `[truncated to fit tool result budget; ${normalized.length} chars total]`,
    ].join("\n");
  });
}
