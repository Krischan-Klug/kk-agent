import type { McpServerConfig } from "../../../mcp/types.js";

export const attachmentDefinition: McpServerConfig = {
  id: "attachment",
  name: "Attachments",
  active: true,
  instruction: [
    "Use this tool for files that were uploaded through the chat composer.",
    "Prefer list_attachments and read_attachment over searching the main filesystem for uploaded files.",
    "Use attachmentId when available because filenames may be ambiguous.",
  ].join(" "),
  emoji: "📎",
  source: "system",
  systemKey: "attachment",
  transport: "stdio",
  server: { command: "internal", args: [] },
};
