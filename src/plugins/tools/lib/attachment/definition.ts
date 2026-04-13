import type { McpServerConfig } from "../../../mcp/types.js";

export const attachmentDefinition: McpServerConfig = {
  id: "attachment",
  name: "Attachments",
  active: true,
  instruction: [
    "Use this tool as the session attachment store for files moving into and out of KK-Agent chat.",
    "Prefer list_attachments, read_attachment, and provide_attachment over searching the main filesystem for chat-related files.",
    "Use attachmentId when available because filenames may be ambiguous.",
    "Do not assume attachments live in the normal project tree or on the same local machine as the agent runtime.",
  ].join(" "),
  emoji: "📎",
  source: "system",
  systemKey: "attachment",
  systemConfig: {},
  transport: "stdio",
  server: { command: "internal", args: [] },
};
