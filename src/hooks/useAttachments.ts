import { useCallback, useState } from "react";
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

  const addFiles = useCallback(async (sessionId: string, files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remaining = MAX_ATTACHMENTS - pending.length;
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
        setPending((prev) => [...prev, ...results]);
      }
    } finally {
      setUploading(false);
    }
  }, [pending.length]);

  const removeAttachment = useCallback((id: string) => {
    setPending((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback((options?: { revokeUrls?: boolean }) => {
    const revokeUrls = options?.revokeUrls ?? true;
    setPending((prev) => {
      if (revokeUrls) {
        for (const a of prev) {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        }
      }
      return [];
    });
  }, []);

  return {
    pendingAttachments: pending,
    uploading,
    addFiles,
    removeAttachment,
    clearAttachments,
  };
}
