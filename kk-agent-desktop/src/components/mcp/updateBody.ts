import type { McpListItem, UpdateMcpBody } from "@/types/api";
import type { EditForm } from "./types";
import { parseMcpServerJson } from "./configJson";

function buildBaseUpdate(form: EditForm): Pick<UpdateMcpBody, "name" | "emoji"> {
  return {
    name: form.name,
    emoji: form.emoji || undefined,
  };
}

export function buildCustomMcpUpdateBody(mcp: McpListItem, form: EditForm): UpdateMcpBody {
  const server = parseMcpServerJson(form.serverJson, mcp.transport);
  if (!server.ok) throw new Error(server.error);
  return {
    ...buildBaseUpdate(form),
    ...server.value,
  };
}
