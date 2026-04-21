import type { SystemMcpConfig, SystemMcpKey, ToolResultPolicy } from "../../mcp/types.js";
import { resolveFilesystemSystemConfig, resolveTerminalSystemConfig } from "./access-paths.js";

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

export function normalizeSystemConfig(key: SystemMcpKey, systemConfig?: SystemMcpConfig): SystemMcpConfig | undefined {
  if (!systemConfig) return systemConfig;

  const resolved =
    key === "filesystem"
      ? resolveFilesystemSystemConfig(systemConfig)
      : key === "terminal"
        ? resolveTerminalSystemConfig(systemConfig)
        : { ...systemConfig };

  const resultPolicy = normalizeResultPolicy(resolved.resultPolicy);
  const { resultPolicy: _ignored, ...rest } = resolved;
  return resultPolicy ? { ...rest, resultPolicy } : rest;
}
