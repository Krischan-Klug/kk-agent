import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ToolCallResult } from "../../../mcp/types.js";
import { isBinaryBuffer } from "./path-utils.js";
import { countChangedLines, detectLineEnding, generateUnifiedDiff, normalizeLineEndings } from "./diff.js";

type ExistingTextResult =
  | { ok: true; info: Stats; content: string }
  | { ok: false; result: ToolCallResult };

const mutationQueues = new Map<string, Promise<void>>();

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
  const temporaryPath = join(dirname(path), `.${basename(path)}.kk-agent-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", mode);
  let closed = false;
  try {
    await handle.writeFile(content, "utf-8");
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
