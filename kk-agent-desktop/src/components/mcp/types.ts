import type { McpListItem } from "@/types/api";
import { formatMcpServerJson } from "./configJson";

export type EditForm = {
  name: string;
  emoji: string;
  serverJson: string;
  previewThresholdChars: string;
  previewChars: string;
};

export function buildEditForm(mcp: McpListItem): EditForm {
  return {
    name: mcp.name,
    emoji: mcp.emoji ?? "",
    serverJson: formatMcpServerJson(mcp),
    previewThresholdChars: mcp.systemConfig?.resultPolicy?.previewThresholdChars
      ? String(mcp.systemConfig.resultPolicy.previewThresholdChars)
      : "",
    previewChars: mcp.systemConfig?.resultPolicy?.previewChars
      ? String(mcp.systemConfig.resultPolicy.previewChars)
      : "",
  };
}
