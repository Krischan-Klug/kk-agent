import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { fileTypeFromBuffer } from "file-type";
import { unzipSync } from "fflate";
import { ASSET_EXTENSION_KINDS, type AssetKind, type AssetMeta } from "kk-agent-contract";
import { ConflictError } from "../../../lib/errors.js";
import { getStateDirPath } from "../../lib/state.js";
import * as sessionStore from "./store.js";
import { ingestDocumentWithRag, searchDocumentWithRag } from "./retrieval-worker.js";
import type { AssetChunk, AssetInput, ProcessedAsset, ResolvedAsset } from "./asset-types.js";

const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PREVIEWS = 8;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES = 25 * 1024 * 1024;
const ZIP_DOCUMENT_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx", ".odt", ".odp", ".ods"]);
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  return value >>> 0;
});

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
  ["image/svg+xml", "text"], ["application/json", "text"], ["application/geo+json", "text"],
  ["model/obj", "model"], ["model/stl", "model"], ["model/gltf+json", "model"],
  ["model/gltf-binary", "model"], ["application/vnd.ms-pki.stl", "model"],
  ["application/zip", "archive"], ["application/gzip", "archive"],
  ["application/x-npy", "binary"], ["application/x-npz", "binary"],
  ["application/vnd.apache.parquet", "binary"], ["application/octet-stream", "binary"],
]);

const EXTENSION_KIND = new Map<string, AssetKind>(Object.entries(ASSET_EXTENSION_KINDS));
const EXTENSION_MIME = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".csv", "text/csv"],
  [".tsv", "text/tab-separated-values"],
  [".json", "application/json"],
  [".svg", "image/svg+xml"],
  [".geojson", "application/geo+json"],
  [".py", "text/x-python"],
  [".obj", "model/obj"],
  [".stl", "model/stl"],
  [".ply", "model/ply"],
  [".gltf", "model/gltf+json"],
  [".glb", "model/gltf-binary"],
  [".zip", "application/zip"],
  [".gz", "application/gzip"],
  [".npy", "application/x-npy"],
  [".npz", "application/x-npz"],
  [".parquet", "application/vnd.apache.parquet"],
  [".bin", "application/octet-stream"],
]);

const KIND_MIME: Record<AssetKind, string> = {
  image: "application/octet-stream", pdf: "application/pdf", document: "application/octet-stream",
  presentation: "application/octet-stream", spreadsheet: "application/octet-stream", text: "text/plain",
  model: "application/octet-stream", archive: "application/octet-stream", binary: "application/octet-stream",
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

function decodeText(buffer: Buffer): string {
  if (buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0)) {
    throw new Error("The uploaded file is binary but was declared as text.");
  }
  return buffer.toString("utf8").replace(/^\uFEFF/u, "");
}

function validateZipArchive(buffer: Buffer): void {
  let entries = 0;
  let totalSize = 0;
  unzipSync(new Uint8Array(buffer), {
    filter: (entry) => {
      entries += 1;
      totalSize += entry.originalSize;
      if (entries > MAX_ARCHIVE_ENTRIES || entry.originalSize > MAX_ARCHIVE_ENTRY_BYTES || totalSize > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
        throw new Error("Archive exceeds safe expansion limits.");
      }
      return false;
    },
  });
}

async function renderPdfPreviews(buffer: Buffer): Promise<ProcessedAsset["previews"]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const screenshots = await parser.getScreenshot({
      first: MAX_PDF_PREVIEWS,
      desiredWidth: 1_400,
      imageDataUrl: false,
      imageBuffer: true,
    });
    return screenshots.pages.map((page) => ({ page: page.pageNumber, data: page.data }));
  } finally {
    await parser.destroy();
  }
}

function isBinaryModel(buffer: Buffer, extension: string): boolean {
  if (extension === ".glb") return true;
  if (extension === ".stl" && buffer.length >= 84) {
    const triangles = buffer.readUInt32LE(80);
    if (84 + triangles * 50 === buffer.length) return true;
  }
  if (extension === ".ply" && /format\s+binary_(?:little|big)_endian/iu.test(buffer.subarray(0, 1_024).toString("ascii"))) {
    return true;
  }
  return buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0);
}

function supportsDocumentRetrieval(kind: AssetKind, buffer: Buffer, extension: string): boolean {
  if (["pdf", "document", "presentation", "spreadsheet", "text"].includes(kind)) return true;
  return kind === "model" && !isBinaryModel(buffer, extension);
}

async function processAsset(
  kind: AssetKind,
  buffer: Buffer,
  extension: string,
  mimeType: string,
  stageDir: string,
  sourcePath: string,
): Promise<ProcessedAsset> {
  if (kind === "image") {
    validateImageBuffer(buffer, mimeType);
    await writeFile(join(stageDir, "content.txt"), "", "utf8");
    return { textAvailable: false, previews: [] };
  }
  if (kind === "archive") {
    if (extension === ".zip") validateZipArchive(buffer);
    await writeFile(join(stageDir, "content.txt"), "", "utf8");
    return { textAvailable: false, previews: [] };
  }
  if (!supportsDocumentRetrieval(kind, buffer, extension)) {
    await writeFile(join(stageDir, "content.txt"), "", "utf8");
    return { textAvailable: false, previews: [] };
  }
  if (ZIP_DOCUMENT_EXTENSIONS.has(extension)) validateZipArchive(buffer);
  if (kind === "text" || kind === "model") decodeText(buffer);
  const [retrieval, previews] = await Promise.all([
    ingestDocumentWithRag(sourcePath, stageDir, kind === "text" || kind === "model" || extension === ".tsv" || extension === ".rtf"),
    kind === "pdf" ? renderPdfPreviews(buffer) : Promise.resolve([]),
  ]);
  return {
    textAvailable: retrieval.textAvailable,
    ...(retrieval.pageCount > 0 ? { pageCount: retrieval.pageCount } : {}),
    previews,
  };
}

export async function resolveAssetInputType(input: AssetInput): Promise<{ kind: AssetKind; mimeType: string }> {
  const extension = extname(input.filename).toLowerCase();
  const detected = await fileTypeFromBuffer(input.buffer);
  const declared = input.declaredMimeType?.toLowerCase().split(";", 1)[0]?.trim();
  const detectedKind = detected && MIME_KIND.get(detected.mime);
  const declaredKind = declared && declared !== "application/octet-stream" ? MIME_KIND.get(declared) : undefined;
  const extensionKind = EXTENSION_KIND.get(extension);
  const compatibleContainer = extension === ".npz" && detectedKind === "archive";
  const kind = (compatibleContainer ? extensionKind : detectedKind)
    || declaredKind || extensionKind || (input.source === "assistant" ? "binary" : undefined);
  if (!kind) throw new Error(`Unsupported asset format: ${input.filename}`);
  if (detectedKind && extensionKind && detectedKind !== extensionKind && !compatibleContainer) {
    throw new Error(`File content does not match its supported format: ${input.filename}`);
  }
  const mimeType = EXTENSION_MIME.get(extension)
    || detected?.mime
    || (declared && declared !== "application/octet-stream" ? declared : undefined)
    || KIND_MIME[kind];
  return { kind, mimeType };
}

export async function ingestAsset(sessionId: string, input: AssetInput): Promise<AssetMeta> {
  const session = sessionStore.getSession(sessionId);
  if (!session) throw new Error(`Session "${sessionId}" not found.`);
  if (input.buffer.length === 0) throw new Error("Asset must not be empty.");
  const { kind, mimeType } = await resolveAssetInputType(input);
  if (input.buffer.length > maxSize(kind)) throw new Error(`Asset exceeds the ${Math.round(maxSize(kind) / 1024 / 1024)} MB limit.`);

  const id = randomUUID();
  const stageDir = join(assetsDir(sessionId), `.staging-${id}`);
  const finalDir = assetDir(sessionId, id);
  const extension = extname(input.filename).toLowerCase();
  const sourcePath = join(stageDir, `source${extension || ".bin"}`);

  try {
    await mkdir(join(stageDir, "previews"), { recursive: true });
    await writeFile(sourcePath, input.buffer);
    const processed = await processAsset(kind, input.buffer, extension, mimeType, stageDir, sourcePath);
    const meta: AssetMeta = {
      id,
      filename: sanitizeFilename(input.filename),
      mimeType,
      kind,
      source: input.source,
      size: input.buffer.length,
      textAvailable: processed.textAvailable,
      previewAvailable: kind === "image" || processed.previews.length > 0,
      ...(processed.pageCount ? { pageCount: processed.pageCount } : {}),
    };
    await Promise.all([
      rename(sourcePath, join(stageDir, "original")),
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

export async function searchAssetChunks(sessionId: string, assetId: string, query: string, limit: number): Promise<AssetChunk[]> {
  const asset = resolveAsset(sessionId, assetId);
  if (!asset) throw new Error(`Asset "${assetId}" not found in this session.`);
  if (!asset.meta.textAvailable) return [];
  return searchDocumentWithRag(assetDir(sessionId, assetId), query, limit);
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
  return `${asset.filename} (${asset.kind}, mime=${asset.mimeType}, ${size}, id=${asset.id}, source=${asset.source})`;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(buffer: Buffer): void {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) throw new Error("Invalid PNG image data.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  let sawHeader = false;
  let sawEnd = false;
  const compressed: Buffer[] = [];
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new Error("Invalid PNG chunk structure.");
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) throw new Error("Invalid PNG chunk length.");
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) throw new Error("Invalid PNG checksum.");
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) throw new Error("PNG must begin with a valid IHDR chunk.");
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
      if (width < 1 || height < 1 || width * height > 100_000_000) throw new Error("PNG dimensions are invalid or too large.");
      sawHeader = true;
    } else if (type === "IHDR") {
      throw new Error("PNG contains multiple IHDR chunks.");
    }
    if (type === "IDAT") compressed.push(data);
    if (type === "IEND") {
      if (length !== 0) throw new Error("Invalid PNG IEND chunk.");
      sawEnd = true;
      if (end !== buffer.length) throw new Error("PNG contains trailing data.");
    }
    offset = end;
  }
  if (!sawHeader || !sawEnd || compressed.length === 0) throw new Error("PNG is missing required image data.");
  const decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: MAX_IMAGE_BYTES * 4 });
  if (interlace === 0) {
    const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
    if (!channels || ![1, 2, 4, 8, 16].includes(bitDepth)) throw new Error("PNG uses an unsupported color layout.");
    const expected = height * (1 + Math.ceil(width * channels * bitDepth / 8));
    if (decoded.length !== expected) throw new Error("PNG pixel data is incomplete or malformed.");
  } else if (interlace !== 1 || decoded.length === 0) {
    throw new Error("PNG interlace data is invalid.");
  }
}

export function validateImageBuffer(buffer: Buffer, mimeType: string): void {
  if (mimeType === "image/png") {
    validatePng(buffer);
    return;
  }
  if (mimeType === "image/jpeg" && (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8
    || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9)) throw new Error("Invalid JPEG image data.");
  if (mimeType === "image/gif" && (buffer.length < 14 || !buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/u)
    || buffer.at(-1) !== 0x3b)) throw new Error("Invalid GIF image data.");
  if (mimeType === "image/webp") {
    const declaredSize = buffer.length >= 12 ? buffer.readUInt32LE(4) + 8 : -1;
    if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP"
      || declaredSize !== buffer.length) throw new Error("Invalid WebP image data.");
  }
}
