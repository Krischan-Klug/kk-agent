import type {
  ModelCapabilities,
  ModelInputModality,
  NumericRange,
} from "./provider.js";
import type { ReasoningEffort } from "./common.js";

export const CANONICAL_REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh"] as const;

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (CANONICAL_REASONING_EFFORTS as readonly string[]).includes(value);
}

export function normalizeCanonicalReasoningLevel(effort?: string): ReasoningEffort | undefined {
  if (!effort) return undefined;
  return isReasoningEffort(effort) ? effort : undefined;
}

export function getReasoningLevels(capabilities?: ModelCapabilities): ReasoningEffort[] {
  const declared = capabilities?.reasoning.allowedEfforts ?? [];
  const normalized = declared
    .map((effort) => normalizeCanonicalReasoningLevel(effort))
    .filter((effort): effort is ReasoningEffort => Boolean(effort));
  return [...new Set(normalized)];
}

export function supportsInputModality(
  capabilities: ModelCapabilities | undefined,
  modality: ModelInputModality,
): boolean {
  return capabilities?.inputModalities.includes(modality) === true;
}

export function clampNumber(value: number | undefined, range?: NumericRange): number | undefined {
  if (value === undefined) return undefined;
  if (!range) return value;
  const bounded = Math.min(range.max, Math.max(range.min, value));
  if (!range.step || range.step <= 0) return bounded;
  const steps = Math.round((bounded - range.min) / range.step);
  return Number((range.min + steps * range.step).toFixed(6));
}
