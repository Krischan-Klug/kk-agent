import type { SessionRecord, SessionState } from "../types.js";
import * as store from "./store.js";
import { compactLlmRequestConfig } from "../../provider/lib/request-config.js";
import { NotFoundError } from "../../../lib/errors.js";

export function normalizeSessionRequestConfig<T extends { llmRequestConfig?: unknown }>(session: T): T {
  return {
    ...session,
    llmRequestConfig: compactLlmRequestConfig(session.llmRequestConfig as Parameters<typeof compactLlmRequestConfig>[0]),
  };
}

export function toPublicSession(session: SessionRecord): SessionState {
  const normalized = normalizeSessionRequestConfig(session);
  const { providerState: _providerState, ...publicSession } = normalized;
  return publicSession;
}

export function getSessionRecordOrThrow(id: string): SessionRecord {
  const session = store.getSession(id);
  if (!session) throw new NotFoundError("Session", id);
  return normalizeSessionRequestConfig(session);
}
