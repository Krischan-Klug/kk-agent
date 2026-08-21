import type { SystemMcpConfig, SystemMcpKey, ToolResultPolicy } from "../../mcp/types.js";

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

export function normalizeSystemConfig(_key: SystemMcpKey, systemConfig?: SystemMcpConfig): SystemMcpConfig | undefined {
  if (!systemConfig) return systemConfig;

  const resultPolicy = normalizeResultPolicy(systemConfig.resultPolicy);
  return resultPolicy ? { resultPolicy } : undefined;
}
