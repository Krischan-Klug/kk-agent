import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { getStateDirPath } from "../../lib/state.js";
import type { StoredAttachment, AttachmentMeta, AttachmentSource } from "./attachment-types.js";

interface AllowedType {
  category: "image" | "text" | "pdf";
  maxSize: number;
}

const IMAGE_MAX_SIZE = 10 * 1024 * 1024;
const TEXT_MAX_SIZE = 5 * 1024 * 1024;
const PDF_MAX_SIZE = 20 * 1024 * 1024;

const IMAGE: AllowedType = { category: "image", maxSize: IMAGE_MAX_SIZE };
const TEXT: AllowedType = { category: "text", maxSize: TEXT_MAX_SIZE };
const PDF: AllowedType = { category: "pdf", maxSize: PDF_MAX_SIZE };

const ALLOWED_TYPES = new Map<string, AllowedType>([
  ["image/png", IMAGE],
  ["image/jpeg", IMAGE],
  ["image/gif", IMAGE],
  ["image/webp", IMAGE],
  ["text/plain", TEXT],
  ["text/markdown", TEXT],
  ["text/csv", TEXT],
  ["text/xml", TEXT],
  ["text/html", TEXT],
  ["application/json", TEXT],
  ["application/xml", TEXT],
  ["application/x-yaml", TEXT],
  ["text/yaml", TEXT],
  ["application/pdf", PDF],
]);

const EXTENSION_FALLBACKS = new Map<string, AllowedType>([
  [".txt", TEXT],
  [".md", TEXT],
  [".json", TEXT],
  [".csv", TEXT],
  [".xml", TEXT],
  [".yaml", TEXT],
  [".yml", TEXT],
  [".html", TEXT],
  [".css", TEXT],
  [".js", TEXT],
  [".ts", TEXT],
  [".tsx", TEXT],
  [".jsx", TEXT],
  [".py", TEXT],
  [".rs", TEXT],
  [".go", TEXT],
  [".java", TEXT],
  [".c", TEXT],
  [".cpp", TEXT],
  [".h", TEXT],
  [".sh", TEXT],
  [".sql", TEXT],
  [".toml", TEXT],
  [".ini", TEXT],
  [".env", TEXT],
  [".log", TEXT],
  [".pdf", PDF],
]);

const ATTACHMENTS_ROOT = resolve(getStateDirPath("session-attachments"));
const INDEX_FILENAME = "index.json";

function getSessionDir(sessionId: string): string {
  return join(ATTACHMENTS_ROOT, sessionId);
}

function getSessionSourceDir(sessionId: string, source: AttachmentSource): string {
  return join(getSessionDir(sessionId), source);
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

async function ensureSourceDir(sessionId: string, source: AttachmentSource): Promise<string> {
  const dir = getSessionSourceDir(sessionId, source);
  await mkdir(dir, { recursive: true });
  return dir;
}

function normalizeStoredAttachment(entry: StoredAttachment | Record<string, unknown>): StoredAttachment {
  return {
    ...(entry as StoredAttachment),
    source: (entry as StoredAttachment).source ?? "user",
  };
}

async function loadSessionIndex(sessionId: string): Promise<StoredAttachment[]> {
  const indexPath = getIndexPath(sessionId);
  if (!existsSync(indexPath)) return [];
  try {
    const raw = await readFile(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as StoredAttachment[];
    return Array.isArray(parsed) ? parsed.map((entry) => normalizeStoredAttachment(entry)) : [];
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
  await mkdir(ATTACHMENTS_ROOT, { recursive: true });

  // Clean orphaned attachment directories whose session no longer exists
  const { listPersistedSessionIds } = await import("../../lib/state.js");
  const persistedIds = new Set(await listPersistedSessionIds());

  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(ATTACHMENTS_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !persistedIds.has(entry.name)) {
        const orphanDir = join(ATTACHMENTS_ROOT, entry.name);
        rmSync(orphanDir, { recursive: true, force: true });
      }
    }
  } catch {
    // ignore readdir errors
  }
}

export async function storeAttachment(
  sessionId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  options: { source?: AttachmentSource; createdByTool?: string } = {},
): Promise<AttachmentMeta> {
  const source = options.source ?? "user";
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
  await ensureSessionDir(sessionId);
  const dir = await ensureSourceDir(sessionId, source);
  const storedPath = join(dir, `${id}-${safeFilename}`);

  await writeFile(storedPath, file.buffer);

  const attachment: StoredAttachment = {
    id,
    sessionId,
    filename: file.originalname,
    mimeType: file.mimetype,
    category: typeInfo.category,
    source,
    size: file.size,
    storedPath,
    extractedText,
    createdAt: Date.now(),
    createdByTool: options.createdByTool,
  };

  await upsertAttachment(sessionId, attachment);

  return {
    id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    category: attachment.category,
    source: attachment.source,
    size: attachment.size,
  };
}

export async function storeProvidedAttachment(
  sessionId: string,
  input: {
    filename: string;
    mimeType: string;
    content: string;
    encoding: "utf8" | "base64";
  },
): Promise<AttachmentMeta> {
  const buffer = input.encoding === "base64"
    ? Buffer.from(input.content, "base64")
    : Buffer.from(input.content, "utf-8");

  if (buffer.length === 0) {
    throw new Error("Attachment content must not be empty.");
  }

  if (input.encoding === "base64" && buffer.toString("base64").replace(/=+$/u, "") !== input.content.replace(/\s+/gu, "").replace(/=+$/u, "")) {
    throw new Error("Invalid base64 content for attachment.");
  }

  return storeAttachment(
    sessionId,
    {
      originalname: input.filename,
      mimetype: input.mimeType,
      buffer,
      size: buffer.length,
    },
    { source: "assistant", createdByTool: "provide_attachment" },
  );
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

export async function getSessionAttachmentById(
  sessionId: string,
  attachmentId: string,
): Promise<StoredAttachment | null> {
  if (!attachmentId.trim()) return null;
  const entries = await loadSessionIndex(sessionId);
  return entries.find((entry) => entry.id === attachmentId && entry.sessionId === sessionId) ?? null;
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

export async function buildAttachmentPreviewDataUrl(attachment: StoredAttachment): Promise<string | undefined> {
  if (attachment.category !== "image") return undefined;
  const base64 = (await readAttachmentData(attachment)).toString("base64");
  return `data:${attachment.mimeType};base64,${base64}`;
}

export function clearSessionAttachments(sessionId: string): void {
  const dir = getSessionDir(sessionId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function describeAttachment(attachment: StoredAttachment): string {
  return `${attachment.filename} (${attachment.category}, ${formatSize(attachment.size)}, id=${attachment.id}, source=${attachment.source})`;
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
    return "[PDF text extraction failed]";
  }
}
