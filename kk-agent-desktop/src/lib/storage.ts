function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function getStoredString(key: string): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(key);
}

export function setStoredString(key: string, value: string): void {
  if (!canUseStorage()) return;
  localStorage.setItem(key, value);
}

export function removeStoredValue(key: string): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(key);
}

export function getStoredBoolean(key: string, defaultValue: boolean): boolean {
  const stored = getStoredString(key);
  return stored === null ? defaultValue : stored === "true";
}
