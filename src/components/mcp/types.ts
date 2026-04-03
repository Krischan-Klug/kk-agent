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
  };
}

export function getConfigSummary(mcp: McpListItem): string {
  if (mcp.source === "system") {
    if (mcp.systemKey === "filesystem") {
      return `scope: ${mcp.systemConfig?.accessScope ?? "user"} | basePath: ${mcp.systemConfig?.basePath ?? "-"}`;
    }
    if (mcp.systemKey === "terminal") {
      return `scope: ${mcp.systemConfig?.accessScope ?? "user"} | workingDirectory: ${mcp.systemConfig?.workingDirectory ?? "-"}`;
    }
    if (mcp.systemKey === "web-search") return "Interne Web-Suche";
    if (mcp.systemKey === "user-interaction") return "Interne User-Interaktion";
    if (mcp.systemKey === "task") return "Interne Task-Steuerung";
    if (mcp.systemKey === "memory") return "Interne Memory-Steuerung";
    if (mcp.systemKey === "attachment") return "Interne Chat-Attachments";
    return "Internes System-Tool";
  }

  return mcp.transport === "stdio"
    ? `${(mcp.server as McpStdioConfig).command} ${((mcp.server as McpStdioConfig).args ?? []).join(" ")}`
    : (mcp.server as { url: string }).url;
}
