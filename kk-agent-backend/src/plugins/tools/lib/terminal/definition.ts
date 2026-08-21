import { defineSystemMcp } from "../system-definition.js";

export const terminalDefinition = defineSystemMcp({
  id: "terminal",
  name: "Terminal",
  instruction:
    "Use Terminal for shell commands, builds, tests, package manager work, git, and other real terminal operations. " +
    "Prefer dedicated tools like Read, Edit, Write, Glob, and Grep when they fit the task better than a shell command. " +
    "Use short, targeted commands. In plan mode, keep Terminal read-only. Follow the active shell profile from runtime context exactly.",
  emoji: "🖳",
  systemConfig: {
    resultPolicy: { previewThresholdChars: 12000, previewChars: 2200 },
  },
});
