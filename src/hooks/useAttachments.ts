import { useCallback, useRef, useState } from "react";
import { session as sessionApi } from "@/lib/api";
import type { AttachmentMeta } from "@/types/api";

export interface PendingAttachment extends AttachmentMeta {
  previewUrl?: string;
}

const ACCEPTED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml", ".html", ".css",
  ".js", ".ts", ".tsx", ".jsx", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".h",
  ".sh", ".sql", ".toml", ".ini", ".env", ".log",
  ".pdf",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB absolute max
const MAX_ATTACHMENTS = 5;

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isAccepted(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (file.type === "application/pdf") return true;
  if (file.type === "application/json" || file.type.startsWith("text/")) return true;
  return ACCEPTED_EXTENSIONS.has(getExtension(file.name));
}

export function useAttachments() {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const pendingRef = useRef<PendingAttachment[]>([]);

  const setPendingState = useCallback((next: PendingAttachment[] | ((prev: PendingAttachment[]) => PendingAttachment[])) => {
    setPending((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      pendingRef.current = resolved;
      return resolved;
    });
  }, []);

  const addFiles = useCallback(async (sessionId: string, files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remaining = MAX_ATTACHMENTS - pendingRef.current.length;
    if (remaining <= 0) return;

    const accepted = fileArray.filter(isAccepted).slice(0, remaining);
    if (accepted.length === 0) return;

    setUploading(true);
    try {
      const results: PendingAttachment[] = [];
      for (const file of accepted) {
        if (file.size > MAX_FILE_SIZE) continue;
        try {
          const meta = await sessionApi.uploadAttachment(sessionId, file);
          const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
          results.push({ ...meta, previewUrl });
        } catch (err) {
          console.warn("[attachments] Upload failed:", (err as Error).message);
        }
      }
      if (results.length > 0) {
        setPendingState((prev) => [...prev, ...results]);
      }
    } finally {
      setUploading(false);
    }
  }, [setPendingState]);

  const removeAttachment = useCallback((id: string) => {
    setPendingState((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, [setPendingState]);

  const clearAttachments = useCallback((options?: { revokeUrls?: boolean }) => {
    const revokeUrls = options?.revokeUrls ?? true;
    setPendingState((prev) => {
      if (revokeUrls) {
        for (const a of prev) {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        }
      }
      return [];
    });
  }, [setPendingState]);

  const consumePendingAttachments = useCallback((): PendingAttachment[] => {
    const snapshot = pendingRef.current;
    setPendingState([]);
    return snapshot;
  }, [setPendingState]);

  return {
    pendingAttachments: pending,
    uploading,
    addFiles,
    removeAttachment,
    clearAttachments,
    consumePendingAttachments,
  };
}
