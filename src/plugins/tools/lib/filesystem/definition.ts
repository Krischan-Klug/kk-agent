import { homedir } from "node:os";
import type { McpServerConfig } from "../../../mcp/types.js";

export const DEFAULT_FILESYSTEM_ROOT = homedir();

export const filesystemDefinition: McpServerConfig = {
  id: "filesystem",
  name: "Filesystem",
  active: true,
  instruction:
    [
      "You can access the local filesystem inside the configured root path.",
      "Use read_file to inspect files (with line numbers and offset/limit for large files),",
      "edit_file for targeted changes, write_file to create new files,",
      "grep to search file contents, and search_files to find files by name.",
      "Prefer edit_file over write_file when making small changes to existing files.",
      "Use read and stat tools before destructive changes when verification is needed.",
    ].join(" "),
  emoji: "📁",
  source: "system",
  systemKey: "filesystem",
  systemConfig: { rootPath: DEFAULT_FILESYSTEM_ROOT },
  transport: "stdio",
  server: { command: "internal", args: [] },
};
