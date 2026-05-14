import type { AttachmentCategory, AttachmentSource } from "kk-agent-contract";

export type { AttachmentSource } from "kk-agent-contract";

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
