export const SESSION_CHANGED_EVENT = "session-changed";
export const CHAT_DEBUG_TOGGLE_EVENT = "chat-debug-toggle";

type AppEventName =
  | typeof SESSION_CHANGED_EVENT
  | typeof CHAT_DEBUG_TOGGLE_EVENT;

export function emitAppEvent(name: AppEventName): void {
  window.dispatchEvent(new Event(name));
}

export function addAppEventListener(name: AppEventName, listener: () => void): () => void {
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
