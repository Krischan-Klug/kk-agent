import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { getDefaultPathForScope, resolveAccessScope, resolveFilesystemSystemConfig } from "../access-paths.js";
import { truncateSelfBoundedReadOutput } from "../read-output.js";
import { getCurrentSessionId } from "../user-interaction/interaction-store.js";
import {
  clearFilesystemReadState,
  getReadStateForSession,
  recordReadForSession,
  verifyReadStateForSession,
} from "./read-state.js";
import { getErrnoCode } from "../../../../lib/error.js";
import { globWithRipgrep, grepWithRipgrep, isRipgrepAvailable } from "./ripgrep.js";

const GLOB_RESULT_LIMIT = 250;
const GREP_RESULT_LIMIT = 250;
const READ_LINE_LIMIT = 2000;
const MAX_READ_BYTES_BEFORE_REJECT = 10 * 1024 * 1024; // 10 MB

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".svn", ".hg", ".jj"]);

const BINARY_EXTENSIONS = new Set([
  // images
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".svg",
  // pdfs
  ".pdf",
  // archives
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  // executables
  ".exe", ".dll", ".so", ".dylib", ".bin",
  // audio/video
  ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac", ".ogg", ".webm",
  // fonts
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  // other binaries
  ".wasm", ".class", ".pyc", ".o", ".obj",
]);

const BLOCKED_DEVICE_PATHS = new Set([
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/full",
  "/dev/stdin",
  "/dev/tty",
  "/dev/console",
]);

function isBlockedDevicePath(target: string): boolean {
  const normalized = target.replace(/\\/g, "/").toLowerCase();
  if (BLOCKED_DEVICE_PATHS.has(normalized)) return true;
  // proc fd paths: /proc/*/fd/0, /proc/*/fd/1, /proc/*/fd/2
  if (/^\/proc\/\d+\/fd\/[0-2]$/.test(normalized)) return true;
  return false;
}

function isBinaryByExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const check = buffer.subarray(0, 8192);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}

function detectImagePdf(filePath: string): "image" | "pdf" | "binary" | null {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico"].includes(ext)) return "image";
  return null;
}

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
  });
}

function getSessionIdOrThrow(): string {
  const sessionId = getCurrentSessionId();
  if (!sessionId) throw new Error("No active session context for filesystem tool.");
  return sessionId;
}

function detectLineEnding(content: string): "\n" | "\r\n" {
  const crlfCount = content.split("\r\n").length - 1;
  const lfCount = content.split("\n").length - 1;
  return crlfCount > lfCount / 2 ? "\r\n" : "\n";
}

function normalizeLineEndings(content: string, lineEnding: "\n" | "\r\n"): string {
  if (lineEnding === "\r\n") {
    return content.replace(/\r?\n/g, "\r\n");
  }
  return content.replace(/\r\n/g, "\n");
}

function generateUnifiedDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);
  // Simple line-based diff: find changed ranges
  const hunks: { startOld: number; countOld: number; startNew: number; countNew: number; lines: string[] }[] = [];

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
      continue;
    }

    const startOld = i;
    const startNew = j;
    const hunkLines: string[] = [];

    while (i < oldLines.length && j < newLines.length && oldLines[i] !== newLines[j]) {
      // Heuristic: look ahead to find next match
      let found = false;
      for (let a = i; a < Math.min(i + 5, oldLines.length); a++) {
        for (let b = j; b < Math.min(j + 5, newLines.length); b++) {
          if (oldLines[a] === newLines[b]) {
            for (let k = i; k < a; k++) hunkLines.push(`-${oldLines[k]}`);
            for (let k = j; k < b; k++) hunkLines.push(`+${newLines[k]}`);
            i = a;
            j = b;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        if (i < oldLines.length) {
          hunkLines.push(`-${oldLines[i]}`);
          i++;
        }
        if (j < newLines.length) {
          hunkLines.push(`+${newLines[j]}`);
          j++;
        }
      }
    }

    // Handle remaining old lines
    while (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
      hunkLines.push(`-${oldLines[i]}`);
      i++;
    }
    // Handle remaining new lines
    while (j < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[j])) {
      hunkLines.push(`+${newLines[j]}`);
      j++;
    }

    hunks.push({
      startOld: startOld + 1,
      countOld: i - startOld,
      startNew: startNew + 1,
      countNew: j - startNew,
      lines: hunkLines,
    });
  }

  if (hunks.length === 0) return "";

  const output = [`--- ${filePath}`, `+++ ${filePath}`];
  for (const hunk of hunks) {
    output.push(`@@ -${hunk.startOld},${hunk.countOld} +${hunk.startNew},${hunk.countNew} @@`);
    output.push(...hunk.lines);
  }
  return output.join("\n");
}

function countChangedLines(diff: string): number {
  return diff.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length;
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

    if (isBlockedDevicePath(path)) {
      return {
        content: `Cannot read blocked device path: ${path}`,
        isError: true,
        metadata: { filePath: path, operation: "read", blocked: true },
      };
    }

    const imagePdf = detectImagePdf(path);
    if (imagePdf) {
      return {
        content: `Cannot read ${imagePdf} file as text: ${path}. Use attachment tools or request the file in a different way.`,
        isError: true,
        metadata: { filePath: path, operation: "read", unsupportedType: imagePdf },
      };
    }

    if (isBinaryByExtension(path)) {
      return {
        content: `Cannot read binary file: ${path}`,
        isError: true,
        metadata: { filePath: path, operation: "read", binary: true },
      };
    }

    const info = await stat(path);
    if (info.size > MAX_READ_BYTES_BEFORE_REJECT) {
      return {
        content: `File is too large to read (${info.size} bytes): ${path}. Use a more targeted approach.`,
        isError: true,
        metadata: { filePath: path, operation: "read", tooLarge: true, size: info.size },
      };
    }

    const raw = await readFile(path, "utf-8");
    const lines = raw.split("\n");
    const total = lines.length;

    const offset = typeof args.offset === "number" ? Math.max(1, Math.floor(args.offset)) : 1;
    const limit = typeof args.limit === "number" ? Math.max(1, Math.floor(args.limit)) : READ_LINE_LIMIT;

    if (offset > total) {
      return {
        content: `File has ${total} lines, but offset ${offset} is beyond the end of the file.`,
        isError: false,
        metadata: { filePath: path, operation: "read", totalLines: total, offset },
      };
    }

    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const endLine = Math.min(offset - 1 + limit, total);
    const width = String(endLine).length;
    const numbered = slice.map((line, i) => `${String(offset + i).padStart(width)}\t${line}`).join("\n");
    const showingAll = offset === 1 && endLine >= total;
    const header = `${path}\n`;
    const footer = showingAll
      ? `\n[${total} lines total]`
      : `\n[Lines ${offset}-${endLine} of ${total}]\n\nWhen output is truncated, narrow the read with offset and limit.`;

    const fullOutput = header + numbered + footer;
    const truncated = truncateSelfBoundedReadOutput(fullOutput);
    const isTruncated = truncated !== fullOutput;

    await recordReadForSession(
      getSessionIdOrThrow(),
      path,
      info.mtimeMs,
      info.size,
      showingAll,
      offset,
      limit,
    );

    return {
      content: truncated,
      isError: false,
      metadata: {
        filePath: path,
        operation: "read",
        totalLines: total,
        startLine: offset,
        endLine,
        truncated: isTruncated,
      },
    };
  }

  if (toolName === "Edit") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.file_path);
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

    const existingInfo = await stat(path);
    const sessionId = getSessionIdOrThrow();
    const verify = await verifyReadStateForSession(sessionId, path, existingInfo.mtimeMs, existingInfo.size);
    if (!verify.allowed) {
      return {
        content: verify.reason!,
        isError: true,
        metadata: { filePath: path, operation: "edit", stale: true },
      };
    }

    const content = await readFile(path, "utf-8");

    if (isBinaryBuffer(Buffer.from(content, "utf-8"))) {
      return {
        content: `Cannot edit binary file: ${path}`,
        isError: true,
        metadata: { filePath: path, operation: "edit", binary: true },
      };
    }

    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) {
      // Provide a helpful excerpt strategy
      const excerptLength = Math.min(oldString.length + 40, 200);
      const excerpt = oldString.length > 60 ? oldString.slice(0, 60) + "..." : oldString;
      return {
        content: `old_string not found in file. The exact string was not found.\n\nHint: re-read the file to get the current content, then try again with the exact text.\n\nSearched for:\n${excerpt}`,
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

    const lineEnding = detectLineEnding(content);
    const normalizedNewString = normalizeLineEndings(newString, lineEnding);

    const updated = replaceAll
      ? content.split(oldString).join(normalizedNewString)
      : content.replace(oldString, normalizedNewString);

    const diff = generateUnifiedDiff(path, content, updated);
    const changedLines = countChangedLines(diff);

    await writeFile(path, updated, "utf-8");
    const updatedInfo = await stat(path);
    await recordReadForSession(sessionId, path, updatedInfo.mtimeMs, updatedInfo.size, true);

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
  }

  if (toolName === "Write") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.file_path);
    const contentToWrite = String(args.content ?? "");
    const sessionId = getSessionIdOrThrow();

    let existingContent: string | undefined;
    let existingInfo: import("node:fs").Stats | undefined;
    let isUpdate = false;

    try {
      existingInfo = await stat(path);
      isUpdate = true;
    } catch (error) {
      if (getErrnoCode(error) !== "ENOENT") throw error;
    }

    if (isUpdate && existingInfo) {
      const verify = await verifyReadStateForSession(sessionId, path, existingInfo.mtimeMs, existingInfo.size);
      if (!verify.allowed) {
        return {
          content: verify.reason!,
          isError: true,
          metadata: { filePath: path, operation: "write", stale: true },
        };
      }

      existingContent = await readFile(path, "utf-8");

      if (isBinaryBuffer(Buffer.from(existingContent, "utf-8"))) {
        return {
          content: `Cannot overwrite binary file: ${path}`,
          isError: true,
          metadata: { filePath: path, operation: "write", binary: true },
        };
      }
    }

    await mkdir(dirname(path), { recursive: true });

    let finalContent = contentToWrite;
    if (existingContent !== undefined) {
      const lineEnding = detectLineEnding(existingContent);
      finalContent = normalizeLineEndings(contentToWrite, lineEnding);
    }

    await writeFile(path, finalContent, "utf-8");
    const updatedInfo = await stat(path);
    await recordReadForSession(sessionId, path, updatedInfo.mtimeMs, updatedInfo.size, true);

    if (isUpdate && existingContent !== undefined) {
      const diff = generateUnifiedDiff(path, existingContent, finalContent);
      const changedLines = countChangedLines(diff);
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
  }

  if (toolName === "Glob") {
    const start = resolveWithinRoot(allowedRoot, basePath, args.path);
    const pattern = String(args.pattern ?? "").trim();
    if (!pattern) throw new Error("pattern is required");

    let results: string[] = [];
    let truncated = false;

    const useRipgrep = await isRipgrepAvailable();
    if (useRipgrep) {
      try {
        const rgResult = await globWithRipgrep({ root: start, pattern, limit: GLOB_RESULT_LIMIT });
        results = rgResult.paths.map((p) => resolve(start, p));
        truncated = rgResult.truncated;
      } catch {
        // fallback to JS traversal
        results = [];
      }
    }

    if (results.length === 0) {
      const manualResults: string[] = [];
      await walkForGlob(start, start, globToRegex(pattern), manualResults);
      results = manualResults;
      truncated = results.length >= GLOB_RESULT_LIMIT;
      if (truncated) results = results.slice(0, GLOB_RESULT_LIMIT);
    }

    const footer = truncated
      ? `\n\n[limit reached - showing first ${GLOB_RESULT_LIMIT} matches]`
      : "";

    return {
      content: (results.length ? results.join("\n") : "No files matched.") + footer,
      isError: false,
      metadata: {
        pattern,
        numFiles: results.length,
        truncated,
      },
    };
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
    const headLimitRaw = typeof args.head_limit === "number" ? Math.max(0, Math.floor(args.head_limit)) : GREP_RESULT_LIMIT;
    const headLimit = headLimitRaw === 0 ? Number.MAX_SAFE_INTEGER : headLimitRaw;
    const offset = typeof args.offset === "number" ? Math.max(0, Math.floor(args.offset)) : 0;

    let results: GrepMatch[] = [];
    let truncated = false;

    const useRipgrep = await isRipgrepAvailable();
    if (useRipgrep) {
      try {
        const rgResult = await grepWithRipgrep({
          root: start,
          pattern,
          glob,
          type,
          outputMode: (outputMode === "count" ? "content" : outputMode) as "content" | "files_with_matches",
          headLimit: outputMode === "files_with_matches" ? GLOB_RESULT_LIMIT : headLimit + offset,
          offset: 0,
          caseSensitive,
          multiline,
          maxResultBytes: 2_000_000,
        });
        results = rgResult.matches;
        truncated = rgResult.truncated;
      } catch {
        results = [];
      }
    }

    if (results.length === 0 && !useRipgrep) {
      const manualResults: GrepMatch[] = [];
      await walkForGrep(start, start, buildRegex(pattern, caseSensitive, multiline), glob, type, multiline, manualResults);
      results = manualResults;
      truncated = results.length >= GREP_RESULT_LIMIT;
      if (truncated) results = results.slice(0, GREP_RESULT_LIMIT);
    }

    if (results.length === 0) {
      return {
        content: "No matches found.",
        isError: false,
        metadata: { pattern, count: 0 },
      };
    }

    if (outputMode === "count") {
      return {
        content: String(results.length),
        isError: false,
        metadata: { pattern, count: results.length },
      };
    }

    if (outputMode === "files_with_matches") {
      const files = [...new Set(results.map((match) => match.file))];
      const sliced = files.slice(offset, offset + (headLimit === Number.MAX_SAFE_INTEGER ? files.length : headLimit));
      const footer =
        files.length > offset + sliced.length
          ? `\n\n[showing ${sliced.length} of ${files.length} matching files]`
          : "";
      return {
        content: sliced.join("\n") + footer,
        isError: false,
        metadata: {
          pattern,
          numFiles: sliced.length,
          totalFiles: files.length,
          truncated: files.length > offset + sliced.length,
        },
      };
    }

    const sliced = results.slice(offset, offset + (headLimit === Number.MAX_SAFE_INTEGER ? results.length : headLimit));
    const capped = sliced.map((match) => {
      const content = match.content.length > 500 ? match.content.slice(0, 500) + "..." : match.content;
      return `${match.file}:${match.line}: ${content}`;
    });
    const footer =
      results.length > offset + sliced.length
        ? `\n\n[showing ${sliced.length} of ${results.length} matches]`
        : "";

    return {
      content: capped.join("\n") + footer,
      isError: false,
      metadata: {
        pattern,
        count: sliced.length,
        totalMatches: results.length,
        truncated: results.length > offset + sliced.length,
      },
    };
  }

  return null;
}

