import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { InternalToolDefinition } from "../../types.js";
import type { ToolExecutionResult, ToolRuntimeContext } from "../../../loop/types.js";
import {
  describeAsset,
  getSessionAssetById,
  ingestAsset,
  ingestAssetFromPath,
  listSessionAssets,
  searchAssetChunks,
  readAssetText,
} from "../../../session/lib/assets.js";
import { truncateSelfBoundedReadOutput } from "../read-output.js";

function getSessionIdOrThrow(context?: ToolRuntimeContext): string {
  const sessionId = context?.sessionId;
  if (!sessionId) throw new Error("No active session context for asset tool.");
  return sessionId;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

async function resolvePublishPath(filePath: string, context?: ToolRuntimeContext): Promise<string> {
  const candidate = await realpath(resolve(filePath));
  const roots = readStringArray(context?.values.assetPublishRoots);
  for (const root of roots) {
    const canonicalRoot = await realpath(resolve(root)).catch(() => resolve(root));
    const prefix = canonicalRoot.toLowerCase().endsWith(sep) ? canonicalRoot.toLowerCase() : `${canonicalRoot.toLowerCase()}${sep}`;
    const normalized = candidate.toLowerCase();
    if (normalized === canonicalRoot.toLowerCase() || normalized.startsWith(prefix)) return candidate;
  }
  throw new Error("Artifact path is outside the active filesystem and terminal access scopes.");
}

function withPublishedAsset(context: ToolRuntimeContext, assetId: string): ToolRuntimeContext {
  const current = readStringArray(context.values.publishedAssetIds);
  return { ...context, values: { ...context.values, publishedAssetIds: [...new Set([...current, assetId])] } };
}

export async function executeAttachmentTool(
  _config: InternalToolDefinition,
  toolName: string,
  args: Record<string, unknown>,
  context: ToolRuntimeContext = { values: {} },
): Promise<ToolExecutionResult | null> {
  const sessionId = getSessionIdOrThrow(context);

  if (toolName === "list_assets") {
    const assets = listSessionAssets(sessionId);
    return { content: assets.length ? assets.map(describeAsset).join("\n") : "No managed assets in this session." };
  }

  if (toolName === "read_asset") {
    const assetId = typeof args.assetId === "string" ? args.assetId.trim() : "";
    const asset = getSessionAssetById(sessionId, assetId);
    if (!asset) throw new Error(`Asset "${assetId}" not found in this session.`);
    if (!asset.textAvailable) {
      return { content: `${describeAsset(asset)}\nNo extracted text is available. Use the original visual input when the model supports vision.` };
    }
    const text = await readAssetText(sessionId, assetId);
    const lines = text.split("\n");
    const offset = Math.max(1, Math.floor(typeof args.offset === "number" ? args.offset : 1));
    const limit = Math.min(500, Math.max(1, Math.floor(typeof args.limit === "number" ? args.limit : 200)));
    const end = Math.min(lines.length, offset - 1 + limit);
    const width = String(end).length;
    const body = lines.slice(offset - 1, end).map((line, index) => `${String(offset + index).padStart(width)}\t${line}`).join("\n");
    return { content: truncateSelfBoundedReadOutput(`${describeAsset(asset)}\n\n${body}\n\n[Lines ${offset}-${end} of ${lines.length}]`) };
  }

  if (toolName === "search_asset") {
    const assetId = typeof args.assetId === "string" ? args.assetId.trim() : "";
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) throw new Error("search_asset requires a non-empty query.");
    const asset = getSessionAssetById(sessionId, assetId);
    if (!asset) throw new Error(`Asset "${assetId}" not found in this session.`);
    const maxResults = Math.min(25, Math.max(1, Math.floor(typeof args.maxResults === "number" ? args.maxResults : 10)));
    const matches = await searchAssetChunks(sessionId, assetId, query, maxResults);
    return {
      content: matches.length
        ? matches.map((chunk) => `[chunk=${chunk.index}, ${chunk.locator}, score=${chunk.score?.toFixed(4) ?? "n/a"}]\n${chunk.text}`).join("\n\n")
        : `No matches for "${query}" in ${asset.filename}.`,
    };
  }

  if (toolName === "publish_artifact") {
    const filePath = typeof args.file_path === "string" ? args.file_path.trim() : "";
    const filename = typeof args.filename === "string" ? args.filename.trim() : "";
    const content = typeof args.content === "string" ? args.content : undefined;
    if (Boolean(filePath) === (content !== undefined)) throw new Error("publish_artifact requires exactly one of file_path or content.");
    if (content !== undefined && (!filename || content.length === 0)) throw new Error("Inline artifacts require a filename and non-empty UTF-8 content.");
    const asset = filePath
      ? await ingestAssetFromPath(sessionId, await resolvePublishPath(filePath, context), filename || undefined)
      : await ingestAsset(sessionId, { filename, declaredMimeType: "text/plain", buffer: Buffer.from(content!, "utf8"), source: "assistant" });
    return {
      content: `Published artifact "${asset.filename}" as assetId=${asset.id}.`,
      contextModifier: (current) => withPublishedAsset(current, asset.id),
      metadata: { assetIds: [asset.id], artifact: asset },
    };
  }

  return null;
}
