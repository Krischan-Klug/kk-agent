import { defineInternalTool } from "../internal-tool-definition.js";

export const filesystemDefinition = defineInternalTool({
  id: "filesystem",
  name: "Filesystem",
  instruction:
    "Use filesystem tools for local file work and Terminal only for commands that need a shell. " +
    "Read files when their contents are needed for the task. Edit and Write validate the current file internally. " +
    "Narrow truncated results with the tool's range or limit options.",
  emoji: "📁",
  config: {
    resultPolicy: { previewThresholdChars: 16000, previewChars: 2400 },
  },
});
