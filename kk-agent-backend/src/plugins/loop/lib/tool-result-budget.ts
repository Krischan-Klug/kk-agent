import { truncateAtLine } from "../../lib/truncate.js";

const PREVIEW_THRESHOLD_CHARS = 12_000;
const PREVIEW_CHARS = 2_400;
const AGGREGATED_CONTEXT_BUDGET = 32_000;

type ResultPolicy = {
  previewThresholdChars?: number;
  previewChars?: number;
  contextBudgetChars?: number;
  excludeFromContextBudget?: boolean;
};

function buildPreview(content: string, previewChars: number): string {
  if (content.length <= previewChars) return content;
  return `${truncateAtLine(content, previewChars)}\n...`;
}

function resolvePreviewChars(policy?: ResultPolicy): number {
  return Math.max(200, policy?.previewChars ?? PREVIEW_CHARS);
}

function boundResult(content: string, policy?: ResultPolicy): string {
  const threshold = Math.max(1, policy?.previewThresholdChars ?? PREVIEW_THRESHOLD_CHARS);
  if (content.length <= threshold) return content;
  return [
    buildPreview(content, resolvePreviewChars(policy)),
    "",
    `[truncated tool result; ${content.length} chars total]`,
  ].join("\n");
}

function resolveContextBudget(results: Array<{ policy?: ResultPolicy }>): number {
  const explicit = results
    .map((result) => result.policy?.contextBudgetChars)
    .filter((value): value is number => typeof value === "number" && value > 0);
  return explicit.length > 0 ? Math.min(...explicit) : AGGREGATED_CONTEXT_BUDGET;
}

export function fitToolResultsToBudget(
  results: Array<{ toolName: string; content: string; policy?: ResultPolicy }>,
): string[] {
  let remaining = resolveContextBudget(results);

  return results.map(({ toolName, content, policy }) => {
    const normalized = content.trim();
    if (!normalized) return `(${toolName} completed with no output)`;
    if (policy?.excludeFromContextBudget) return normalized;

    const bounded = boundResult(normalized, policy);
    if (bounded.length <= remaining) {
      remaining -= bounded.length;
      return bounded;
    }

    const sliceLength = Math.max(400, Math.min(remaining, resolvePreviewChars(policy)));
    remaining = Math.max(0, remaining - sliceLength);
    return [
      buildPreview(bounded, sliceLength),
      "",
      `[truncated to fit tool result budget; ${normalized.length} chars total]`,
    ].join("\n");
  });
}
