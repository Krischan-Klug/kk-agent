import type { AttachmentCategory, AttachmentSource } from "@krischan-klug/kk-agent-contract";

export type { AttachmentCategory, AttachmentSource } from "@krischan-klug/kk-agent-contract";

export interface StoredAttachment {
  id: string;
  sessionId: string;
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  source: AttachmentSource;
  size: number;
  storedPath: string;
  extractedText?: string;
  createdAt: number;
  createdByTool?: string;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  source: AttachmentSource;
  size: number;
}

export interface AttachmentDisplayMeta {
  attachmentId?: string;
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  source: AttachmentSource;
  size: number;
  previewDataUrl?: string;
}
