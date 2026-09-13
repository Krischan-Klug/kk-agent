import { defineInternalTool } from "../internal-tool-definition.js";

export const filesystemDefinition = defineInternalTool({
  id: "filesystem",
  name: "Filesystem",
  instruction:
    "Use filesystem tools for local file work and Terminal only for commands that need a shell. " +
    "Use List, Stat, Read, Glob, and Grep to inspect; use Mkdir, Copy, Move, Remove, Edit, Write, and SaveAsset for changes. " +
    "SaveAsset is the binary-safe bridge from managed session or Python artifacts to a local path; never move binary data through chat text or base64. " +
    "Edit and Write validate current file state internally, and Edit supports atomic batches and dry-run previews. " +
    "Narrow truncated results with the tool's range or limit options.",
  emoji: "📁",
  config: {
    resultPolicy: { previewThresholdChars: 16000, previewChars: 2400 },
  },
});
