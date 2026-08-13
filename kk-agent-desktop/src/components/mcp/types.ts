import type { CreateMcpBody, McpListItem, McpStdioConfig } from "@/types/api";

export type EditForm = {
  name: string;
  emoji: string;
  command: string;
  args: string;
  url: string;
  accessScope: "user" | "system";
  basePath: string;
  workingDirectory: string;
  previewThresholdChars: string;
  previewChars: string;
};

export const EMPTY_MCP_FORM: CreateMcpBody = {
  name: "",
  transport: "stdio",
  command: "",
  args: [],
  url: "",
  instruction: "",
  emoji: "",
};

export function buildEditForm(mcp: McpListItem): EditForm {
  const server = mcp.server as McpStdioConfig & { url?: string };
  return {
    name: mcp.name,
    emoji: mcp.emoji ?? "",
    command: server.command ?? "",
    args: (server.args ?? []).join("\n"),
    url: server.url ?? "",
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
