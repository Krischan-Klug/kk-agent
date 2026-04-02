export type AttachmentCategory = "image" | "text" | "pdf";

export interface StoredAttachment {
  id: string;
  sessionId: string;
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  size: number;
  storedPath: string;
  extractedText?: string;
  createdAt: number;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  size: number;
}

export interface AttachmentDisplayMeta {
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  size: number;
  previewDataUrl?: string;
}
