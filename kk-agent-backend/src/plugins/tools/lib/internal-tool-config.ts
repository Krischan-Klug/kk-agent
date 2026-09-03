import type { InternalToolConfig, ToolResultPolicy } from "../types.js";

function normalizeResultPolicy(resultPolicy?: ToolResultPolicy): ToolResultPolicy | undefined {
  if (!resultPolicy) return undefined;

  const previewThresholdChars =
    typeof resultPolicy.previewThresholdChars === "number" ? Math.max(1, resultPolicy.previewThresholdChars) : undefined;
  const previewChars =
    typeof resultPolicy.previewChars === "number" ? Math.max(200, resultPolicy.previewChars) : undefined;

  if (previewThresholdChars === undefined && previewChars === undefined) return undefined;

  return {
    ...(previewThresholdChars !== undefined ? { previewThresholdChars } : {}),
    ...(previewChars !== undefined ? { previewChars } : {}),
  };
}

export function normalizeInternalToolConfig(config?: InternalToolConfig): InternalToolConfig | undefined {
  if (!config) return config;

  const resultPolicy = normalizeResultPolicy(config.resultPolicy);
  return resultPolicy ? { resultPolicy } : undefined;
}
