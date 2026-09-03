import type { InternalToolDescriptor } from "../../types.js";

export const filesystemTools: InternalToolDescriptor[] = [
  {
    name: "Read",
    description:
      "Read a local file with line numbers. Use offset and limit for large files.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute file path to read." },
        offset: { type: "number", description: "Optional start line (1-based)." },
        limit: { type: "number", description: "Optional number of lines to read (default: 2000)." },
      },
      required: ["file_path"],
    },
    capabilityId: "filesystem",
  },
  {
    name: "Edit",
    description:
      "Replace exact text in an existing file. The match must be unique unless replace_all is true.",
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
    capabilityId: "filesystem",
  },
  {
    name: "Write",
    description: "Create or fully rewrite a local file.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute file path to write." },
        content: { type: "string", description: "Full content to write." },
      },
      required: ["file_path", "content"],
    },
    capabilityId: "filesystem",
  },
  {
    name: "Glob",
    description: "Find files by path pattern, such as **/*.ts.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern like '**/*.ts' or 'src/**/*.tsx'." },
        path: { type: "string", description: "Optional base directory to search from." },
      },
      required: ["pattern"],
    },
    capabilityId: "filesystem",
  },
  {
    name: "Grep",
    description:
      "Search file contents by regex. Select lines, files, or count with output_mode.",
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
    capabilityId: "filesystem",
  },
];
