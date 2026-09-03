import { useCallback, useRef, useState } from "react";
import { SUPPORTED_ASSET_EXTENSIONS, type AssetMeta } from "kk-agent-contract";
import { session as sessionApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { reportError } from "@/lib/errorReporting";

const logger = createLogger("assets");

export interface PendingAsset extends AssetMeta {
  sessionId: string;
  previewUrl?: string;
}

const ACCEPTED_EXTENSIONS = new Set(SUPPORTED_ASSET_EXTENSIONS);

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_ASSETS = 10;

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function useAssets() {
  const [pending, setPending] = useState<PendingAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const pendingRef = useRef<PendingAsset[]>([]);

  const setPendingState = useCallback((next: PendingAsset[] | ((previous: PendingAsset[]) => PendingAsset[])) => {
    setPending((previous) => {
      const resolved = typeof next === "function" ? next(previous) : next;
      pendingRef.current = resolved;
      return resolved;
    });
  }, []);

  const addFiles = useCallback(async (sessionId: string, files: FileList | File[]) => {
    const candidates = Array.from(files)
      .filter((file) => ACCEPTED_EXTENSIONS.has(extension(file.name)) && file.size <= MAX_FILE_SIZE)
      .slice(0, MAX_ASSETS - pendingRef.current.length);
    if (candidates.length === 0) return;
    setUploading(true);
    try {
      const uploaded: PendingAsset[] = [];
      for (const file of candidates) {
        try {
          const asset = await sessionApi.uploadAsset(sessionId, file);
          uploaded.push({ ...asset, sessionId, ...(asset.kind === "image" ? { previewUrl: URL.createObjectURL(file) } : {}) });
        } catch (error) {
          reportError(`Failed to upload ${file.name}`, error);
        }
      }
      if (uploaded.length) setPendingState((previous) => [...previous, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }, [setPendingState]);

  const removeAsset = useCallback((id: string) => {
    const removed = pendingRef.current.find((asset) => asset.id === id);
    setPendingState((previous) => previous.filter((asset) => asset.id !== id));
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    if (removed) void sessionApi.deleteAsset(removed.sessionId, id).catch((error) => logger.warn("Asset cleanup failed:", error));
  }, [setPendingState]);

  const discardAssets = useCallback(() => {
    const discarded = pendingRef.current;
    setPendingState([]);
    for (const asset of discarded) {
      if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
      void sessionApi.deleteAsset(asset.sessionId, asset.id).catch((error) => logger.warn("Asset cleanup failed:", error));
    }
  }, [setPendingState]);

  const clearAssets = useCallback(() => {
    setPendingState((previous) => {
      previous.forEach((asset) => asset.previewUrl && URL.revokeObjectURL(asset.previewUrl));
      return [];
    });
  }, [setPendingState]);

  return { pendingAssets: pending, uploading, addFiles, removeAsset, discardAssets, clearAssets };
}
