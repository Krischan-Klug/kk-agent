import type { AttachmentDisplayMeta } from "@/types/api";

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

const EXTENSION_EMOJI: Record<string, string> = {
  ".csv": "📊",
  ".css": "🎨",
  ".doc": "📘",
  ".docx": "📘",
  ".env": "⚙️",
  ".gif": "🖼️",
  ".go": "🧩",
  ".h": "🧩",
  ".html": "🌐",
  ".ini": "⚙️",
  ".java": "☕",
  ".jpeg": "🖼️",
  ".jpg": "🖼️",
  ".js": "📜",
  ".json": "🧾",
  ".log": "📝",
  ".md": "📝",
  ".pdf": "📕",
  ".png": "🖼️",
  ".py": "🐍",
  ".rs": "🦀",
  ".sh": "💻",
  ".sql": "🗄️",
  ".svg": "🖼️",
  ".toml": "⚙️",
  ".ts": "📘",
  ".tsx": "⚛️",
  ".txt": "🗒️",
  ".webp": "🖼️",
  ".xml": "🧾",
  ".yaml": "⚙️",
  ".yml": "⚙️",
};

export function isImageAttachment(attachment: Pick<AttachmentDisplayMeta, "category">): boolean {
  return attachment.category === "image";
}

export function getAttachmentEmoji(
  attachment: Pick<AttachmentDisplayMeta, "category" | "filename">,
): string {
  if (attachment.category === "image") return "🖼️";
  if (attachment.category === "pdf") return "📕";
  return EXTENSION_EMOJI[getExtension(attachment.filename)] ?? "📄";
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
