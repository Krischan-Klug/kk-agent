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
  },
  {
    name: "Edit",
    description:
      "Atomically apply one or more exact text replacements to an existing file. Every match is validated before anything is written; use dry_run to preview the combined diff.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute file path to edit." },
        old_string: { type: "string", description: "Exact text to find. Must match exactly, including whitespace and line endings." },
        new_string: { type: "string", description: "Replacement text." },
        replace_all: { type: "boolean", description: "Replace every occurrence instead of requiring a unique match." },
        edits: {
          type: "array",
          description: "Optional ordered replacement batch. Use this instead of top-level old_string/new_string.",
          items: {
            type: "object",
            properties: {
              old_string: { type: "string", description: "Exact text to find." },
              new_string: { type: "string", description: "Replacement text." },
              replace_all: { type: "boolean", description: "Replace all occurrences." },
            },
            required: ["old_string", "new_string"],
          },
        },
        dry_run: { type: "boolean", description: "Return the combined diff without changing the file." },
      },
      required: ["file_path"],
    },
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
  },
  {
    name: "SaveAsset",
    description:
      "Save a managed session asset to a local file, byte-for-byte and atomically. Use this for binary or generated Python outputs; never transfer binary data through text or base64.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "Asset ID returned by Python, publish_artifact, or list_assets." },
        file_path: { type: "string", description: "Absolute destination file path. An existing file is atomically replaced." },
      },
      required: ["asset_id", "file_path"],
      additionalProperties: false,
    },
  },
  {
    name: "List",
    description: "List directory entries without invoking a shell. Symlinks are identified and not traversed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to list. Defaults to the active filesystem root." },
        recursive: { type: "boolean", description: "Recursively list real subdirectories (default false)." },
        limit: { type: "number", description: "Maximum entries (default 250, maximum 1000)." },
      },
    },
  },
  {
    name: "Stat",
    description: "Inspect the type, size, and timestamps of a file or directory.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "File or directory path." } },
      required: ["path"],
    },
  },
  {
    name: "Mkdir",
    description: "Create a directory, including missing parents by default.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to create." },
        recursive: { type: "boolean", description: "Create missing parents (default true)." },
      },
      required: ["path"],
    },
  },
  {
    name: "Move",
    description: "Move or rename a file or directory without overwriting an existing destination.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Existing source path." },
        destination: { type: "string", description: "New destination path." },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "Copy",
    description: "Copy a file or directory without overwriting an existing destination. Directories require recursive=true; symbolic links are not followed.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Existing source path." },
        destination: { type: "string", description: "New destination path." },
        recursive: { type: "boolean", description: "Required when the source is a directory." },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "Remove",
    description: "Remove one exact file, symbolic link, or directory. Directories require recursive=true. Filesystem roots and configured access roots can never be removed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Exact path to remove." },
        recursive: { type: "boolean", description: "Required when removing a directory." },
      },
      required: ["path"],
    },
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
  },
];
