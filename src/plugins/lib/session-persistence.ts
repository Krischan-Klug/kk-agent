/**
 * Shared per-session file persistence.
 *
 * Every session stores its data under `state/sessions/{sessionId}/`.
 * This module is the **single point of disk access** for per-session data.
 * When migrating to a database, only this module needs to be replaced.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getStateDirPath } from "./state.js";

const SESSIONS_ROOT = getStateDirPath("sessions");

function sessionDir(sessionId: string): string {
  return join(SESSIONS_ROOT, sessionId);
}

function sessionFilePath(sessionId: string, filename: string): string {
  return join(sessionDir(sessionId), filename);
}

/* ── Public API ── */

export async function ensureSessionsRoot(): Promise<void> {
  await mkdir(SESSIONS_ROOT, { recursive: true });
}

export async function loadSessionData<T>(sessionId: string, filename: string, defaults: T): Promise<T> {
  const filePath = sessionFilePath(sessionId, filename);
  if (!existsSync(filePath)) return defaults;
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return defaults;
  }
}

export async function saveSessionData<T>(sessionId: string, filename: string, data: T): Promise<void> {
  const dir = sessionDir(sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(sessionFilePath(sessionId, filename), JSON.stringify(data, null, 2), "utf-8");
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
