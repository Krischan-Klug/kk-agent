import { defineInternalTool } from "../internal-tool-definition.js";

export const webSearchDefinition = defineInternalTool({
  id: "web-search",
  name: "Web Search",
  instruction:
    "Use WebSearch for current information and WebFetch for a specific page. " +
    "Keep queries and extraction focused, summarize relevant findings, and cite relied-on sources.",
  emoji: "🌐",
  config: { resultPolicy: { previewThresholdChars: 24000, previewChars: 3200 } },
});
