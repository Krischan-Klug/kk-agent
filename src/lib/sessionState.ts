import { getStoredBoolean, getStoredString, removeStoredValue, setStoredString } from "@/lib/storage";

const ACTIVE_SESSION_ID_KEY = "activeSessionId";
const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export function getActiveSessionId(): string | null {
  return getStoredString(ACTIVE_SESSION_ID_KEY);
}

export function setActiveSessionId(id: string): void {
  setStoredString(ACTIVE_SESSION_ID_KEY, id);
}

export function clearActiveSessionId(): void {
  removeStoredValue(ACTIVE_SESSION_ID_KEY);
}

export function getSidebarCollapsed(defaultValue = true): boolean {
  return getStoredBoolean(SIDEBAR_COLLAPSED_KEY, defaultValue);
}

export function setSidebarCollapsed(next: boolean): void {
  setStoredString(SIDEBAR_COLLAPSED_KEY, String(next));
}
