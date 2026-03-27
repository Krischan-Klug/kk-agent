import type { McpToolDefinition } from "../../../mcp/types.js";

export const filesystemTools: McpToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read a file with line numbers. For large files, use offset and limit to navigate specific sections. Returns lines in the format '  42\\tline content'.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to the file." },
        offset: { type: "number", description: "1-based line number to start reading from. Defaults to 1." },
        limit: { type: "number", description: "Number of lines to read. Defaults to 200." },
      },
      required: ["path"],
    },
    mcpId: "filesystem",
  },
  {
    name: "edit_file",
    description:
      "Make a targeted edit to a file by replacing an exact string match. The old_string must appear exactly once in the file — include enough surrounding context to make it unique. Much more efficient than write_file for small changes.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to edit." },
        old_string: {
          type: "string",
          description: "The exact text to find and replace. Must appear exactly once in the file.",
        },
        new_string: {
          type: "string",
          description: "The replacement text. Can be empty to delete the matched text.",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
    mcpId: "filesystem",
  },
  {
    name: "write_file",
    description:
      "Create a new file or fully overwrite an existing file. Creates parent directories if needed. Use edit_file instead when you only need to change part of an existing file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to write." },
        content: { type: "string", description: "Full text content to write." },
      },
      required: ["path", "content"],
    },
    mcpId: "filesystem",
  },
  {
    name: "grep",
    description:
      "Search file contents by regex or string pattern. Returns matching lines with file paths and line numbers. Skips binary files and common build directories. Use this to find where something is defined or used across the codebase.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex or literal string to search for (case-insensitive)." },
        path: { type: "string", description: "Directory to search in. Defaults to root." },
        include: {
          type: "string",
          description: "Glob pattern to filter files, e.g. '*.ts', '*.{ts,tsx}', '*.json'.",
        },
      },
      required: ["pattern"],
    },
    mcpId: "filesystem",
  },
  {
    name: "search_files",
    description:
      "Find files or directories by name pattern (case-insensitive substring match). Use this when you know part of a filename but not its location. Use grep instead to search inside file contents.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Case-insensitive name fragment to search for." },
        path: { type: "string", description: "Starting directory. Defaults to root." },
        type: {
          type: "string",
          enum: ["file", "directory", "all"],
          description: "Filter by entry type. Defaults to 'all'.",
        },
      },
      required: ["pattern"],
    },
    mcpId: "filesystem",
  },
  {
    name: "list_directory",
    description:
      "List directory contents with file sizes. Use recursive mode to see the full tree structure. Use this to understand project layout before reading specific files.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path. Defaults to root." },
        recursive: {
          type: "boolean",
          description: "If true, list contents recursively as an indented tree. Defaults to false.",
        },
      },
    },
    mcpId: "filesystem",
  },
  {
    name: "stat_path",
    description:
      "Inspect a file or directory and return metadata: type, size, and timestamps. Use before moving or deleting when you need confirmation.",
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
    description: "Move or rename a file or directory. Creates parent directories at the destination if needed.",
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
    description: "Delete a file or directory (recursive). This is destructive — use stat_path first if unsure.",
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
