import type { CreateMcpBody, McpListItem, McpStdioConfig } from "@/types/api";

export type EditForm = {
  name: string;
  emoji: string;
  command: string;
  args: string;
  url: string;
  env: Record<string, string>;
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
  env: {},
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
    env: server.env ?? {},
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

export function getConfigSummary(mcp: McpListItem): string {
  const resultPolicy = mcp.systemConfig?.resultPolicy;
  const resultPolicySummary = resultPolicy
    ? `threshold ${resultPolicy.previewThresholdChars ?? "-"} / preview ${resultPolicy.previewChars ?? "-"}`
    : "";

  if (mcp.source === "system") {
    if (mcp.systemKey === "filesystem") {
      return [
        mcp.systemConfig?.accessScope ?? "user",
        mcp.systemConfig?.basePath ?? "-",
        resultPolicySummary,
      ].filter(Boolean).join("\n");
    }
    if (mcp.systemKey === "terminal") {
      return [
        mcp.systemConfig?.accessScope ?? "user",
        mcp.systemConfig?.workingDirectory ?? "-",
        resultPolicySummary,
      ].filter(Boolean).join("\n");
    }
    if (mcp.systemKey === "web-search") return resultPolicySummary;
    return "";
  }

  return mcp.transport === "stdio"
    ? `${(mcp.server as McpStdioConfig).command} ${((mcp.server as McpStdioConfig).args ?? []).join(" ")}`
    : (mcp.server as { url: string }).url;
}
