import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

const STATE_DIR = resolve("state");

async function ensureStateDir(): Promise<void> {
  if (!existsSync(STATE_DIR)) {
    await mkdir(STATE_DIR, { recursive: true });
  }
}

export async function loadState<T>(filename: string, defaults: T): Promise<T> {
  const filePath = join(STATE_DIR, filename);
  if (!existsSync(filePath)) return defaults;
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return defaults;
  }
}

export async function saveState<T>(filename: string, data: T): Promise<void> {
  await ensureStateDir();
  const filePath = join(STATE_DIR, filename);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function getStatePath(filename: string): string {
  return join(STATE_DIR, filename);
}

export { STATE_DIR };
