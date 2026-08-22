import { extname, relative, resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { isBinaryBuffer } from "./path-utils.js";

export const GLOB_RESULT_LIMIT = 250;
export const GREP_RESULT_LIMIT = 250;

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".svn", ".hg", ".jj"]);

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegex(pattern: string): RegExp {
  let regex = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const next = pattern[i + 1];

    if (char === "*" && next === "*") {
      const after = pattern[i + 2];
      if (after === "/") {
        regex += "(?:.*\\/)?";
        i += 2;
        continue;
      }
      regex += ".*";
      i += 1;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    if (char === "{") {
      const closeIndex = pattern.indexOf("}", i);
      if (closeIndex > i) {
        const body = pattern.slice(i + 1, closeIndex);
        regex += `(?:${body.split(",").map((part) => escapeRegex(part.trim())).join("|")})`;
        i = closeIndex;
        continue;
      }
    }

    regex += escapeRegex(char);
  }
  regex += "$";
  return new RegExp(regex, "i");
}

export function buildRegex(pattern: string, caseSensitive = false, multiline = false): RegExp {
  const flags = `${caseSensitive ? "" : "i"}${multiline ? "m" : ""}`;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  }
}

async function walkDirectory(
  root: string,
  onEntry: (fullPath: string, entry: { isDirectory(): boolean; isFile(): boolean; name: string }) => Promise<boolean | void>,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = resolve(root, entry.name);
    if (entry.isFile()) {
      const shouldContinue = await onEntry(fullPath, entry);
      if (shouldContinue === false) return;
    }

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, onEntry, abortSignal);
    }
  }
}

export async function walkForGlob(
  root: string,
  rootBase: string,
  matcher: RegExp,
  results: string[],
  abortSignal?: AbortSignal,
): Promise<void> {
  await walkDirectory(root, async (fullPath) => {
    if (results.length >= GLOB_RESULT_LIMIT) return false;
    const relPath = relative(rootBase, fullPath).split("\\").join("/");
    if (matcher.test(relPath)) {
      results.push(fullPath);
    }
  }, abortSignal);
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export async function walkForGrep(
  root: string,
  rootBase: string,
  regex: RegExp,
  glob: string | undefined,
  type: string | undefined,
  multiline: boolean,
  results: GrepMatch[],
  abortSignal?: AbortSignal,
): Promise<void> {
  const globMatcher = glob ? globToRegex(glob) : null;

  await walkDirectory(root, async (fullPath, entry) => {
    if (results.length >= GREP_RESULT_LIMIT) return false;
    const relPath = relative(rootBase, fullPath).split("\\").join("/");
    if (globMatcher && !globMatcher.test(relPath)) return;
    if (type && extname(entry.name).replace(/^\./, "").toLowerCase() !== type.toLowerCase()) return;

    try {
      const buffer = await readFile(fullPath);
      if (isBinaryBuffer(buffer)) return;

      const text = buffer.toString("utf-8");
      if (multiline) {
        const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
        const iterator = text.matchAll(new RegExp(regex.source, flags));
        for (const match of iterator) {
          if (results.length >= GREP_RESULT_LIMIT) return false;
          const index = match.index ?? 0;
          const line = text.slice(0, index).split("\n").length;
          results.push({
            file: fullPath,
            line,
            content: match[0].split("\n").join("\\n"),
          });
        }
        return;
      }

      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= GREP_RESULT_LIMIT) return false;
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          results.push({ file: fullPath, line: i + 1, content: lines[i] });
        }
      }
    } catch {
      // ignore unreadable files
    }
  }, abortSignal);
}
