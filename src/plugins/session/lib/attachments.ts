import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { STATE_DIR } from "../../lib/state.js";
import type { StoredAttachment, AttachmentMeta } from "./attachment-types.js";

interface AllowedType {
  category: "image" | "text" | "pdf";
  maxSize: number;
}

const ALLOWED_TYPES = new Map<string, AllowedType>([
  ["image/png", { category: "image", maxSize: 10 * 1024 * 1024 }],
  ["image/jpeg", { category: "image", maxSize: 10 * 1024 * 1024 }],
  ["image/gif", { category: "image", maxSize: 10 * 1024 * 1024 }],
  ["image/webp", { category: "image", maxSize: 10 * 1024 * 1024 }],
  ["text/plain", { category: "text", maxSize: 5 * 1024 * 1024 }],
  ["text/markdown", { category: "text", maxSize: 5 * 1024 * 1024 }],
  ["text/csv", { category: "text", maxSize: 5 * 1024 * 1024 }],
  ["text/xml", { category: "text", maxSize: 5 * 1024 * 1024 }],
  ["text/html", { category: "text", maxSize: 5 * 1024 * 1024 }],
  ["application/json", { category: "text", maxSize: 5 * 1024 * 1024 }],
  ["application/xml", { category: "text", maxSize: 5 * 1024 * 1024 }],
  ["application/x-yaml", { category: "text", maxSize: 5 * 1024 * 1024 }],
  ["text/yaml", { category: "text", maxSize: 5 * 1024 * 1024 }],
  ["application/pdf", { category: "pdf", maxSize: 20 * 1024 * 1024 }],
]);

const EXTENSION_FALLBACKS = new Map<string, AllowedType>([
  [".txt", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".md", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".json", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".csv", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".xml", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".yaml", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".yml", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".html", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".css", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".js", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".ts", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".tsx", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".jsx", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".py", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".rs", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".go", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".java", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".c", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".cpp", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".h", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".sh", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".sql", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".toml", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".ini", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".env", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".log", { category: "text", maxSize: 5 * 1024 * 1024 }],
  [".pdf", { category: "pdf", maxSize: 20 * 1024 * 1024 }],
]);

const ATTACHMENTS_ROOT = resolve(STATE_DIR, "session-attachments");
const INDEX_FILENAME = "index.json";

function getSessionDir(sessionId: string): string {
  return join(ATTACHMENTS_ROOT, sessionId);
}

function getIndexPath(sessionId: string): string {
  return join(getSessionDir(sessionId), INDEX_FILENAME);
}

function sanitizeFilename(filename: string): string {
  const clean = basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").trim();
  return clean || "attachment";
}

async function ensureSessionDir(sessionId: string): Promise<string> {
  const dir = getSessionDir(sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function loadSessionIndex(sessionId: string): Promise<StoredAttachment[]> {
  const indexPath = getIndexPath(sessionId);
  if (!existsSync(indexPath)) return [];
  try {
    const raw = await readFile(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as StoredAttachment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveSessionIndex(sessionId: string, entries: StoredAttachment[]): Promise<void> {
  await ensureSessionDir(sessionId);
  await writeFile(getIndexPath(sessionId), JSON.stringify(entries, null, 2), "utf-8");
}

async function upsertAttachment(sessionId: string, attachment: StoredAttachment): Promise<void> {
  const existing = await loadSessionIndex(sessionId);
  const next = [...existing.filter((entry) => entry.id !== attachment.id), attachment];
  await saveSessionIndex(sessionId, next);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function resolveType(mimeType: string, filename: string): AllowedType | undefined {
  const byMime = ALLOWED_TYPES.get(mimeType);
  if (byMime) return byMime;
  return EXTENSION_FALLBACKS.get(extname(filename).toLowerCase());
}

export async function initAttachmentStore(): Promise<void> {
  await rm(ATTACHMENTS_ROOT, { recursive: true, force: true });
  await mkdir(ATTACHMENTS_ROOT, { recursive: true });
}

export async function storeAttachment(
  sessionId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
): Promise<AttachmentMeta> {
  const typeInfo = resolveType(file.mimetype, file.originalname);
  if (!typeInfo) throw new Error(`Unsupported file type: ${file.mimetype} (${file.originalname})`);
  if (file.size > typeInfo.maxSize) {
    throw new Error(`File too large: ${file.size} bytes (max ${typeInfo.maxSize} for ${typeInfo.category})`);
  }

  let extractedText: string | undefined;
  if (typeInfo.category === "text") extractedText = file.buffer.toString("utf-8");
  if (typeInfo.category === "pdf") extractedText = await extractPdfText(file.buffer);

  const id = randomUUID();
  const safeFilename = sanitizeFilename(file.originalname);
  const dir = await ensureSessionDir(sessionId);
  const storedPath = join(dir, `${id}-${safeFilename}`);

  await writeFile(storedPath, file.buffer);

  const attachment: StoredAttachment = {
    id,
    sessionId,
    filename: file.originalname,
    mimeType: file.mimetype,
    category: typeInfo.category,
    size: file.size,
    storedPath,
    extractedText,
    createdAt: Date.now(),
  };

  await upsertAttachment(sessionId, attachment);

  return {
    id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    category: attachment.category,
    size: attachment.size,
  };
}

export async function listSessionAttachments(sessionId: string): Promise<StoredAttachment[]> {
  return loadSessionIndex(sessionId);
}

export async function getSessionAttachmentsByIds(
  sessionId: string,
  ids: string[],
): Promise<StoredAttachment[]> {
  if (ids.length === 0) return [];
  const index = await loadSessionIndex(sessionId);
  const byId = new Map(index.map((entry) => [entry.id, entry]));
  return ids
    .map((id) => byId.get(id))
    .filter((entry): entry is StoredAttachment => Boolean(entry))
    .filter((entry) => entry.sessionId === sessionId);
}

export async function resolveAttachmentReference(
  sessionId: string,
  reference: { attachmentId?: unknown; filename?: unknown },
): Promise<StoredAttachment> {
  const entries = await loadSessionIndex(sessionId);
  const attachmentId = typeof reference.attachmentId === "string" ? reference.attachmentId.trim() : "";
  const filename = typeof reference.filename === "string" ? reference.filename.trim() : "";

  if (attachmentId) {
    const match = entries.find((entry) => entry.id === attachmentId);
    if (!match) throw new Error(`Attachment with id "${attachmentId}" not found in this session.`);
    return match;
  }

  if (!filename) throw new Error("attachmentId or filename is required");

  const matches = entries.filter((entry) => entry.filename === filename);
  if (matches.length === 0) throw new Error(`Attachment "${filename}" not found in this session.`);
  if (matches.length > 1) {
    const ids = matches.map((entry) => entry.id).join(", ");
    throw new Error(`Attachment filename "${filename}" is ambiguous. Use attachmentId instead: ${ids}`);
  }
  return matches[0];
}

export async function readAttachmentData(attachment: StoredAttachment): Promise<Buffer> {
  return readFile(attachment.storedPath);
}

export function clearSessionAttachments(sessionId: string): void {
  const dir = getSessionDir(sessionId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function describeAttachment(attachment: StoredAttachment): string {
  return `${attachment.filename} (${attachment.category}, ${formatSize(attachment.size)}, id=${attachment.id})`;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  } catch (err) {
    console.warn("[attachments] PDF text extraction failed:", (err as Error).message);
    return "[PDF-Textextraktion fehlgeschlagen]";
  }
}
