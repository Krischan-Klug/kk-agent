import { defineSystemMcp } from "../system-definition.js";

export const terminalDefinition = defineSystemMcp({
  id: "terminal",
  name: "Terminal",
  instruction: "Use Terminal for targeted commands, builds, tests, package managers, scripts, git, and managed background tasks.",
  emoji: "🖳",
  systemConfig: {
    resultPolicy: { previewThresholdChars: 12000, previewChars: 2200 },
  },
});
