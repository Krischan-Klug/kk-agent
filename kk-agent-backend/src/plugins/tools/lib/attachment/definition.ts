import { defineSystemMcp } from "../system-definition.js";

export const attachmentDefinition = defineSystemMcp({
  id: "attachment",
  name: "Assets",
  instruction: [
    "Use this tool for managed session inputs and downloadable run artifacts.",
    "Use list_assets, search_asset, and read_asset for inputs; publish generated files with publish_artifact.",
    "Always use assetId because filenames may be ambiguous.",
    "Never encode binary file content in a tool call.",
  ].join(" "),
  emoji: "📎",
});
