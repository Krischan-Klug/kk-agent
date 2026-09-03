import type { InternalToolDescriptor } from "../../types.js";

export const attachmentTools: InternalToolDescriptor[] = [
  {
    name: "list_assets",
    description: "List managed input assets and published artifacts in the current session.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "search_asset",
    description: "Search the extracted, chunked text of one managed session asset.",
    inputSchema: {
      type: "object",
      properties: {
        assetId: { type: "string", description: "Asset id from list_assets." },
        query: { type: "string", description: "Case-insensitive text to find." },
        maxResults: { type: "number", description: "Maximum matches to return (default 10, maximum 25)." },
      },
      required: ["assetId", "query"],
    },
  },
  {
    name: "read_asset",
    description: "Read extracted text from a managed session asset with bounded line ranges.",
    inputSchema: {
      type: "object",
      properties: {
        assetId: { type: "string", description: "Asset id from list_assets." },
        offset: { type: "number", description: "First line, 1-based (default 1)." },
        limit: { type: "number", description: "Line count (default 200, maximum 500)." },
      },
      required: ["assetId"],
    },
  },
  {
    name: "publish_artifact",
    description: "Publish a generated file as a downloadable run artifact. Pass a file path; for a small text artifact, pass filename and content.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to an existing generated file inside the active filesystem or terminal scope." },
        filename: { type: "string", description: "Optional display filename, or required filename for inline text content." },
        content: { type: "string", description: "Optional UTF-8 content for a small text artifact. Never pass binary or base64 here." },
      },
    },
  },
];
