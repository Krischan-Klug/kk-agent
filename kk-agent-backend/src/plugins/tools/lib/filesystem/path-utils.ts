import { extname, resolve, sep } from "node:path";
import { getDefaultPathForScope, resolveAccessScope, resolveFilesystemSystemConfig } from "../access-paths.js";
import type { McpServerConfig } from "../../../mcp/types.js";

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

function getFilesystemBasePath(config: McpServerConfig): string {
  return resolveFilesystemSystemConfig(config.systemConfig).basePath ?? resolve("/");
}

function getFilesystemAllowedRoot(config: McpServerConfig): string {
  return getDefaultPathForScope(resolveAccessScope(config.systemConfig?.accessScope));
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

export function resolveFilesystemPath(config: McpServerConfig, target?: unknown): string {
  return resolveWithinRoot(getFilesystemAllowedRoot(config), getFilesystemBasePath(config), target);
}
