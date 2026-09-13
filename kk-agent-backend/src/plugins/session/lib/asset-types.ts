import type { AssetMeta, AssetSource } from "kk-agent-contract";

export interface AssetChunk {
  index: number;
  text: string;
  locator: string;
  headings?: string[];
  pages?: number[];
  score?: number;
}

export interface ProcessedAsset {
  textAvailable: boolean;
  pageCount?: number;
  previews: Array<{ page: number; data: Uint8Array }>;
}

export interface AssetInput {
  filename: string;
  declaredMimeType?: string;
  buffer: Buffer;
  source: AssetSource;
}

export interface ResolvedAsset {
  meta: AssetMeta;
  originalPath: string;
  textPath: string;
  previewsDir: string;
}
