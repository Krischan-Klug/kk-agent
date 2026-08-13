import type { McpListItem, UpdateMcpBody } from "@/types/api";
import type { EditForm } from "./types";

function optionalResultPolicy(form: EditForm) {
  const previewThresholdChars = form.previewThresholdChars.trim() ? Number(form.previewThresholdChars) : undefined;
  const previewChars = form.previewChars.trim() ? Number(form.previewChars) : undefined;
  return {
    ...(previewThresholdChars !== undefined ? { previewThresholdChars } : {}),
    ...(previewChars !== undefined ? { previewChars } : {}),
  };
}

function buildSystemConfig(tool: McpListItem, form: EditForm) {
  const supportsAccessScope = tool.systemKey === "filesystem" || tool.systemKey === "terminal";
  const supportsResultPolicy = supportsAccessScope || tool.systemKey === "web-search";
  return {
    ...(supportsAccessScope ? { accessScope: form.accessScope } : {}),
    ...(tool.systemKey === "filesystem" ? { basePath: form.basePath } : {}),
    ...(tool.systemKey === "terminal" ? { workingDirectory: form.workingDirectory } : {}),
    ...(supportsResultPolicy ? { resultPolicy: optionalResultPolicy(form) } : {}),
  };
}

function buildBaseUpdate(form: EditForm): Pick<UpdateMcpBody, "name" | "emoji"> {
  return {
    name: form.name,
    emoji: form.emoji || undefined,
  };
}

export function buildCustomMcpUpdateBody(mcp: McpListItem, form: EditForm): UpdateMcpBody {
  return {
    ...buildBaseUpdate(form),
    ...(mcp.transport === "stdio"
      ? { command: form.command, args: form.args.split("\n").filter(Boolean), env: {} }
      : { url: form.url }),
  };
}

export function buildSystemToolUpdateBody(tool: McpListItem, form: EditForm): UpdateMcpBody {
  return {
    ...buildBaseUpdate(form),
    systemConfig: buildSystemConfig(tool, form),
  };
}
