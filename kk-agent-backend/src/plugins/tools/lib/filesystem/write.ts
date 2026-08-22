import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { getErrnoCode } from "../../../../lib/error.js";
import { resolveFilesystemPath } from "./path-utils.js";
import {
  buildTextChangeDiff,
  normalizeToExistingLineEndings,
  readExistingTextForMutation,
  withFileMutationLock,
  writeTextAtomically,
} from "./mutation.js";

export async function executeWrite(
  config: McpServerConfig,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const path = resolveFilesystemPath(config, args.file_path);
  const contentToWrite = String(args.content ?? "");
  return withFileMutationLock(path, async () => {
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

    await mkdir(dirname(path), { recursive: true });
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
