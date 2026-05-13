import { defineSystemMcp } from "../system-definition.js";

export const webSearchDefinition = defineSystemMcp({
  id: "web-search",
  name: "Web Search",
  instruction:
    "Use WebSearch for current information and discovery, and WebFetch to read and extract information from a specific page. " +
    "Prefer targeted queries, keep searches narrow, and include sources when you rely on web results. " +
    "For a specific page, use WebFetch with a clear extraction prompt instead of pasting raw page text into your answer. " +
    "Summarize only the relevant findings rather than dumping page content. " +
    "When you use WebSearch, cite the sources in your final answer.",
  emoji: "🌐",
  systemConfig: { resultPolicy: { previewThresholdChars: 24000, previewChars: 3200 } },
});
