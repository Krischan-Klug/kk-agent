import type { McpToolDefinition } from "../../../mcp/types.js";

export const filesystemTools: McpToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a file with line numbers. Use offset/limit for large files.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path." },
        offset: { type: "number", description: "Start line (1-based, default: 1)." },
        limit: { type: "number", description: "Lines to read (default: 200)." },
      },
      required: ["path"],
    },
    mcpId: "filesystem",
  },
  {
    name: "edit_file",
    description: "Replace an exact string in a file. old_string must be unique — add context if needed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path." },
        old_string: { type: "string", description: "Exact text to find (must appear once)." },
        new_string: { type: "string", description: "Replacement text (empty to delete)." },
      },
      required: ["path", "old_string", "new_string"],
    },
    mcpId: "filesystem",
  },
  {
    name: "write_file",
    description: "Create or overwrite a file. Creates parent dirs. Prefer edit_file for partial changes.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path." },
        content: { type: "string", description: "Full content to write." },
      },
      required: ["path", "content"],
    },
    mcpId: "filesystem",
  },
  {
    name: "grep",
    description: "Search file contents by regex. Returns matching lines with paths. Skips binary/build dirs.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex or literal string (case-insensitive)." },
        path: { type: "string", description: "Directory to search (default: root)." },
        include: { type: "string", description: "Glob to filter files, e.g. '*.ts'." },
      },
      required: ["pattern"],
    },
    mcpId: "filesystem",
  },
  {
    name: "search_files",
    description: "Find files/dirs by name substring. Use grep to search inside file contents.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Name fragment (case-insensitive)." },
        path: { type: "string", description: "Start directory (default: root)." },
        type: { type: "string", enum: ["file", "directory", "all"], description: "Filter type (default: all)." },
      },
      required: ["pattern"],
    },
    mcpId: "filesystem",
  },
  {
    name: "list_directory",
    description: "List directory contents with sizes. Use recursive=true for full tree.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path (default: root)." },
        recursive: { type: "boolean", description: "List recursively (default: false)." },
      },
    },
    mcpId: "filesystem",
  },
  {
    name: "stat_path",
    description: "Get file/directory metadata: type, size, timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to inspect." },
      },
      required: ["path"],
    },
    mcpId: "filesystem",
  },
  {
    name: "move_path",
    description: "Move or rename a file or directory.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source path." },
        to: { type: "string", description: "Destination path." },
      },
      required: ["from", "to"],
    },
    mcpId: "filesystem",
  },
  {
    name: "delete_path",
    description: "Delete a file or directory (recursive).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to delete." },
      },
      required: ["path"],
    },
    mcpId: "filesystem",
  },
];
