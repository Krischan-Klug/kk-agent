import { defineSystemMcp } from "../system-definition.js";

export const webSearchDefinition = defineSystemMcp({
  id: "web-search",
  name: "Web Search",
  instruction:
    "Use WebSearch for current information and WebFetch for a specific page. " +
    "Keep queries and extraction focused, summarize relevant findings, and cite relied-on sources.",
  emoji: "🌐",
  systemConfig: { resultPolicy: { previewThresholdChars: 24000, previewChars: 3200 } },
});
