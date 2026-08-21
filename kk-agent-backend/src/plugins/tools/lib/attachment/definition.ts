import { defineSystemMcp } from "../system-definition.js";

export const attachmentDefinition = defineSystemMcp({
  id: "attachment",
  name: "Assets",
  instruction: [
    "Use asset tools for managed session inputs and downloadable artifacts.",
    "Address inputs by assetId and never encode binary content in a tool call.",
  ].join(" "),
  emoji: "📎",
});
