import { lstat, realpath } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { getDefaultPathForScope, resolveAccessScope, resolveFilesystemConfig } from "../access-paths.js";
import type { InternalToolDefinition } from "../../types.js";

const BINARY_EXTENSIONS = new Set([
  // images
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".svg",
  // pdfs
  ".pdf",
  // archives
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  // executables
  ".exe", ".dll", ".so", ".dylib", ".bin",
  // audio/video
  ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac", ".ogg", ".webm",
  // fonts
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  // other binaries
  ".wasm", ".class", ".pyc", ".o", ".obj",
]);

const BLOCKED_DEVICE_PATHS = new Set([
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/full",
  "/dev/stdin",
  "/dev/tty",
  "/dev/console",
]);

export function isBlockedDevicePath(target: string): boolean {
  const normalized = target.replace(/\\/g, "/").toLowerCase();
  if (BLOCKED_DEVICE_PATHS.has(normalized)) return true;
  // proc fd paths: /proc/*/fd/0, /proc/*/fd/1, /proc/*/fd/2
  if (/^\/proc\/\d+\/fd\/[0-2]$/.test(normalized)) return true;
  return false;
}

export function isBinaryByExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  const check = buffer.subarray(0, 8192);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}

export function detectImagePdf(filePath: string): "image" | "pdf" | "binary" | null {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico"].includes(ext)) return "image";
  return null;
}

function getFilesystemBasePath(tool: InternalToolDefinition): string {
  return resolveFilesystemConfig(tool.config).basePath ?? resolve("/");
}

export function getFilesystemAllowedRoot(tool: InternalToolDefinition): string {
  return getDefaultPathForScope(resolveAccessScope(tool.config?.accessScope));
}

function normalizeRequestedPath(target: string): string {
  const trimmed = target.trim();
  if (/^[\\/][A-Za-z]:[\\/]/.test(trimmed)) {
    return trimmed.slice(1);
  }
  return trimmed;
}

function resolveWithinRoot(allowedRoot: string, basePath: string, target?: unknown): string {
  const base = resolve(basePath);
  const allowedBase = resolve(allowedRoot);
  const normalizedTarget = typeof target === "string" ? normalizeRequestedPath(target) : target;
  const candidate = typeof normalizedTarget === "string" && normalizedTarget ? resolve(base, normalizedTarget) : base;
  const normalizedBase = allowedBase.toLowerCase().endsWith(sep)
    ? allowedBase.toLowerCase()
    : `${allowedBase.toLowerCase()}${sep}`;
  const normalizedCandidate = candidate.toLowerCase();
  if (normalizedCandidate !== allowedBase.toLowerCase() && !normalizedCandidate.startsWith(normalizedBase)) {
    throw new Error(`Path "${String(target ?? "")}" is outside the allowed root path`);
  }
  return candidate;
}

function normalizeForComparison(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function assertWithinRoot(root: string, candidate: string, requested: unknown): void {
  const normalizedRoot = normalizeForComparison(root);
  const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
  const normalizedCandidate = normalizeForComparison(candidate);
  if (normalizedCandidate !== normalizedRoot && !normalizedCandidate.startsWith(prefix)) {
    throw new Error(`Path "${String(requested ?? "")}" resolves outside the allowed root path`);
  }
}

async function nearestExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export function resolveFilesystemPathLexical(config: InternalToolDefinition, target?: unknown): string {
  return resolveWithinRoot(getFilesystemAllowedRoot(config), getFilesystemBasePath(config), target);
}

export async function resolveFilesystemPath(config: InternalToolDefinition, target?: unknown): Promise<string> {
  const requestedRoot = getFilesystemAllowedRoot(config);
  const candidate = resolveFilesystemPathLexical(config, target);
  const canonicalRoot = await realpath(requestedRoot).catch(() => resolve(requestedRoot));
  try {
    const canonicalCandidate = await realpath(candidate);
    assertWithinRoot(canonicalRoot, canonicalCandidate, target);
    return canonicalCandidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const ancestor = await nearestExistingAncestor(dirname(candidate));
    const canonicalAncestor = await realpath(ancestor);
    assertWithinRoot(canonicalRoot, canonicalAncestor, target);
    return candidate;
  }
}

export async function resolveFilesystemEntryPath(config: InternalToolDefinition, target?: unknown): Promise<string> {
  const requestedRoot = getFilesystemAllowedRoot(config);
  const candidate = resolveFilesystemPathLexical(config, target);
  const canonicalRoot = await realpath(requestedRoot).catch(() => resolve(requestedRoot));
  const ancestor = await nearestExistingAncestor(dirname(candidate));
  const canonicalAncestor = await realpath(ancestor);
  assertWithinRoot(canonicalRoot, canonicalAncestor, target);
  return candidate;
}
