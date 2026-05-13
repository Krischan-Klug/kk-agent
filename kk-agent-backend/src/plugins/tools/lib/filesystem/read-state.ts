import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

interface ReadStateEntry {
  mtimeMs: number;
  size: number;
  contentHash?: string;
  fullRead: boolean;
  offset?: number;
  limit?: number;
}

const readState = new Map<string, Map<string, ReadStateEntry>>();

function normalizeKey(path: string): string {
  return path.toLowerCase();
}

function getSessionBucket(sessionId: string): Map<string, ReadStateEntry> {
  const existing = readState.get(sessionId);
  if (existing) return existing;
  const created = new Map<string, ReadStateEntry>();
  readState.set(sessionId, created);
  return created;
}

function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex").slice(0, 16);
}

export async function recordReadForSession(
  sessionId: string,
  path: string,
  mtimeMs: number,
  size: number,
  fullRead: boolean,
  offset?: number,
  limit?: number,
): Promise<void> {
  let contentHash: string | undefined;
  if (fullRead) {
    try {
      const content = await readFile(path, "utf-8");
      contentHash = computeContentHash(content);
    } catch {
      // ignore: if file becomes unreadable, hash stays undefined
    }
  }
  getSessionBucket(sessionId).set(normalizeKey(path), {
    mtimeMs,
    size,
    contentHash,
    fullRead,
    offset,
    limit,
  });
}

export async function refreshReadStateForSession(
  sessionId: string,
  path: string,
  mtimeMs: number,
  size: number,
): Promise<void> {
  const bucket = getSessionBucket(sessionId);
  const key = normalizeKey(path);
  const existing = bucket.get(key);
  if (!existing) return;
  let contentHash: string | undefined;
  try {
    const content = await readFile(path, "utf-8");
    contentHash = computeContentHash(content);
  } catch {
    // ignore
  }
  bucket.set(key, {
    ...existing,
    mtimeMs,
    size,
    contentHash,
  });
}

export function getReadStateForSession(sessionId: string, path: string): ReadStateEntry | undefined {
  return getSessionBucket(sessionId).get(normalizeKey(path));
}

export function hasCurrentReadForSession(sessionId: string, path: string, mtimeMs: number, size: number): boolean {
  const entry = getSessionBucket(sessionId).get(normalizeKey(path));
  if (!entry) return false;
  if (entry.mtimeMs === mtimeMs && entry.size === size) return true;
  return false;
}

export async function verifyReadStateForSession(
  sessionId: string,
  path: string,
  mtimeMs: number,
  size: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const entry = getSessionBucket(sessionId).get(normalizeKey(path));
  if (!entry) {
    return { allowed: false, reason: "This file has not been read in the current conversation. Use Read before editing or overwriting it." };
  }
  if (!entry.fullRead) {
    return { allowed: false, reason: "This file was only partially read. Perform a full Read before editing or overwriting it." };
  }
  if (entry.mtimeMs === mtimeMs && entry.size === size) {
    return { allowed: true };
  }
  // mtime or size changed; verify by content hash as fallback
  try {
    const content = await readFile(path, "utf-8");
    const currentHash = computeContentHash(content);
    if (entry.contentHash && entry.contentHash === currentHash) {
      // Content is unchanged despite mtime/size change; update stored state
      getSessionBucket(sessionId).set(normalizeKey(path), {
        ...entry,
        mtimeMs,
        size,
      });
      return { allowed: true };
    }
  } catch {
    // ignore
  }
  return { allowed: false, reason: "This file has changed since it was last read. Use Read again before editing or overwriting it." };
}

export function clearFilesystemReadState(sessionId: string): void {
  readState.delete(sessionId);
}
