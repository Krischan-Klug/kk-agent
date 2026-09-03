import { defineInternalTool } from "../internal-tool-definition.js";

export const terminalDefinition = defineInternalTool({
  id: "terminal",
  name: "Terminal",
  instruction: "Use Terminal for targeted commands, builds, tests, package managers, scripts, git, and managed background tasks.",
  emoji: "🖳",
  config: {
    resultPolicy: { previewThresholdChars: 12000, previewChars: 2200 },
  },
});
