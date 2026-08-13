import { readFile } from "node:fs/promises";
import type { AssetMeta, TranscriptMessage } from "kk-agent-contract";
import { getAssetRefs, getMessageText } from "kk-agent-contract";
import type { ModelContentPart } from "../../provider/lib/types.js";
import { readAssetPreview, readAssetText, resolveAsset } from "./assets.js";

const MAX_TEXT_CHARS_PER_REQUEST = 64_000;
const MAX_IMAGES_PER_REQUEST = 8;
const MAX_IMAGE_BYTES_PER_REQUEST = 25 * 1024 * 1024;
const MAX_PDF_PAGES_PER_ASSET = 4;

function dataUrl(mimeType: string, data: Buffer): string {
  return `data:${mimeType};base64,${data.toString("base64")}`;
}

function assetHeader(asset: AssetMeta): string {
  return `[Asset: ${asset.filename}; id=${asset.id}; kind=${asset.kind}; mime=${asset.mimeType}]`;
}

export async function compileAssetModelContent(input: {
  sessionId: string;
  messages: TranscriptMessage[];
  visionSupported: boolean;
}): Promise<Record<string, ModelContentPart[]>> {
  const result: Record<string, ModelContentPart[]> = {};
  let remainingText = MAX_TEXT_CHARS_PER_REQUEST;
  let remainingImages = MAX_IMAGES_PER_REQUEST;
  let remainingImageBytes = MAX_IMAGE_BYTES_PER_REQUEST;

  for (const message of [...input.messages].reverse()) {
    if (message.role !== "user") continue;
    const refs = getAssetRefs(message);
    if (refs.length === 0) continue;

    const parts: ModelContentPart[] = [];
    const userText = getMessageText(message).trim();
    if (userText) parts.push({ type: "text", text: userText });

    for (const ref of refs) {
      const resolved = resolveAsset(input.sessionId, ref.assetId);
      if (!resolved) throw new Error(`Asset "${ref.assetId}" referenced by the transcript is missing.`);
      const { meta } = resolved;

      if (meta.kind === "image") {
        parts.push({ type: "text", text: assetHeader(meta) });
        if (input.visionSupported && remainingImages > 0) {
          const image = await readFile(resolved.originalPath);
          if (image.length <= remainingImageBytes) {
            parts.push({ type: "image", dataUrl: dataUrl(meta.mimeType, image), detail: "auto" });
            remainingImages -= 1;
            remainingImageBytes -= image.length;
          } else {
            parts.push({ type: "text", text: "Image pixels were not projected because the request image-byte budget was reached." });
          }
        } else {
          parts.push({ type: "text", text: "Image pixels were not projected because model vision is unavailable or the image limit was reached." });
        }
        continue;
      }

      if (meta.textAvailable && remainingText > 0) {
        const fullText = await readAssetText(input.sessionId, meta.id);
        const included = fullText.slice(0, remainingText);
        parts.push({
          type: "text",
          text: `${assetHeader(meta)}\n${included}${included.length < fullText.length
            ? "\n[Asset text truncated for model context. Use search_asset/read_asset for the remainder.]"
            : ""}`,
        });
        remainingText -= included.length;
      } else {
        parts.push({
          type: "text",
          text: `${assetHeader(meta)}\n[No extracted text was projected. Use read_asset or visual analysis where available.]`,
        });
      }

      if (meta.kind === "pdf" && input.visionSupported && meta.previewAvailable) {
        const pageLimit = Math.min(meta.pageCount ?? 1, MAX_PDF_PAGES_PER_ASSET, remainingImages);
        for (let page = 1; page <= pageLimit; page += 1) {
          const preview = await readAssetPreview(input.sessionId, meta.id, page);
          if (preview.data.length > remainingImageBytes) break;
          parts.push({ type: "text", text: `[${meta.filename}, page ${page}]` });
          parts.push({ type: "image", dataUrl: dataUrl(preview.mimeType, preview.data), detail: "auto" });
          remainingImages -= 1;
          remainingImageBytes -= preview.data.length;
        }
      }
    }
    result[message.id] = parts;
  }

  return result;
}
