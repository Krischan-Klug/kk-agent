import { stat } from "node:fs/promises";
import type { InternalToolDefinition, ToolCallResult } from "../../types.js";
import type { ToolRuntimeContext } from "../../../loop/types.js";
import { getErrnoCode } from "../../../../lib/error.js";
import { getSessionAssetById, readAssetData } from "../../../session/lib/assets.js";
import { ensureParentDirectory, withFileMutationLock, writeDataAtomically } from "./mutation.js";
import { resolveFilesystemPath, resolveFilesystemPathLexical } from "./path-utils.js";

type AssetData = { filename: string; data: Buffer };
type AssetLoader = (sessionId: string, assetId: string) => Promise<AssetData>;

async function loadSessionAsset(sessionId: string, assetId: string): Promise<AssetData> {
  const asset = getSessionAssetById(sessionId, assetId);
  if (!asset) throw new Error(`Asset "${assetId}" not found in this session.`);
  return { filename: asset.filename, data: await readAssetData(sessionId, assetId) };
}

export async function executeSaveAsset(
  config: InternalToolDefinition,
  args: Record<string, unknown>,
  context?: ToolRuntimeContext,
  loadAsset: AssetLoader = loadSessionAsset,
): Promise<ToolCallResult> {
  const sessionId = context?.sessionId;
  if (!sessionId) throw new Error("SaveAsset requires an active session.");
  const assetId = typeof args.asset_id === "string" ? args.asset_id.trim() : "";
  if (!assetId) throw new Error("SaveAsset requires asset_id.");
  const asset = await loadAsset(sessionId, assetId);

  const requestedPath = resolveFilesystemPathLexical(config, args.file_path);
  return withFileMutationLock(requestedPath, async () => {
    const path = await resolveFilesystemPath(config, args.file_path);
    let mode: number | undefined;
    try {
      const existing = await stat(path);
      if (!existing.isFile()) throw new Error(`SaveAsset destination is not a file: ${path}`);
      mode = existing.mode;
    } catch (error) {
      if (getErrnoCode(error) !== "ENOENT") throw error;
    }

    await ensureParentDirectory(path);
    await writeDataAtomically(path, asset.data, mode);
    return {
      content: `Saved asset "${asset.filename}" to: ${path}`,
      isError: false,
      metadata: {
        assetId,
        filePath: path,
        bytesWritten: asset.data.length,
        operation: mode === undefined ? "create" : "replace",
      },
    };
  });
}
