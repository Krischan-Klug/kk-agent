import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { getDefaultPathForScope, resolveAccessScope, resolveFilesystemSystemConfig } from "../access-paths.js";
import { truncateSelfBoundedReadOutput } from "../read-output.js";

const SEARCH_LIMIT = 50;
const GREP_RESULT_LIMIT = 50;
const READ_LINE_LIMIT = 200;
const LIST_ENTRY_LIMIT = 500;
const LIST_MAX_DEPTH = 5;

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function matchGlob(filename: string, pattern: string): boolean {
  // Simple glob: *.ts → endsWith(.ts), *.{ts,tsx} → endsWith(.ts) || endsWith(.tsx)
  const braceMatch = pattern.match(/^\*\.?\{(.+)\}$/);
  if (braceMatch) {
    const exts = braceMatch[1].split(",").map((e) => `.${e.trim()}`);
    return exts.some((ext) => filename.endsWith(ext));
  }
  if (pattern.startsWith("*.")) {
    return filename.endsWith(pattern.slice(1));
  }
  return filename.includes(pattern);
}

function isBinary(buffer: Buffer): boolean {
  const check = buffer.subarray(0, 512);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}

function buildRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
}

/* ── Walk helpers ── */

async function walkForSearch(
  root: string,
  pattern: string,
  typeFilter: string,
  results: string[],
): Promise<void> {
  if (results.length >= SEARCH_LIMIT) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= SEARCH_LIMIT) return;
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = resolve(root, entry.name);
    const matchesName = entry.name.toLowerCase().includes(pattern.toLowerCase());

    if (matchesName) {
      const isDir = entry.isDirectory();
      if (typeFilter === "all" || (typeFilter === "file" && !isDir) || (typeFilter === "directory" && isDir)) {
        results.push(fullPath);
      }
    }

    if (entry.isDirectory()) {
      await walkForSearch(fullPath, pattern, typeFilter, results);
    }
  }
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

async function walkForGrep(
  root: string,
  regex: RegExp,
  include: string | undefined,
  results: GrepMatch[],
): Promise<void> {
  if (results.length >= GREP_RESULT_LIMIT) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= GREP_RESULT_LIMIT) return;
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = resolve(root, entry.name);

    if (entry.isDirectory()) {
      await walkForGrep(fullPath, regex, include, results);
      continue;
    }

    if (!entry.isFile()) continue;
    if (include && !matchGlob(entry.name, include)) continue;

    try {
      const buffer = await readFile(fullPath);
      if (isBinary(buffer)) continue;

      const text = buffer.toString("utf-8");
      const lines = text.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (results.length >= GREP_RESULT_LIMIT) return;
        if (regex.test(lines[i])) {
          results.push({ file: fullPath, line: i + 1, content: lines[i] });
        }
      }
    } catch {
      // skip unreadable files
    }
  }
}

interface ListEntry {
  type: "dir" | "file";
  relPath: string;
  size?: number;
}

async function walkForList(
  root: string,
  prefix: string,
  depth: number,
  entries: ListEntry[],
): Promise<void> {
  if (entries.length >= LIST_ENTRY_LIMIT || depth > LIST_MAX_DEPTH) return;
  let dirEntries;
  try {
    dirEntries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of dirEntries) {
    if (entries.length >= LIST_ENTRY_LIMIT) return;
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = resolve(root, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      entries.push({ type: "dir", relPath: rel });
      await walkForList(fullPath, rel, depth + 1, entries);
    } else {
      try {
        const info = await stat(fullPath);
        entries.push({ type: "file", relPath: rel, size: info.size });
      } catch {
        entries.push({ type: "file", relPath: rel });
      }
    }
  }
}

/* ── Tool execution ── */

export async function executeFilesystemTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  const basePath = getFilesystemBasePath(config);
  const allowedRoot = getFilesystemAllowedRoot(config);

  if (toolName === "read_file") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.path);
    const raw = await readFile(path, "utf-8");
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

    return { content: truncateSelfBoundedReadOutput(numbered + footer), isError: false };
  }

  if (toolName === "edit_file") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.path);
    const oldString = String(args.old_string ?? "");
    const newString = String(args.new_string ?? "");
    if (!oldString) throw new Error("old_string is required");

    const content = await readFile(path, "utf-8");
    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) {
      throw new Error("old_string not found in file");
    }
    if (occurrences > 1) {
      throw new Error(`old_string found ${occurrences} times — must be unique. Add more surrounding context.`);
    }

    const updated = content.replace(oldString, newString);
    await writeFile(path, updated, "utf-8");
    return { content: `File edited: ${path}`, isError: false };
  }

  if (toolName === "write_file") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, String(args.content ?? ""), "utf-8");
    return { content: `File written: ${path}`, isError: false };
  }

  if (toolName === "grep") {
    const pattern = String(args.pattern ?? "").trim();
    if (!pattern) throw new Error("pattern is required");
    const start = resolveWithinRoot(allowedRoot, basePath, args.path);
    const include = typeof args.include === "string" ? args.include.trim() || undefined : undefined;

    const regex = buildRegex(pattern);
    const results: GrepMatch[] = [];
    await walkForGrep(start, regex, include, results);

    if (results.length === 0) {
      return { content: "No matches found.", isError: false };
    }

    // Group by file
    const grouped = new Map<string, GrepMatch[]>();
    for (const match of results) {
      const arr = grouped.get(match.file) ?? [];
      arr.push(match);
      grouped.set(match.file, arr);
    }

    const output: string[] = [];
    for (const [file, matches] of grouped) {
      for (const m of matches) {
        output.push(`${file}:${m.line}: ${m.content}`);
      }
    }

    const footer = results.length >= GREP_RESULT_LIMIT ? `\n\n[limit reached — showing first ${GREP_RESULT_LIMIT} matches]` : "";
    return { content: output.join("\n") + footer, isError: false };
  }

  if (toolName === "list_directory") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.path);
    const recursive = args.recursive === true;

    if (!recursive) {
      const dirEntries = await readdir(path, { withFileTypes: true });
      const lines: string[] = [];
      for (const entry of dirEntries) {
        if (entry.isDirectory()) {
          lines.push(`[dir]  ${entry.name}/`);
        } else {
          try {
            const info = await stat(resolve(path, entry.name));
            lines.push(`[file] ${formatSize(info.size).padEnd(8)} ${entry.name}`);
          } catch {
            lines.push(`[file]          ${entry.name}`);
          }
        }
      }
      return { content: lines.length ? lines.join("\n") : "[empty directory]", isError: false };
    }

    // Recursive — flat list with relative paths (unambiguous for LLM)
    const entries: ListEntry[] = [];
    await walkForList(path, "", 0, entries);

    const lines = entries.map((e) => {
      if (e.type === "dir") return `[dir]  ${e.relPath}/`;
      const size = e.size != null ? formatSize(e.size).padEnd(8) : "        ";
      return `[file] ${size} ${e.relPath}`;
    });

    const footer = entries.length >= LIST_ENTRY_LIMIT ? `\n\n[limit reached — ${LIST_ENTRY_LIMIT} entries shown]` : "";
    return { content: (lines.length ? lines.join("\n") : "[empty directory]") + footer, isError: false };
  }

  if (toolName === "search_files") {
    const start = resolveWithinRoot(allowedRoot, basePath, args.path);
    const pattern = String(args.pattern ?? "").trim();
    if (!pattern) throw new Error("pattern is required");
    const typeFilter = typeof args.type === "string" ? args.type : "all";

    const results: string[] = [];
    await walkForSearch(start, pattern, typeFilter, results);

    const footer = results.length >= SEARCH_LIMIT ? `\n\n[limit reached — showing first ${SEARCH_LIMIT} matches]` : "";
    return { content: (results.length ? results.join("\n") : "No matches found.") + footer, isError: false };
  }

  if (toolName === "stat_path") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.path);
    const info = await stat(path);
    return {
      content: JSON.stringify(
        {
          path,
          type: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other",
          size: info.size,
          createdAt: info.birthtime.toISOString(),
          modifiedAt: info.mtime.toISOString(),
        },
        null,
        2,
      ),
      isError: false,
    };
  }

  if (toolName === "move_path") {
    const from = resolveWithinRoot(allowedRoot, basePath, args.from);
    const to = resolveWithinRoot(allowedRoot, basePath, args.to);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    return { content: `Moved: ${from} → ${to}`, isError: false };
  }

  if (toolName === "delete_path") {
    const path = resolveWithinRoot(allowedRoot, basePath, args.path);
    await rm(path, { recursive: true, force: false });
    return { content: `Deleted: ${path}`, isError: false };
  }

  return null;
}
