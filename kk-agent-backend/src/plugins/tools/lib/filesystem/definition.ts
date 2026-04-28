import type { McpServerConfig } from "../../../mcp/types.js";
import { getDefaultPathForScope } from "../access-paths.js";

const DEFAULT_FILESYSTEM_ROOT = getDefaultPathForScope("user");

export const filesystemDefinition: McpServerConfig = {
  id: "filesystem",
  name: "Filesystem",
  active: true,
  instruction:
    "Use Read, Edit, Write, Glob, and Grep for local filesystem work. " +
    "Read files before editing them. " +
    "Use Glob to find files by path pattern and Grep to search contents. " +
    "Do not use Bash for file search, file reading, or file editing when these dedicated tools can do the job. " +
    "Prefer absolute paths and always stay inside the allowed root.",
  emoji: "📁",
  source: "system",
  systemKey: "filesystem",
  systemConfig: {
    accessScope: "user",
    basePath: DEFAULT_FILESYSTEM_ROOT,
    resultPolicy: { previewThresholdChars: 16000, previewChars: 2400 },
  },
  transport: "stdio",
  server: { command: "internal", args: [] },
};
