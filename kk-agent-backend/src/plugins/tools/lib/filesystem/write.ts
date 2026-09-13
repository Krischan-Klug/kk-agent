import { stat } from "node:fs/promises";
import type { InternalToolDefinition, ToolCallResult } from "../../types.js";
import { getErrnoCode } from "../../../../lib/error.js";
import { resolveFilesystemPath, resolveFilesystemPathLexical } from "./path-utils.js";
import {
  buildTextChangeDiff,
  ensureParentDirectory,
  normalizeToExistingLineEndings,
  readExistingTextForMutation,
  withFileMutationLock,
  writeTextAtomically,
} from "./mutation.js";

export async function executeWrite(
  config: InternalToolDefinition,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const requestedPath = resolveFilesystemPathLexical(config, args.file_path);
  const contentToWrite = String(args.content ?? "");
  return withFileMutationLock(requestedPath, async () => {
    const path = await resolveFilesystemPath(config, args.file_path);
    let existingContent: string | undefined;
    let existingInfo: import("node:fs").Stats | undefined;

    try {
      existingInfo = await stat(path);
    } catch (error) {
      if (getErrnoCode(error) !== "ENOENT") throw error;
    }

    if (existingInfo) {
      const existing = await readExistingTextForMutation(path, "write", "Cannot overwrite binary file", existingInfo);
      if (!existing.ok) return existing.result;
      existingContent = existing.content;
    }

    await ensureParentDirectory(path);
    const finalContent = existingContent === undefined
      ? contentToWrite
      : normalizeToExistingLineEndings(contentToWrite, existingContent);
    await writeTextAtomically(path, finalContent, existingInfo?.mode);

    if (existingContent !== undefined) {
      const { diff, changedLines } = buildTextChangeDiff(path, existingContent, finalContent);
      return {
        content: [`Updated file: ${path}`, diff ? `\n${diff}` : "", `\n[${changedLines} line(s) changed]`].join("\n"),
        isError: false,
        metadata: {
          filePath: path,
          operation: "update",
          changedLines,
          diff,
          bytesWritten: finalContent.length,
        },
      };
    }

    return {
      content: `Created file: ${path}`,
      isError: false,
      metadata: {
        filePath: path,
        operation: "create",
        bytesWritten: finalContent.length,
      },
    };
  });
}
