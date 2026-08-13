import type { AssetMeta } from "@/types/api";

const KIND_ICON: Record<AssetMeta["kind"], string> = {
  image: "Image",
  pdf: "PDF",
  document: "Doc",
  presentation: "Slides",
  spreadsheet: "Sheet",
  text: "Text",
};

export function getAssetLabel(asset: Pick<AssetMeta, "kind">): string {
  return KIND_ICON[asset.kind];
}

export function formatAssetSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
