import type { McpToolDefinition } from "../../../mcp/types.js";

export const attachmentTools: McpToolDefinition[] = [
  {
    name: "list_attachments",
    description: "List session attachments available in the current chat with ids, filenames, sources, types, and sizes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    mcpId: "attachment",
  },
  {
    name: "read_attachment",
    description: "Read a text or PDF attachment from the current session by attachmentId or filename. Prefer attachmentId when available.",
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
  {
    name: "provide_attachment",
    description: "Create a new session attachment from inline content and make it available in chat as a downloadable file.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename to show in chat and on download." },
        mimeType: { type: "string", description: "Mime type for the attachment, such as text/markdown or application/pdf." },
        content: { type: "string", description: "Attachment body as utf8 text or base64, depending on encoding." },
        encoding: {
          type: "string",
          enum: ["utf8", "base64"],
          description: "Encoding of content. Use utf8 for text and base64 for binary-safe transfer.",
        },
      },
      required: ["filename", "mimeType", "content"],
    },
    mcpId: "attachment",
  },
];
