import type { McpListItem } from "@/types/api";
import { formatMcpServerJson } from "./configJson";

export type EditForm = {
  name: string;
  emoji: string;
  serverJson: string;
};

export function buildEditForm(mcp: McpListItem): EditForm {
  return {
    name: mcp.name,
    emoji: mcp.emoji ?? "",
    serverJson: formatMcpServerJson(mcp),
  };
}
