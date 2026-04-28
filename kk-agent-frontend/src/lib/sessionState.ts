import { useSyncExternalStore } from "react";
import { getStoredBoolean, getStoredString, removeStoredValue, setStoredString } from "@/lib/storage";

const ACTIVE_SESSION_ID_KEY = "activeSessionId";
const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
const SESSION_STATE_EVENT = "kk-session-state-change";

function emitSessionStateChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_STATE_EVENT));
}

function subscribeSessionState(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(SESSION_STATE_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(SESSION_STATE_EVENT, handleChange);
  };
}

export function getActiveSessionId(): string | null {
  return getStoredString(ACTIVE_SESSION_ID_KEY);
}

export function setActiveSessionId(id: string): void {
  setStoredString(ACTIVE_SESSION_ID_KEY, id);
  emitSessionStateChange();
}

export function clearActiveSessionId(): void {
  removeStoredValue(ACTIVE_SESSION_ID_KEY);
  emitSessionStateChange();
}

function getSidebarCollapsed(defaultValue = true): boolean {
  return getStoredBoolean(SIDEBAR_COLLAPSED_KEY, defaultValue);
}

export function setSidebarCollapsed(next: boolean): void {
  setStoredString(SIDEBAR_COLLAPSED_KEY, String(next));
  emitSessionStateChange();
}

export function useStoredActiveSessionId(): string | null {
  return useSyncExternalStore(
    subscribeSessionState,
    getActiveSessionId,
    () => null,
  );
}

export function useStoredSidebarCollapsed(defaultValue = true): boolean {
  return useSyncExternalStore(
    subscribeSessionState,
    () => getSidebarCollapsed(defaultValue),
    () => defaultValue,
  );
}
