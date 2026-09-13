import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, parse } from "node:path";
import type { ToolCallResult } from "../../types.js";
import { isBinaryBuffer } from "./path-utils.js";
import { countChangedLines, detectLineEnding, generateUnifiedDiff, normalizeLineEndings } from "./diff.js";

type ExistingTextResult =
  | { ok: true; info: Stats; content: string }
  | { ok: false; result: ToolCallResult };

const mutationQueues = new Map<string, Promise<void>>();

export function isFilesystemRoot(path: string): boolean {
  return path === parse(path).root;
}

export async function ensureParentDirectory(path: string): Promise<void> {
  const parent = dirname(path);
  if (isFilesystemRoot(parent)) return;
  await mkdir(parent, { recursive: true });
}

function mutationKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

export async function withFileMutationLock<T>(path: string, mutate: () => Promise<T>): Promise<T> {
  const key = mutationKey(path);
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.then(() => held);
  mutationQueues.set(key, current);
  await previous;
  try {
    return await mutate();
  } finally {
    release();
    if (mutationQueues.get(key) === current) mutationQueues.delete(key);
  }
}

export async function withFileMutationLocks<T>(paths: string[], mutate: () => Promise<T>): Promise<T> {
  const ordered = [...new Set(paths)].sort((left, right) => mutationKey(left).localeCompare(mutationKey(right)));
  const acquire = (index: number): Promise<T> => index >= ordered.length
    ? mutate()
    : withFileMutationLock(ordered[index]!, () => acquire(index + 1));
  return acquire(0);
}

export async function readExistingTextForMutation(
  path: string,
  operation: "edit" | "write",
  binaryMessage: string,
  info?: Stats,
): Promise<ExistingTextResult> {
  const existingInfo = info ?? await stat(path);
  const content = await readFile(path, "utf-8");
  if (isBinaryBuffer(Buffer.from(content, "utf-8"))) {
    return {
      ok: false,
      result: {
        content: `${binaryMessage}: ${path}`,
        isError: true,
        metadata: { filePath: path, operation, binary: true },
      },
    };
  }

  return { ok: true, info: existingInfo, content };
}

export function normalizeToExistingLineEndings(content: string, existingContent: string): string {
  return normalizeLineEndings(content, detectLineEnding(existingContent));
}

export function buildTextChangeDiff(path: string, before: string, after: string): { diff: string; changedLines: number } {
  const diff = generateUnifiedDiff(path, before, after);
  return { diff, changedLines: countChangedLines(diff) };
}

export async function writeTextAtomically(path: string, content: string, mode?: number): Promise<Stats> {
  return writeDataAtomically(path, content, mode);
}

export async function writeDataAtomically(path: string, content: string | Buffer, mode?: number): Promise<Stats> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.kk-agent-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", mode);
  let closed = false;
  try {
    if (typeof content === "string") await handle.writeFile(content, "utf-8");
    else await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    closed = true;
    await rename(temporaryPath, path);
    return await stat(path);
  } catch (error) {
    if (!closed) await handle.close().catch(() => undefined);
    throw error;
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
