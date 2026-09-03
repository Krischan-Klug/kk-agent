import type { InternalToolDefinition, ToolCallResult } from "../../types.js";
import { resolveFilesystemPath } from "./path-utils.js";
import {
  buildTextChangeDiff,
  normalizeToExistingLineEndings,
  readExistingTextForMutation,
  withFileMutationLock,
  writeTextAtomically,
} from "./mutation.js";

export async function executeEdit(
  config: InternalToolDefinition,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const path = resolveFilesystemPath(config, args.file_path);
  const oldString = String(args.old_string ?? "");
  const newString = String(args.new_string ?? "");
  const replaceAll = args.replace_all === true;

  if (oldString === newString) {
    return {
      content: "old_string and new_string are identical. No change needed.",
      isError: true,
      metadata: { filePath: path, operation: "edit" },
    };
  }

  if (!oldString) {
    return {
      content: "old_string is required and cannot be empty.",
      isError: true,
      metadata: { filePath: path, operation: "edit" },
    };
  }

  return withFileMutationLock(path, async () => {
    const existing = await readExistingTextForMutation(path, "edit", "Cannot edit binary file");
    if (!existing.ok) return existing.result;
    const { content, info } = existing;
    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) {
      const excerpt = oldString.length > 60 ? oldString.slice(0, 60) + "..." : oldString;
      return {
        content: `old_string not found in the current file.\n\nSearched for:\n${excerpt}`,
        isError: true,
        metadata: { filePath: path, operation: "edit", notFound: true },
      };
    }

    if (occurrences > 1 && !replaceAll) {
      return {
        content: `old_string found ${occurrences} times. Add more context or set replace_all=true.`,
        isError: true,
        metadata: { filePath: path, operation: "edit", occurrences, replaceAll: false },
      };
    }

    const normalizedNewString = normalizeToExistingLineEndings(newString, content);
    const updated = replaceAll
      ? content.split(oldString).join(normalizedNewString)
      : content.replace(oldString, normalizedNewString);
    const { diff, changedLines } = buildTextChangeDiff(path, content, updated);

    await writeTextAtomically(path, updated, info.mode);

    return {
      content: [`Edited file: ${path}`, diff ? `\n${diff}` : "", `\n[${replaceAll ? "All " : ""}${occurrences} occurrence(s) replaced, ${changedLines} line(s) changed]`].join("\n"),
      isError: false,
      metadata: {
        filePath: path,
        operation: "edit",
        occurrences: replaceAll ? occurrences : 1,
        changedLines,
        created: false,
        diff,
      },
    };
  });
}
