import type { Stats } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import type { ToolCallResult } from "../../../mcp/types.js";
import { recordKnownContentForSession, verifyReadStateForSession } from "./read-state.js";
import { getSessionIdOrThrow, isBinaryBuffer } from "./path-utils.js";
import { countChangedLines, detectLineEnding, generateUnifiedDiff, normalizeLineEndings } from "./diff.js";

type ExistingTextResult =
  | { ok: true; sessionId: string; info: Stats; content: string }
  | { ok: false; result: ToolCallResult };

export async function readExistingTextForMutation(
  path: string,
  operation: "edit" | "write",
  binaryMessage: string,
  info?: Stats,
): Promise<ExistingTextResult> {
  const existingInfo = info ?? await stat(path);
  const sessionId = getSessionIdOrThrow();
  const verify = await verifyReadStateForSession(sessionId, path, existingInfo.mtimeMs, existingInfo.size);
  if (!verify.allowed) {
    return {
      ok: false,
      result: {
        content: verify.reason!,
        isError: true,
        metadata: { filePath: path, operation, stale: true },
      },
    };
  }

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

  return { ok: true, sessionId, info: existingInfo, content };
}

export function normalizeToExistingLineEndings(content: string, existingContent: string): string {
  return normalizeLineEndings(content, detectLineEnding(existingContent));
}

export function buildTextChangeDiff(path: string, before: string, after: string): { diff: string; changedLines: number } {
  const diff = generateUnifiedDiff(path, before, after);
  return { diff, changedLines: countChangedLines(diff) };
}

export async function writeTextAndRecordRead(sessionId: string, path: string, content: string): Promise<Stats> {
  await writeFile(path, content, "utf-8");
  const updatedInfo = await stat(path);
  recordKnownContentForSession(sessionId, path, updatedInfo.mtimeMs, updatedInfo.size, content);
  return updatedInfo;
}
