import { defineSystemMcp } from "../system-definition.js";

export const filesystemDefinition = defineSystemMcp({
  id: "filesystem",
  name: "Filesystem",
  instruction:
    "Use Read, Edit, Write, Glob, and Grep for local filesystem work. " +
    "Always use Read before Edit or existing-file Write. " +
    "Use Edit for targeted, exact-string replacements. " +
    "Use Write for new files or deliberate full rewrites. " +
    "Use Glob to find files by path pattern and Grep to search contents. " +
    "Do not use Terminal for file search, file reading, or file editing when these dedicated tools can do the job. " +
    "When output is truncated, narrow the read with offset, limit, head_limit, or path. " +
    "Prefer absolute paths and always stay inside the allowed root.",
  emoji: "📁",
  systemConfig: {
    resultPolicy: { previewThresholdChars: 16000, previewChars: 2400 },
  },
});
