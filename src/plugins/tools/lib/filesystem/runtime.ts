import { homedir } from "node:os";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";

const SEARCH_LIMIT = 10;
const CONTENT_LIMIT = 12000;

function clamp(text: string, max = CONTENT_LIMIT): string {
  return text.length > max ? `${text.slice(0, max)}\n\n[truncated]` : text;
}

function getFilesystemRoot(config: McpServerConfig): string {
  return resolve(config.systemConfig?.rootPath ?? homedir());
}

function resolveWithinRoot(root: string, target?: unknown): string {
  const base = resolve(root);
  const candidate = typeof target === "string" && target.trim() ? resolve(base, target) : base;
  const rel = relative(base, candidate);
  if (rel.startsWith("..") || rel.includes("..\\") || rel.includes("../")) {
    throw new Error(`Path "${String(target ?? "")}" is outside the allowed root path`);
  }
  return candidate;
}

async function walkDirectory(root: string, pattern: string, results: string[]): Promise<void> {
  if (results.length >= SEARCH_LIMIT) return;
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= SEARCH_LIMIT) return;
    const fullPath = resolve(root, entry.name);
    if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
      results.push(fullPath);
    }
    if (entry.isDirectory()) {
      await walkDirectory(fullPath, pattern, results);
    }
  }
}

export async function executeFilesystemTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  const root = getFilesystemRoot(config);

  if (toolName === "read_file") {
    const path = resolveWithinRoot(root, args.path);
    const content = await readFile(path, "utf-8");
    return { content: clamp(content), isError: false };
  }

  if (toolName === "write_file") {
    const path = resolveWithinRoot(root, args.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, String(args.content ?? ""), "utf-8");
    return { content: `Datei geschrieben: ${path}`, isError: false };
  }

  if (toolName === "list_directory") {
    const path = resolveWithinRoot(root, args.path);
    const entries = await readdir(path, { withFileTypes: true });
    const content = entries.map((entry) => `${entry.isDirectory() ? "[dir]" : "[file]"} ${entry.name}`).join("\n");
    return { content: content || "[empty directory]", isError: false };
  }

  if (toolName === "search_files") {
    const start = resolveWithinRoot(root, args.path);
    const pattern = String(args.pattern ?? "").trim();
    if (!pattern) throw new Error("pattern is required");
    const results: string[] = [];
    await walkDirectory(start, pattern, results);
    return { content: results.length ? results.join("\n") : "No matches found.", isError: false };
  }

  if (toolName === "stat_path") {
    const path = resolveWithinRoot(root, args.path);
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
    const from = resolveWithinRoot(root, args.from);
    const to = resolveWithinRoot(root, args.to);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    return { content: `Moved path from ${from} to ${to}`, isError: false };
  }

  if (toolName === "delete_path") {
    const path = resolveWithinRoot(root, args.path);
    await rm(path, { recursive: true, force: false });
    return { content: `Deleted path: ${path}`, isError: false };
  }

  return null;
}
