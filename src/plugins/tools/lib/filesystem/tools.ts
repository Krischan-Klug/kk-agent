import type { McpToolDefinition } from "../../../mcp/types.js";

export const filesystemTools: McpToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the full text content of a file inside the allowed root path. Use this for source files, config files, logs, and documents.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute or relative path to the file to read." } },
      required: ["path"],
    },
    mcpId: "filesystem",
  },
  {
    name: "write_file",
    description: "Write text content to a file inside the allowed root path. Creates parent directories if needed and overwrites the file if it already exists.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to the file to write." },
        content: { type: "string", description: "Full text content to write into the file." },
      },
      required: ["path", "content"],
    },
    mcpId: "filesystem",
  },
  {
    name: "list_directory",
    description: "List the direct contents of a directory inside the allowed root path. Use this to inspect structure before reading, moving, or deleting.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Optional relative or absolute directory path. Defaults to the root path." } },
    },
    mcpId: "filesystem",
  },
  {
    name: "search_files",
    description: "Recursively search for files or directories by name pattern inside the allowed root path. Use this when you know part of a name but not the exact location.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Case-insensitive name fragment to search for." },
        path: { type: "string", description: "Optional starting directory inside the allowed root path." },
      },
      required: ["pattern"],
    },
    mcpId: "filesystem",
  },
  {
    name: "stat_path",
    description: "Inspect a file or directory and return basic metadata such as type, size, and timestamps. Use this before moving or deleting when you need confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to inspect." },
      },
      required: ["path"],
    },
    mcpId: "filesystem",
  },
  {
    name: "move_path",
    description: "Move or rename a file or directory inside the allowed root path. Use this instead of rewriting a file when you only need to rename or relocate it.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source path to move or rename." },
        to: { type: "string", description: "Destination path inside the allowed root path." },
      },
      required: ["from", "to"],
    },
    mcpId: "filesystem",
  },
  {
    name: "delete_path",
    description: "Delete a file or directory inside the allowed root path. This is destructive and should be used carefully.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to delete." },
      },
      required: ["path"],
    },
    mcpId: "filesystem",
  },
];
