import type { McpServerConfig } from "../../../mcp/types.js";
import { getDefaultPathForScope } from "../access-paths.js";

export const DEFAULT_FILESYSTEM_ROOT = getDefaultPathForScope("user");

export const filesystemDefinition: McpServerConfig = {
  id: "filesystem",
  name: "Filesystem",
  active: true,
  instruction:
    "You can access the local filesystem inside the configured base path. " +
    "Use these tools for reading, writing, listing, searching, inspecting, moving, and deleting files or directories. " +
    "Prefer absolute paths when possible and always stay inside the allowed root. " +
    "Use read and stat tools before destructive changes when verification is needed. " +
    "Ask before deleting, overwriting important content, or making other destructive changes.",
  emoji: "📁",
  source: "system",
  systemKey: "filesystem",
  systemConfig: { accessScope: "user", basePath: DEFAULT_FILESYSTEM_ROOT },
  transport: "stdio",
  server: { command: "internal", args: [] },
};
