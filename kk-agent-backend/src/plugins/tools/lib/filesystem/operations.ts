import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { InternalToolDefinition, ToolCallResult } from "../../types.js";
import { getErrnoCode } from "../../../../lib/error.js";
import {
  ensureParentDirectory,
  isFilesystemRoot,
  withFileMutationLock,
  withFileMutationLocks,
} from "./mutation.js";
import {
  getFilesystemAllowedRoot,
  resolveFilesystemEntryPath,
  resolveFilesystemPath,
} from "./path-utils.js";

const LIST_LIMIT = 1_000;

function requiredPath(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty path.`);
  return value;
}

function isNestedPath(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

export async function executeList(config: InternalToolDefinition, args: Record<string, unknown>): Promise<ToolCallResult> {
  const root = await resolveFilesystemPath(config, args.path);
  const recursive = args.recursive === true;
  const requestedLimit = typeof args.limit === "number" ? Math.floor(args.limit) : 250;
  const limit = Math.min(LIST_LIMIT, Math.max(1, requestedLimit));
  const entries: string[] = [];

  const visit = async (directory: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      if (entries.length >= limit) return;
      const path = join(directory, child.name);
      const suffix = child.isDirectory() ? "/" : child.isSymbolicLink() ? " [symlink]" : "";
      entries.push(`${path}${suffix}`);
      if (recursive && child.isDirectory()) await visit(path);
    }
  };
  await visit(root);
  return {
    content: entries.length ? `${entries.join("\n")}${entries.length >= limit ? `\n\n[limit reached: ${limit}]` : ""}` : "Directory is empty.",
    isError: false,
    metadata: { operation: "list", path: root, count: entries.length, recursive, truncated: entries.length >= limit },
  };
}

export async function executeStat(config: InternalToolDefinition, args: Record<string, unknown>): Promise<ToolCallResult> {
  const path = await resolveFilesystemPath(config, requiredPath(args, "path"));
  const info = await stat(path);
  const kind = info.isFile() ? "file" : info.isDirectory() ? "directory" : "other";
  return {
    content: [
      `Path: ${path}`,
      `Type: ${kind}`,
      `Size: ${info.size} bytes`,
      `Modified: ${info.mtime.toISOString()}`,
      `Created: ${info.birthtime.toISOString()}`,
    ].join("\n"),
    isError: false,
    metadata: { operation: "stat", path, kind, size: info.size, modifiedAt: info.mtime.toISOString(), createdAt: info.birthtime.toISOString() },
  };
}

export async function executeMkdir(config: InternalToolDefinition, args: Record<string, unknown>): Promise<ToolCallResult> {
  const path = await resolveFilesystemPath(config, requiredPath(args, "path"));
  return withFileMutationLock(path, async () => {
    if (!isFilesystemRoot(path)) await mkdir(path, { recursive: args.recursive !== false });
    return { content: `Directory ready: ${path}`, isError: false, metadata: { operation: "mkdir", path } };
  });
}

export async function executeMove(config: InternalToolDefinition, args: Record<string, unknown>): Promise<ToolCallResult> {
  const source = await resolveFilesystemEntryPath(config, requiredPath(args, "source"));
  const destination = await resolveFilesystemEntryPath(config, requiredPath(args, "destination"));
  if (source === destination) throw new Error("source and destination resolve to the same path.");
  return withFileMutationLocks([source, destination], async () => {
    try {
      await stat(destination);
      throw new Error(`Destination already exists: ${destination}`);
    } catch (error) {
      if (getErrnoCode(error) !== "ENOENT") throw error;
    }
    await ensureParentDirectory(destination);
    await rename(source, destination);
    return { content: `Moved: ${source}\nTo: ${destination}`, isError: false, metadata: { operation: "move", source, destination } };
  });
}

export async function executeCopy(config: InternalToolDefinition, args: Record<string, unknown>): Promise<ToolCallResult> {
  const source = await resolveFilesystemEntryPath(config, requiredPath(args, "source"));
  const destination = await resolveFilesystemEntryPath(config, requiredPath(args, "destination"));
  if (source === destination) throw new Error("source and destination resolve to the same path.");

  return withFileMutationLocks([source, destination], async () => {
    const sourceInfo = await lstat(source);
    if (sourceInfo.isSymbolicLink()) {
      throw new Error("Copy does not follow symbolic links. Copy the resolved target explicitly.");
    }
    if (sourceInfo.isDirectory() && args.recursive !== true) {
      throw new Error("Copying a directory requires recursive=true.");
    }
    if (sourceInfo.isDirectory() && isNestedPath(source, destination)) {
      throw new Error("A directory cannot be copied into itself.");
    }
    try {
      await lstat(destination);
      throw new Error(`Destination already exists: ${destination}`);
    } catch (error) {
      if (getErrnoCode(error) !== "ENOENT") throw error;
    }

    await ensureParentDirectory(destination);
    const temporary = join(dirname(destination), `.${basename(destination)}.kk-agent-${randomUUID()}.copy`);
    try {
      await cp(source, temporary, {
        recursive: sourceInfo.isDirectory(),
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
      });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }).catch(() => undefined);
    }

    const kind = sourceInfo.isDirectory() ? "directory" : "file";
    return {
      content: `Copied ${kind}: ${source}\nTo: ${destination}`,
      isError: false,
      metadata: { operation: "copy", source, destination, kind },
    };
  });
}

export async function executeRemove(config: InternalToolDefinition, args: Record<string, unknown>): Promise<ToolCallResult> {
  const path = await resolveFilesystemEntryPath(config, requiredPath(args, "path"));
  const boundary = resolve(getFilesystemAllowedRoot(config));
  const normalize = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  if (isFilesystemRoot(path) || normalize(path) === normalize(boundary)) {
    throw new Error("Removing a filesystem root or configured access root is not allowed.");
  }

  return withFileMutationLock(path, async () => {
    const info = await lstat(path);
    const kind = info.isSymbolicLink() ? "symbolic link" : info.isDirectory() ? "directory" : "file";
    if (info.isDirectory() && args.recursive !== true) {
      throw new Error("Removing a directory requires recursive=true.");
    }
    await rm(path, {
      recursive: info.isDirectory(),
      force: false,
      maxRetries: 3,
      retryDelay: 50,
    });
    return {
      content: `Removed ${kind}: ${path}`,
      isError: false,
      metadata: { operation: "remove", path, kind, recursive: info.isDirectory() },
    };
  });
}
