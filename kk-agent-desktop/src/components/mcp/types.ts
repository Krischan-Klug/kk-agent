import type { McpListItem } from "@/types/api";
import { formatMcpServerJson } from "./configJson";

export type EditForm = {
  name: string;
  emoji: string;
  serverJson: string;
  accessScope: "user" | "system";
  basePath: string;
  workingDirectory: string;
  previewThresholdChars: string;
  previewChars: string;
};

export function buildEditForm(mcp: McpListItem): EditForm {
  return {
    name: mcp.name,
    emoji: mcp.emoji ?? "",
    serverJson: formatMcpServerJson(mcp),
    accessScope: mcp.systemConfig?.accessScope ?? "user",
    basePath: mcp.systemConfig?.basePath ?? "",
    workingDirectory: mcp.systemConfig?.workingDirectory ?? "",
    previewThresholdChars: mcp.systemConfig?.resultPolicy?.previewThresholdChars
      ? String(mcp.systemConfig.resultPolicy.previewThresholdChars)
      : "",
    previewChars: mcp.systemConfig?.resultPolicy?.previewChars
      ? String(mcp.systemConfig.resultPolicy.previewChars)
      : "",
  };
}
