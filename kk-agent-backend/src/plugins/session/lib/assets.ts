import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { unzipSync } from "fflate";
import readXlsxFile from "read-excel-file/node";
import type { AssetKind, AssetMeta } from "kk-agent-contract";
import { ConflictError } from "../../../lib/errors.js";
import { getStateDirPath } from "../../lib/state.js";
import * as sessionStore from "./store.js";
import type { AssetChunk, AssetInput, ProcessedAsset, ResolvedAsset } from "./asset-types.js";

const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PREVIEWS = 8;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES = 25 * 1024 * 1024;
const CHUNK_SIZE = 4_000;
const CHUNK_OVERLAP = 400;

const MIME_KIND = new Map<string, AssetKind>([
  ["image/png", "image"], ["image/jpeg", "image"], ["image/gif", "image"], ["image/webp", "image"],
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
  ["application/vnd.oasis.opendocument.text", "document"], ["application/rtf", "document"], ["text/rtf", "document"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "presentation"],
  ["application/vnd.oasis.opendocument.presentation", "presentation"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheet"],
  ["application/vnd.oasis.opendocument.spreadsheet", "spreadsheet"],
  ["text/csv", "spreadsheet"], ["text/tab-separated-values", "spreadsheet"],
]);

const EXTENSION_KIND = new Map<string, AssetKind>([
  [".png", "image"], [".jpg", "image"], [".jpeg", "image"], [".gif", "image"], [".webp", "image"],
  [".pdf", "pdf"], [".docx", "document"], [".odt", "document"], [".rtf", "document"],
  [".pptx", "presentation"], [".odp", "presentation"],
  [".xlsx", "spreadsheet"], [".ods", "spreadsheet"], [".csv", "spreadsheet"], [".tsv", "spreadsheet"],
  [".txt", "text"], [".md", "text"], [".json", "text"], [".xml", "text"], [".yaml", "text"],
  [".yml", "text"], [".html", "text"], [".css", "text"], [".js", "text"], [".ts", "text"],
  [".tsx", "text"], [".jsx", "text"], [".py", "text"], [".rs", "text"], [".go", "text"],
  [".java", "text"], [".c", "text"], [".cpp", "text"], [".h", "text"], [".sh", "text"],
  [".sql", "text"], [".toml", "text"], [".ini", "text"], [".log", "text"],
  [".env", "text"],
]);

const KIND_MIME: Record<AssetKind, string> = {
  image: "application/octet-stream", pdf: "application/pdf", document: "application/octet-stream",
  presentation: "application/octet-stream", spreadsheet: "application/octet-stream", text: "text/plain",
};

function assetsDir(sessionId: string): string {
  return resolve(getStateDirPath("sessions", sessionId, "assets"));
}

function assetDir(sessionId: string, assetId: string): string {
  return join(assetsDir(sessionId), assetId);
}

function sanitizeFilename(filename: string): string {
  return basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]+/gu, "_").trim() || "asset";
}

function maxSize(kind: AssetKind): number {
  if (kind === "image") return MAX_IMAGE_BYTES;
  if (kind === "text") return MAX_TEXT_BYTES;
  return MAX_DOCUMENT_BYTES;
}

function chunkText(text: string, locatorPrefix = "text"): AssetChunk[] {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) return [];
  const chunks: AssetChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf("\n", end), normalized.lastIndexOf(" ", end));
      if (boundary > start + CHUNK_SIZE / 2) end = boundary;
    }
    chunks.push({ index: chunks.length, locator: `${locatorPrefix}:${start}-${end}`, text: normalized.slice(start, end) });
    if (end === normalized.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

function decodeText(buffer: Buffer): string {
  if (buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0)) {
    throw new Error("The uploaded file is binary but was declared as text.");
  }
  return buffer.toString("utf8").replace(/^\uFEFF/u, "");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

function extractXmlText(data: Uint8Array): string {
  const xml = Buffer.from(data).toString("utf8");
  return decodeXmlEntities(xml
    .replace(/<w:tab\b[^>]*\/?\s*>/giu, "\t")
    .replace(/<text:tab\b[^>]*\/?\s*>/giu, "\t")
    .replace(/<w:br\b[^>]*\/?\s*>/giu, "\n")
    .replace(/<a:br\b[^>]*\/?\s*>/giu, "\n")
    .replace(/<\/w:tc\s*>/giu, "\t")
    .replace(/<\/table:table-cell\s*>/giu, "\t")
    .replace(/<\/(?:w:p|a:p|text:p|text:h|table:table-row)\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, ""))
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function numericPathSort(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function extractRtfText(buffer: Buffer): string {
  return buffer.toString("latin1")
    .replace(/\\'([0-9a-f]{2})/giu, (_match, hex: string) => Buffer.from([Number.parseInt(hex, 16)]).toString("latin1"))
    .replace(/\\u(-?\d+)\??/gu, (_match, raw: string) => String.fromCharCode((Number.parseInt(raw, 10) + 65536) % 65536))
    .replace(/\\(?:par|line)\b/gu, "\n")
    .replace(/\\tab\b/gu, "\t")
    .replace(/\\[a-z]+-?\d* ?/giu, "")
    .replace(/\\[{}\\]/gu, (match) => match.slice(1))
    .replace(/[{}]/gu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function validateOfficeArchive(buffer: Buffer): void {
  let entries = 0;
  let totalSize = 0;
  unzipSync(new Uint8Array(buffer), {
    filter: (entry) => {
      entries += 1;
      totalSize += entry.originalSize;
      if (entries > MAX_ARCHIVE_ENTRIES || entry.originalSize > MAX_ARCHIVE_ENTRY_BYTES || totalSize > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
        throw new Error("Office archive exceeds safe expansion limits.");
      }
      return false;
    },
  });
}

function extractOfficeText(buffer: Buffer, extension: string): string {
  if (extension === ".rtf") return extractRtfText(buffer);
  validateOfficeArchive(buffer);
  const archive = unzipSync(new Uint8Array(buffer), {
    filter: (entry) => entry.name === "content.xml"
      || /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/u.test(entry.name)
      || /^ppt\/(?:slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/u.test(entry.name),
  });
  const names = Object.keys(archive);
  if (extension === ".docx") {
    const ordered = [
      "word/document.xml",
      ...names.filter((name) => /^word\/(?:header|footer)\d+\.xml$/u.test(name)).sort(numericPathSort),
      ...["word/footnotes.xml", "word/endnotes.xml", "word/comments.xml"].filter((name) => archive[name]),
    ];
    return ordered.flatMap((name) => archive[name] ? [extractXmlText(archive[name])] : []).filter(Boolean).join("\n\n");
  }
  if (extension === ".pptx") {
    const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).sort(numericPathSort);
    const notes = names.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(name)).sort(numericPathSort);
    const sections = slides.map((name, index) => `--- Slide ${index + 1} ---\n${extractXmlText(archive[name]!)}`);
    if (notes.length) sections.push(`--- Speaker notes ---\n${notes.map((name) => extractXmlText(archive[name]!)).join("\n\n")}`);
    return sections.join("\n\n");
  }
  const content = archive["content.xml"];
  if (!content) throw new Error("Office document does not contain a supported content.xml payload.");
  return extractXmlText(content);
}

async function processPdf(buffer: Buffer): Promise<ProcessedAsset> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    const pageChunks = result.pages.flatMap((page) => chunkText(page.text, `page:${page.num}`));
    const screenshots = await parser.getScreenshot({
      first: Math.min(result.total, MAX_PDF_PREVIEWS),
      desiredWidth: 1_400,
      imageDataUrl: false,
      imageBuffer: true,
    });
    return {
      text: result.pages.map((page) => `--- Page ${page.num} ---\n${page.text.trim()}`).join("\n\n").trim(),
      chunks: pageChunks,
      pageCount: result.total,
      previews: screenshots.pages.map((page) => ({ page: page.pageNumber, data: page.data })),
    };
  } finally {
    await parser.destroy();
  }
}

function stringifyCell(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value).replace(/\t/gu, " ").replace(/\r?\n/gu, " ");
}

async function processSpreadsheet(buffer: Buffer, extension: string): Promise<ProcessedAsset> {
  if (extension !== ".xlsx") {
    const text = extractOfficeText(buffer, extension);
    return { text, chunks: chunkText(text, "sheet"), previews: [] };
  }
  validateOfficeArchive(buffer);
  const sheets = await readXlsxFile(buffer);
  const sections = sheets.map(({ sheet, data }) => {
    const rows = data.map((row) => row.map(stringifyCell).join("\t")).join("\n");
    return `--- Sheet: ${sheet} ---\n${rows}`;
  });
  const text = sections.join("\n\n");
  return {
    text,
    chunks: sheets.flatMap(({ sheet, data }) => chunkText(data.map((row) => row.map(stringifyCell).join("\t")).join("\n"), `sheet:${sheet}`)),
    previews: [],
  };
}

async function processAsset(kind: AssetKind, buffer: Buffer, extension: string): Promise<ProcessedAsset> {
  if (kind === "image") return { text: "", chunks: [], previews: [] };
  if (kind === "pdf") return processPdf(buffer);
  if (kind === "spreadsheet" && extension !== ".csv" && extension !== ".tsv") {
    return processSpreadsheet(buffer, extension);
  }
  if (kind === "document" || kind === "presentation") {
    const text = extractOfficeText(buffer, extension);
    return { text, chunks: chunkText(text, kind), previews: [] };
  }
  const text = decodeText(buffer);
  return { text, chunks: chunkText(text, kind), previews: [] };
}

async function resolveInputType(input: AssetInput): Promise<{ kind: AssetKind; mimeType: string }> {
  const extension = extname(input.filename).toLowerCase();
  const detected = await fileTypeFromBuffer(input.buffer);
  const declared = input.declaredMimeType?.toLowerCase().split(";", 1)[0]?.trim();
  const kind = (detected && MIME_KIND.get(detected.mime)) || (declared && MIME_KIND.get(declared)) || EXTENSION_KIND.get(extension);
  if (!kind) throw new Error(`Unsupported asset format: ${input.filename}`);
  if (detected) {
    const detectedKind = MIME_KIND.get(detected.mime);
    if (!detectedKind || detectedKind !== kind) throw new Error(`File content does not match its supported format: ${input.filename}`);
  }
  const mimeType = detected?.mime || (declared && declared !== "application/octet-stream" ? declared : undefined) || KIND_MIME[kind];
  return { kind, mimeType };
}

export async function ingestAsset(sessionId: string, input: AssetInput): Promise<AssetMeta> {
  const session = sessionStore.getSession(sessionId);
  if (!session) throw new Error(`Session "${sessionId}" not found.`);
  if (input.buffer.length === 0) throw new Error("Asset must not be empty.");
  const { kind, mimeType } = await resolveInputType(input);
  if (input.buffer.length > maxSize(kind)) throw new Error(`Asset exceeds the ${Math.round(maxSize(kind) / 1024 / 1024)} MB limit.`);

  const id = randomUUID();
  const stageDir = join(assetsDir(sessionId), `.staging-${id}`);
  const finalDir = assetDir(sessionId, id);
  const processed = await processAsset(kind, input.buffer, extname(input.filename).toLowerCase());
  const meta: AssetMeta = {
    id,
    filename: sanitizeFilename(input.filename),
    mimeType,
    kind,
    source: input.source,
    size: input.buffer.length,
    textAvailable: processed.text.trim().length > 0,
    previewAvailable: kind === "image" || processed.previews.length > 0,
    ...(processed.pageCount ? { pageCount: processed.pageCount } : {}),
  };

  try {
    await mkdir(join(stageDir, "previews"), { recursive: true });
    await Promise.all([
      writeFile(join(stageDir, "original"), input.buffer),
      writeFile(join(stageDir, "content.txt"), processed.text, "utf8"),
      writeFile(join(stageDir, "chunks.json"), JSON.stringify(processed.chunks, null, 2), "utf8"),
      ...processed.previews.map((preview) => writeFile(join(stageDir, "previews", `page-${preview.page}.png`), preview.data)),
    ]);
    await rename(stageDir, finalDir);
    const current = sessionStore.getSession(sessionId);
    if (!current) throw new Error(`Session "${sessionId}" no longer exists.`);
    await sessionStore.updateSession(sessionId, { assets: [...current.assets, meta] });
    return meta;
  } catch (error) {
    await Promise.all([rm(stageDir, { recursive: true, force: true }), rm(finalDir, { recursive: true, force: true })]);
    throw error;
  }
}

export async function ingestAssetFromPath(sessionId: string, filePath: string, filename?: string): Promise<AssetMeta> {
  const absolutePath = resolve(filePath);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) throw new Error(`Artifact path is not a file: ${absolutePath}`);
  return ingestAsset(sessionId, {
    filename: filename?.trim() || basename(absolutePath),
    buffer: await readFile(absolutePath),
    source: "assistant",
  });
}

export function listSessionAssets(sessionId: string): AssetMeta[] {
  return [...(sessionStore.getSession(sessionId)?.assets ?? [])];
}

export function getSessionAssetsByIds(sessionId: string, ids: string[]): AssetMeta[] {
  const byId = new Map(listSessionAssets(sessionId).map((asset) => [asset.id, asset]));
  return ids.map((id) => byId.get(id)).filter((asset): asset is AssetMeta => Boolean(asset));
}

export function getSessionAssetById(sessionId: string, assetId: string): AssetMeta | null {
  return listSessionAssets(sessionId).find((asset) => asset.id === assetId) ?? null;
}

export async function deleteUnreferencedAsset(sessionId: string, assetId: string): Promise<boolean> {
  const session = sessionStore.getSession(sessionId);
  if (!session) return false;
  const referenced = session.messages.some((message) => message.content.some(
    (block) => block.type === "asset_ref" && block.assetId === assetId,
  )) || session.runs.some((run) => run.artifactIds.includes(assetId));
  if (referenced) throw new ConflictError(`Asset "${assetId}" is already part of the session history.`);
  if (!session.assets.some((asset) => asset.id === assetId)) return false;
  await sessionStore.updateSession(sessionId, { assets: session.assets.filter((asset) => asset.id !== assetId) });
  await rm(assetDir(sessionId, assetId), { recursive: true, force: true });
  return true;
}

export async function reconcileAssetStore(): Promise<void> {
  for (const session of sessionStore.listSessions()) {
    const referencedIds = new Set([
      ...session.messages.flatMap((message) => message.content.flatMap((block) => block.type === "asset_ref" ? [block.assetId] : [])),
      ...session.runs.flatMap((run) => run.artifactIds),
    ]);
    const validAssets = session.assets.filter((asset) =>
      referencedIds.has(asset.id) && existsSync(join(assetDir(session.id, asset.id), "original")),
    );
    const validIds = new Set(validAssets.map((asset) => asset.id));
    const root = assetsDir(session.id);
    if (existsSync(root)) {
      const entries = await readdir(root, { withFileTypes: true });
      await Promise.all(entries
        .filter((entry) => entry.isDirectory() && !validIds.has(entry.name))
        .map((entry) => rm(join(root, entry.name), { recursive: true, force: true })));
    }
    if (validAssets.length !== session.assets.length) {
      await sessionStore.updateSession(session.id, { assets: validAssets });
    }
  }
}

export function resolveAsset(sessionId: string, assetId: string): ResolvedAsset | null {
  const meta = getSessionAssetById(sessionId, assetId);
  if (!meta) return null;
  const dir = assetDir(sessionId, assetId);
  return {
    meta,
    originalPath: join(dir, "original"),
    textPath: join(dir, "content.txt"),
    chunksPath: join(dir, "chunks.json"),
    previewsDir: join(dir, "previews"),
  };
}

export async function readAssetData(sessionId: string, assetId: string): Promise<Buffer> {
  const asset = resolveAsset(sessionId, assetId);
  if (!asset) throw new Error(`Asset "${assetId}" not found in this session.`);
  return readFile(asset.originalPath);
}

export async function readAssetText(sessionId: string, assetId: string): Promise<string> {
  const asset = resolveAsset(sessionId, assetId);
  if (!asset) throw new Error(`Asset "${assetId}" not found in this session.`);
  return readFile(asset.textPath, "utf8");
}

export async function readAssetChunks(sessionId: string, assetId: string): Promise<AssetChunk[]> {
  const asset = resolveAsset(sessionId, assetId);
  if (!asset) throw new Error(`Asset "${assetId}" not found in this session.`);
  return JSON.parse(await readFile(asset.chunksPath, "utf8")) as AssetChunk[];
}

export async function readAssetPreview(sessionId: string, assetId: string, page = 1): Promise<{ data: Buffer; mimeType: string }> {
  const asset = resolveAsset(sessionId, assetId);
  if (!asset) throw new Error(`Asset "${assetId}" not found in this session.`);
  if (asset.meta.kind === "image") return { data: await readFile(asset.originalPath), mimeType: asset.meta.mimeType };
  const previewPath = join(asset.previewsDir, `page-${page}.png`);
  if (!existsSync(previewPath)) throw new Error(`Preview page ${page} is not available for asset "${assetId}".`);
  return { data: await readFile(previewPath), mimeType: "image/png" };
}

export function describeAsset(asset: AssetMeta): string {
  const size = asset.size < 1024 * 1024 ? `${Math.ceil(asset.size / 1024)} KB` : `${(asset.size / 1024 / 1024).toFixed(1)} MB`;
  return `${asset.filename} (${asset.kind}, ${size}, id=${asset.id}, source=${asset.source})`;
}
