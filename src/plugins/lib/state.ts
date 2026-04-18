import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

const STATE_DIR = resolve("state");
const SESSIONS_ROOT = join(STATE_DIR, "sessions");

async function ensureStateDir(): Promise<void> {
  if (!existsSync(STATE_DIR)) {
    await mkdir(STATE_DIR, { recursive: true });
  }
}

export async function readJsonFile<T>(absolutePath: string): Promise<T | null> {
  if (!existsSync(absolutePath)) return null;
  try {
    const raw = await readFile(absolutePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to read JSON file '${absolutePath}':`, error);
    }
    return null;
  }
}

export async function writeJsonFile<T>(
  absolutePath: string,
  data: T,
  options: { trailingNewline?: boolean } = {},
): Promise<void> {
  await mkdir(dirname(absolutePath), { recursive: true });
  const body = JSON.stringify(data, null, 2);
  const content = options.trailingNewline ? `${body}\n` : body;
  await writeFile(absolutePath, content, "utf-8");
}

export async function loadState<T>(filename: string, defaults: T): Promise<T> {
  const value = await readJsonFile<T>(join(STATE_DIR, filename));
  return value ?? defaults;
}

export async function saveState<T>(filename: string, data: T): Promise<void> {
  await ensureStateDir();
  await writeJsonFile(join(STATE_DIR, filename), data);
}

export function getStatePath(filename: string): string {
  return join(STATE_DIR, filename);
}

export function getStateDirPath(...segments: string[]): string {
  return join(STATE_DIR, ...segments);
}

/* ── Per-session persistence (state/sessions/{id}/*.json) ── */

function sessionDir(sessionId: string): string {
  return join(SESSIONS_ROOT, sessionId);
}

function sessionFilePath(sessionId: string, filename: string): string {
  return join(sessionDir(sessionId), filename);
}

export async function ensureSessionsRoot(): Promise<void> {
  await mkdir(SESSIONS_ROOT, { recursive: true });
}

export async function loadSessionData<T>(sessionId: string, filename: string, defaults: T): Promise<T> {
  const value = await readJsonFile<T>(sessionFilePath(sessionId, filename));
  return value ?? defaults;
}

export async function saveSessionData<T>(sessionId: string, filename: string, data: T): Promise<void> {
  await writeJsonFile(sessionFilePath(sessionId, filename), data);
}

export async function deleteSessionData(sessionId: string): Promise<void> {
  const dir = sessionDir(sessionId);
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function listPersistedSessionIds(): Promise<string[]> {
  if (!existsSync(SESSIONS_ROOT)) return [];
  try {
    const entries = await readdir(SESSIONS_ROOT, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export { STATE_DIR };
