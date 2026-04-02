import type { McpToolDefinition } from "../../../mcp/types.js";

export const attachmentTools: McpToolDefinition[] = [
  {
    name: "list_attachments",
    description: "List chat attachments available in the current session with ids, filenames, types, sizes, and stored paths.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    mcpId: "attachment",
  },
  {
    name: "read_attachment",
    description: "Read a text or PDF attachment from the current session by attachmentId or filename.",
    inputSchema: {
      type: "object",
      properties: {
        attachmentId: { type: "string", description: "Preferred unique attachment id from list_attachments." },
        filename: { type: "string", description: "Attachment filename if unique in the session." },
        offset: { type: "number", description: "Start line for text output (1-based, default: 1)." },
        limit: { type: "number", description: "Line count to return (default: 200)." },
      },
    },
    mcpId: "attachment",
  },
];
