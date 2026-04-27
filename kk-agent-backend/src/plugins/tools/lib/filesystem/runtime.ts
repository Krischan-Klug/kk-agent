import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { getDefaultPathForScope, resolveAccessScope, resolveFilesystemSystemConfig } from "../access-paths.js";
import { truncateSelfBoundedReadOutput } from "../read-output.js";
import { getCurrentSessionId } from "../user-interaction/interaction-store.js";
import { hasCurrentReadForSession, recordReadForSession } from "./read-state.js";
import { getErrnoCode } from "../../../../lib/error.js";

const GLOB_RESULT_LIMIT = 200;
const GREP_RESULT_LIMIT = 200;
const READ_LINE_LIMIT = 2000;

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__"]);

function getFilesystemBasePath(config: McpServerConfig): string {
  return resolveFilesystemSystemConfig(config.systemConfig).basePath ?? resolve("/");
}

function getFilesystemAllowedRoot(config: McpServerConfig): string {
  return getDefaultPathForScope(resolveAccessScope(config.systemConfig?.accessScope));
}

function normalizeRequestedPath(target: string): string {
  const trimmed = target.trim();
  if (/^[\\/][A-Za-z]:[\\/]/.test(trimmed)) {
    return trimmed.slice(1);
  }
  return trimmed;
}

function resolveWithinRoot(allowedRoot: string, basePath: string, target?: unknown): string {
  const base = resolve(basePath);
  const allowedBase = resolve(allowedRoot);
  const normalizedTarget = typeof target === "string" ? normalizeRequestedPath(target) : target;
  const candidate = typeof normalizedTarget === "string" && normalizedTarget ? resolve(base, normalizedTarget) : base;
  const normalizedBase = allowedBase.toLowerCase().endsWith(sep)
    ? allowedBase.toLowerCase()
    : `${allowedBase.toLowerCase()}${sep}`;
  const normalizedCandidate = candidate.toLowerCase();
  if (normalizedCandidate !== allowedBase.toLowerCase() && !normalizedCandidate.startsWith(normalizedBase)) {
    throw new Error(`Path "${String(target ?? "")}" is outside the allowed root path`);
  }
  return candidate;
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
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

function isBinary(buffer: Buffer): boolean {
  const check = buffer.subarray(0, 512);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}

function buildRegex(pattern: string, caseSensitive = false, multiline = false): RegExp {
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
): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = resolve(root, entry.name);
    if (entry.isFile()) {
      const shouldContinue = await onEntry(fullPath, entry);
      if (shouldContinue === false) return;
    }

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, onEntry);
    }
  }
}

async function walkForGlob(
  root: string,
  rootBase: string,
  matcher: RegExp,
  results: string[],
): Promise<void> {
  await walkDirectory(root, async (fullPath) => {
    if (results.length >= GLOB_RESULT_LIMIT) return false;
    const relPath = relative(rootBase, fullPath).split("\\").join("/");
    if (matcher.test(relPath)) {
      results.push(fullPath);
    }
  });
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

async function walkForGrep(
  root: string,
  rootBase: string,
  regex: RegExp,
  glob: string | undefined,
  type: string | undefined,
  multiline: boolean,
  results: GrepMatch[],
): Promise<void> {
  const globMatcher = glob ? globToRegex(glob) : null;

  await walkDirectory(root, async (fullPath, entry) => {
    if (results.length >= GREP_RESULT_LIMIT) return false;
    const relPath = relative(rootBase, fullPath).split("\\").join("/");
    if (globMatcher && !globMatcher.test(relPath)) return;
    if (type && extname(entry.name).replace(/^\./, "").toLowerCase() !== type.toLowerCase()) return;

    try {
      const buffer = await readFile(fullPath);
      if (isBinary(buffer)) return;

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
  });
}

function getSessionIdOrThrow(): string {
  const sessionId = getCurrentSessionId();
  if (!sessionId) throw new Error("No active session context for filesystem tool.");
  return sessionId;
}

function ensureReadBeforeMutating(path: string, modifiedAtMs: number): void {
  const sessionId = getSessionIdOrThrow();
  if (!hasCurrentReadForSession(sessionId, path, modifiedAtMs)) {
    throw new Error("This file has changed or has not been read in the current conversation. Use Read before editing or overwriting it.");
  }
}

export async function executeFilesystemTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  const basePath = getFilesystemBasePath(config);
  const allowedRoot = getFilesystemAllowedRoot(config);

  if (toolName === "Read") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.file_path);
    const raw = await readFile(path, "utf-8");
    const info = await stat(path);
    const lines = raw.split("\n");
    const total = lines.length;

    const offset = typeof args.offset === "number" ? Math.max(1, Math.floor(args.offset)) : 1;
    const limit = typeof args.limit === "number" ? Math.max(1, Math.floor(args.limit)) : READ_LINE_LIMIT;

    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const endLine = Math.min(offset - 1 + limit, total);
    const width = String(endLine).length;
    const numbered = slice.map((line, i) => `${String(offset + i).padStart(width)}\t${line}`).join("\n");
    const showingAll = offset === 1 && endLine >= total;
    const footer = showingAll ? "" : `\n\n[Lines ${offset}-${endLine} of ${total}]`;

    recordReadForSession(getSessionIdOrThrow(), path, info.mtimeMs);
    return { content: truncateSelfBoundedReadOutput(numbered + footer), isError: false };
  }

  if (toolName === "Edit") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.file_path);
    const oldString = String(args.old_string ?? "");
    const newString = String(args.new_string ?? "");
    const replaceAll = args.replace_all === true;
    if (!oldString) throw new Error("old_string is required");

    const existingInfo = await stat(path);
    ensureReadBeforeMutating(path, existingInfo.mtimeMs);
    const content = await readFile(path, "utf-8");
    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) throw new Error("old_string not found in file");
    if (occurrences > 1 && !replaceAll) {
      throw new Error(`old_string found ${occurrences} times. Add more context or set replace_all=true.`);
    }

    const updated = replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString);
    await writeFile(path, updated, "utf-8");
    const updatedInfo = await stat(path);
    recordReadForSession(getSessionIdOrThrow(), path, updatedInfo.mtimeMs);
    return { content: `Edited file: ${path}`, isError: false };
  }

  if (toolName === "Write") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.file_path);
    try {
      const existingInfo = await stat(path);
      ensureReadBeforeMutating(path, existingInfo.mtimeMs);
    } catch (error) {
      if (getErrnoCode(error) !== "ENOENT") throw error;
    }

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, String(args.content ?? ""), "utf-8");
    const updatedInfo = await stat(path);
    recordReadForSession(getSessionIdOrThrow(), path, updatedInfo.mtimeMs);
    return { content: `Wrote file: ${path}`, isError: false };
  }

  if (toolName === "Glob") {
    const start = resolveWithinRoot(allowedRoot, basePath, args.path);
    const pattern = String(args.pattern ?? "").trim();
    if (!pattern) throw new Error("pattern is required");

    const results: string[] = [];
    await walkForGlob(start, start, globToRegex(pattern), results);
    const footer = results.length >= GLOB_RESULT_LIMIT ? `\n\n[limit reached - showing first ${GLOB_RESULT_LIMIT} matches]` : "";
    return { content: (results.length ? results.join("\n") : "No files matched.") + footer, isError: false };
  }

  if (toolName === "Grep") {
    const pattern = String(args.pattern ?? "").trim();
    if (!pattern) throw new Error("pattern is required");

    const start = resolveWithinRoot(allowedRoot, basePath, args.path);
    const glob = typeof args.glob === "string" ? args.glob.trim() || undefined : undefined;
    const type = typeof args.type === "string" ? args.type.trim() || undefined : undefined;
    const outputMode =
      typeof args.output_mode === "string" && ["content", "files_with_matches", "count"].includes(args.output_mode)
        ? args.output_mode
        : "files_with_matches";
    const caseSensitive = args.case_sensitive === true;
    const multiline = args.multiline === true;
    const headLimit = typeof args.head_limit === "number" ? Math.max(1, Math.floor(args.head_limit)) : GREP_RESULT_LIMIT;
    const offset = typeof args.offset === "number" ? Math.max(0, Math.floor(args.offset)) : 0;

    const results: GrepMatch[] = [];
    await walkForGrep(start, start, buildRegex(pattern, caseSensitive, multiline), glob, type, multiline, results);

    if (results.length === 0) return { content: "No matches found.", isError: false };
    if (outputMode === "count") return { content: String(results.length), isError: false };

    const sliced = results.slice(offset, offset + headLimit);
    if (outputMode === "files_with_matches") {
      const files = [...new Set(sliced.map((match) => match.file))];
      const footer =
        results.length > offset + sliced.length
          ? `\n\n[showing ${files.length} of ${new Set(results.map((match) => match.file)).size} matching files]`
          : "";
      return { content: files.join("\n") + footer, isError: false };
    }

    const footer =
      results.length > offset + sliced.length ? `\n\n[showing ${sliced.length} of ${results.length} matches]` : "";
    return {
      content: sliced.map((match) => `${match.file}:${match.line}: ${match.content}`).join("\n") + footer,
      isError: false,
    };
  }

  return null;
}
