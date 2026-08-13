import { ConflictError } from "../../../lib/errors.js";

const activeRuns = new Map<string, AbortController>();

export function beginLoop(sessionId: string): AbortController {
  if (activeRuns.has(sessionId)) {
    throw new ConflictError(`Session "${sessionId}" already has an active run.`);
  }
  const controller = new AbortController();
  activeRuns.set(sessionId, controller);
  return controller;
}

export function abortLoop(sessionId: string): boolean {
  const controller = activeRuns.get(sessionId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function finishLoop(sessionId: string, controller: AbortController): void {
  if (activeRuns.get(sessionId) === controller) activeRuns.delete(sessionId);
}

export function isLoopActive(sessionId: string): boolean {
  return activeRuns.has(sessionId);
}
