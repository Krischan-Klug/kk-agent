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
      "Use these tools for reading, writing, listing, searching, inspecting, moving, and deleting files or directories.",
      "Prefer absolute paths when possible and always stay inside the allowed root.",
      "Use read and stat tools before destructive changes when verification is needed.",
      "Ask before deleting, overwriting important content, or making other destructive changes.",
    ].join(" "),
  emoji: "📁",
  source: "system",
  systemKey: "filesystem",
  systemConfig: { rootPath: DEFAULT_FILESYSTEM_ROOT },
  transport: "stdio",
  server: { command: "internal", args: [] },
};
