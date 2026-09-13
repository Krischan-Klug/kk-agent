import type { InternalToolDefinition, ToolCallResult } from "../../types.js";
import { resolveFilesystemPath, resolveFilesystemPathLexical } from "./path-utils.js";
import {
  buildTextChangeDiff,
  normalizeToExistingLineEndings,
  readExistingTextForMutation,
  withFileMutationLock,
  writeTextAtomically,
} from "./mutation.js";

interface TextEdit {
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

function parseEdits(args: Record<string, unknown>): TextEdit[] {
  if (Array.isArray(args.edits)) {
    if (args.edits.length === 0) throw new Error("edits must contain at least one replacement.");
    return args.edits.map((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`edits[${index}] must be an object.`);
      const edit = value as Record<string, unknown>;
      return {
        oldString: String(edit.old_string ?? ""),
        newString: String(edit.new_string ?? ""),
        replaceAll: edit.replace_all === true,
      };
    });
  }
  return [{
    oldString: String(args.old_string ?? ""),
    newString: String(args.new_string ?? ""),
    replaceAll: args.replace_all === true,
  }];
}

export async function executeEdit(
  config: InternalToolDefinition,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const requestedPath = resolveFilesystemPathLexical(config, args.file_path);
  const edits = parseEdits(args);
  const dryRun = args.dry_run === true;
  for (const [index, edit] of edits.entries()) {
    if (!edit.oldString) throw new Error(`Edit ${index + 1}: old_string is required and cannot be empty.`);
    if (edit.oldString === edit.newString) throw new Error(`Edit ${index + 1}: old_string and new_string are identical.`);
  }

  return withFileMutationLock(requestedPath, async () => {
    const path = await resolveFilesystemPath(config, args.file_path);
    const existing = await readExistingTextForMutation(path, "edit", "Cannot edit binary file");
    if (!existing.ok) return existing.result;
    const { content, info } = existing;
    let updated = content;
    let replacements = 0;
    for (const [index, edit] of edits.entries()) {
      const occurrences = updated.split(edit.oldString).length - 1;
      if (occurrences === 0) {
        const excerpt = edit.oldString.length > 60 ? `${edit.oldString.slice(0, 60)}...` : edit.oldString;
        return {
          content: `Edit ${index + 1}: old_string not found in the current file.\n\nSearched for:\n${excerpt}`,
          isError: true,
          metadata: { filePath: path, operation: "edit", editIndex: index, notFound: true },
        };
      }
      if (occurrences > 1 && !edit.replaceAll) {
        return {
          content: `Edit ${index + 1}: old_string found ${occurrences} times. Add more context or set replace_all=true.`,
          isError: true,
          metadata: { filePath: path, operation: "edit", editIndex: index, occurrences, replaceAll: false },
        };
      }
      const replacement = normalizeToExistingLineEndings(edit.newString, updated);
      updated = edit.replaceAll ? updated.split(edit.oldString).join(replacement) : updated.replace(edit.oldString, replacement);
      replacements += edit.replaceAll ? occurrences : 1;
    }
    const { diff, changedLines } = buildTextChangeDiff(path, content, updated);

    if (!dryRun) await writeTextAtomically(path, updated, info.mode);

    return {
      content: [`${dryRun ? "Previewed" : "Edited"} file: ${path}`, diff ? `\n${diff}` : "", `\n[${replacements} replacement(s), ${changedLines} line(s) changed${dryRun ? ", no file written" : ""}]`].join("\n"),
      isError: false,
      metadata: {
        filePath: path,
        operation: "edit",
        replacements,
        editCount: edits.length,
        changedLines,
        created: false,
        dryRun,
        diff,
      },
    };
  });
}
