import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

interface ReadRange {
  startLine: number;
  endLine: number;
}

interface ReadStateEntry {
  mtimeMs: number;
  size: number;
  contentHash: string;
  totalLines: number;
  ranges: ReadRange[];
}

export interface ReadObservation {
  mtimeMs: number;
  size: number;
  content: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  outputTruncated: boolean;
}

const readState = new Map<string, Map<string, ReadStateEntry>>();

function normalizeKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function getSessionBucket(sessionId: string): Map<string, ReadStateEntry> {
  const existing = readState.get(sessionId);
  if (existing) return existing;
  const created = new Map<string, ReadStateEntry>();
  readState.set(sessionId, created);
  return created;
}

function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

function mergeRanges(ranges: ReadRange[]): ReadRange[] {
  const sorted = ranges
    .filter((range) => range.startLine > 0 && range.endLine >= range.startLine)
    .sort((left, right) => left.startLine - right.startLine);
  const merged: ReadRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.startLine > previous.endLine + 1) {
      merged.push({ ...range });
    } else {
      previous.endLine = Math.max(previous.endLine, range.endLine);
    }
  }
  return merged;
}

function hasFullCoverage(entry: ReadStateEntry): boolean {
  return entry.totalLines > 0
    && entry.ranges.length === 1
    && entry.ranges[0]!.startLine === 1
    && entry.ranges[0]!.endLine >= entry.totalLines;
}

export function recordReadForSession(
  sessionId: string,
  path: string,
  observation: ReadObservation,
): void {
  const bucket = getSessionBucket(sessionId);
  const key = normalizeKey(path);
  const contentHash = computeContentHash(observation.content);
  const existing = bucket.get(key);
  const sameVersion = existing?.contentHash === contentHash;
  const deliveredRanges = observation.outputTruncated
    ? []
    : [{ startLine: observation.startLine, endLine: observation.endLine }];
  const ranges = mergeRanges([
    ...(sameVersion ? existing.ranges : []),
    ...deliveredRanges,
  ]);

  bucket.set(key, {
    mtimeMs: observation.mtimeMs,
    size: observation.size,
    contentHash,
    totalLines: observation.totalLines,
    ranges,
  });
}

export function recordKnownContentForSession(
  sessionId: string,
  path: string,
  mtimeMs: number,
  size: number,
  content: string,
): void {
  const totalLines = content.split("\n").length;
  recordReadForSession(sessionId, path, {
    mtimeMs,
    size,
    content,
    totalLines,
    startLine: 1,
    endLine: totalLines,
    outputTruncated: false,
  });
}

export async function verifyReadStateForSession(
  sessionId: string,
  path: string,
  mtimeMs: number,
  size: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const bucket = getSessionBucket(sessionId);
  const key = normalizeKey(path);
  const entry = bucket.get(key);
  if (!entry) {
    return { allowed: false, reason: "This file has not been read in the current conversation. Use Read before editing or overwriting it." };
  }
  if (!hasFullCoverage(entry)) {
    return { allowed: false, reason: "This file has not been fully read. Read all remaining sections before editing or overwriting it." };
  }

  try {
    const content = await readFile(path, "utf-8");
    if (computeContentHash(content) !== entry.contentHash) {
      return { allowed: false, reason: "This file has changed since it was last read. Use Read again before editing or overwriting it." };
    }
    bucket.set(key, { ...entry, mtimeMs, size });
    return { allowed: true };
  } catch {
    return { allowed: false, reason: "This file could not be verified after it was read. Use Read again before editing or overwriting it." };
  }
}

export function clearFilesystemReadState(sessionId: string): void {
  readState.delete(sessionId);
}
