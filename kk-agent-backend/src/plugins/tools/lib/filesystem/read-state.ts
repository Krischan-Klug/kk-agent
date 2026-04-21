const readState = new Map<string, Map<string, number>>();

function normalizeKey(path: string): string {
  return path.toLowerCase();
}

function getSessionBucket(sessionId: string): Map<string, number> {
  const existing = readState.get(sessionId);
  if (existing) return existing;
  const created = new Map<string, number>();
  readState.set(sessionId, created);
  return created;
}

export function recordReadForSession(sessionId: string, path: string, modifiedAtMs: number): void {
  getSessionBucket(sessionId).set(normalizeKey(path), modifiedAtMs);
}

export function hasCurrentReadForSession(sessionId: string, path: string, modifiedAtMs: number): boolean {
  return getSessionBucket(sessionId).get(normalizeKey(path)) === modifiedAtMs;
}

export function clearFilesystemReadState(sessionId: string): void {
  readState.delete(sessionId);
}
