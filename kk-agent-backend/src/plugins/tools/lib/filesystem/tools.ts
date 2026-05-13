import type { McpToolDefinition } from "../../../mcp/types.js";

export const filesystemTools: McpToolDefinition[] = [
  {
    name: "Read",
    description:
      "Read a local file with line numbers. Prefer absolute paths. " +
      "Always read a file before editing it. " +
      "When output is truncated, narrow the read with offset and limit.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute file path to read." },
        offset: { type: "number", description: "Optional start line (1-based)." },
        limit: { type: "number", description: "Optional number of lines to read (default: 2000)." },
      },
      required: ["file_path"],
    },
    mcpId: "filesystem",
  },
  {
    name: "Edit",
    description:
      "Perform an exact string replacement in an existing file. " +
      "Read the file first and use this for targeted edits. " +
      "old_string and new_string must differ. " +
      "If old_string appears more than once, set replace_all=true to replace every occurrence.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute file path to edit." },
        old_string: { type: "string", description: "Exact text to find. Must match exactly, including whitespace and line endings." },
        new_string: { type: "string", description: "Replacement text." },
        replace_all: { type: "boolean", description: "Replace every occurrence instead of requiring a unique match." },
      },
      required: ["file_path", "old_string", "new_string"],
    },
    mcpId: "filesystem",
  },
  {
    name: "Write",
    description:
      "Write a file to the local filesystem. " +
      "Use this for new files or deliberate full rewrites. " +
      "For existing files, a current full Read is required first to protect against overwriting unseen changes.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute file path to write." },
        content: { type: "string", description: "Full content to write." },
      },
      required: ["file_path", "content"],
    },
    mcpId: "filesystem",
  },
  {
    name: "Glob",
    description:
      "Fast file pattern matching for finding files by path pattern, such as **/*.ts. " +
      "Results are sorted by recent modification where possible.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern like '**/*.ts' or 'src/**/*.tsx'." },
        path: { type: "string", description: "Optional base directory to search from." },
      },
      required: ["pattern"],
    },
    mcpId: "filesystem",
  },
  {
    name: "Grep",
    description:
      "Search file contents using ripgrep-style patterns. Prefer this over shell grep or rg when available. " +
      "Use output_mode to choose between matching lines, matching files, or a total count. " +
      "Use head_limit and offset to paginate large result sets.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for." },
        path: { type: "string", description: "Optional base directory to search from." },
        glob: { type: "string", description: "Optional glob to filter files, such as '*.ts' or '**/*.tsx'." },
        type: { type: "string", description: "Optional file type filter such as 'ts' or 'py'." },
        output_mode: {
          type: "string",
          enum: ["content", "files_with_matches", "count"],
          description: "Return matching lines, matching file paths, or a total match count. Default: files_with_matches.",
        },
        case_sensitive: { type: "boolean", description: "Use case-sensitive matching." },
        multiline: { type: "boolean", description: "Allow the pattern to match across multiple lines." },
        head_limit: { type: "number", description: "Maximum number of matches or files to return. 0 means unlimited (still capped by max bytes). Default: 250." },
        offset: { type: "number", description: "Skip the first N matches before returning results." },
      },
      required: ["pattern"],
    },
    mcpId: "filesystem",
  },
];
