import { defineInternalTool } from "../internal-tool-definition.js";

export const attachmentDefinition = defineInternalTool({
  id: "attachment",
  name: "Assets",
  instruction: [
    "Use asset tools for managed session inputs and downloadable artifacts.",
    "Address inputs by assetId and never encode binary content in a tool call.",
  ].join(" "),
  emoji: "📎",
});
