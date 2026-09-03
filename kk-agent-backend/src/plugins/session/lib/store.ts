import type { SessionContextState, TranscriptMessage } from "kk-agent-contract";
import { createLogger } from "../../../lib/logger.js";
import { getErrorMessage } from "../../../lib/error.js";
import { NotFoundError } from "../../../lib/errors.js";
import {
  deleteSessionData,
  ensureSessionsRoot,
  listPersistedSessionIds,
  loadSessionData,
  saveSessionData,
} from "../../lib/state.js";
import { ensureSessionFactsLoaded } from "../../tools/lib/memory-state.js";
import { ensureTasksLoaded } from "../../tools/lib/task-state.js";
import { getAgent } from "../../agent/service.js";
import { getEnabledAgentModes } from "../../agent/lib/mode-config.js";
import type { PersistedAgentRun, SessionRecord, SessionState } from "../types.js";

const logger = createLogger("session/store");
const SESSION_FILE = "session.json";
const SESSION_SCHEMA_VERSION = 9;

const sessions = new Map<string, SessionRecord>();

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCompatibleContextState(value: unknown): value is SessionContextState {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<SessionContextState>;
  if (!isFiniteNonNegativeNumber(context.consecutiveCompactionFailures)) return false;
  if (context.usage) {
    if (
      !isFiniteNonNegativeNumber(context.usage.limitTokens)
      || !isFiniteNonNegativeNumber(context.usage.inputTokens)
      || !isFiniteNonNegativeNumber(context.usage.outputTokens)
      || !isFiniteNonNegativeNumber(context.usage.reasoningTokens)
      || !isFiniteNonNegativeNumber(context.usage.usedTokens)
      || !isFiniteNonNegativeNumber(context.usage.remainingTokens)
      || !["provider", "estimated", "unknown"].includes(context.usage.source)
      || typeof context.usage.updatedAt !== "string"
    ) return false;
  }
  if (context.activeCompaction) {
    if (
      typeof context.activeCompaction.id !== "string"
      || typeof context.activeCompaction.summary !== "string"
      || typeof context.activeCompaction.throughMessageId !== "string"
      || !isFiniteNonNegativeNumber(context.activeCompaction.beforeTokens)
      || !isFiniteNonNegativeNumber(context.activeCompaction.afterTokens)
      || typeof context.activeCompaction.createdAt !== "string"
    ) return false;
  }
  return true;
}

function isCompatibleSession(value: unknown, id: string): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<SessionRecord>;
  return session.schemaVersion === SESSION_SCHEMA_VERSION
    && session.id === id
    && typeof session.name === "string"
    && typeof session.providerId === "string"
    && typeof session.model === "string"
    && typeof session.agentId === "string"
    && typeof session.activeModeId === "string"
    && (session.approvalMode === "ask_approval" || session.approvalMode === "full_access")
    && isStringArray(session.activeToolIds)
    && isStringArray(session.activeMcpIds)
    && isStringArray(session.activeSkillIds)
    && isStringArray(session.loadedSkillIds)
    && Array.isArray(session.messages)
    && Array.isArray(session.runs)
    && session.runs.every((run) => Array.isArray(run.modelInputs))
    && Array.isArray(session.assets)
    && isCompatibleContextState(session.contextState)
    && typeof session.createdAt === "string"
    && typeof session.updatedAt === "string";
}

function abortInterruptedRuns(
  runs: PersistedAgentRun[],
  messages: TranscriptMessage[],
  sessionId: string,
  timestamp = new Date().toISOString(),
): { runs: PersistedAgentRun[]; changed: boolean } {
  const anchorMessageId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" || message.role === "user")?.id;
  let changed = false;
  const reconciled = runs.map((run) => {
    if (run.status !== "running") return run;
    changed = true;
    return {
      ...run,
      status: "aborted" as const,
      updatedAt: timestamp,
      completedAt: timestamp,
      events: [...run.events, {
        id: crypto.randomUUID(),
        runId: run.id,
        sessionId,
        anchorMessageId: anchorMessageId ?? run.userMessageId,
        kind: "run_aborted" as const,
        severity: "warning" as const,
        visibility: "user" as const,
        terminal: true,
        errorCategory: "abort" as const,
        code: "process_interrupted",
        message: "Run was interrupted before completion. The last committed checkpoint was preserved.",
        step: run.step,
        attempt: run.attempt,
        createdAt: timestamp,
      }],
    };
  });
  return { runs: reconciled, changed };
}

async function persistSession(session: SessionRecord): Promise<void> {
  await saveSessionData(session.id, SESSION_FILE, structuredClone(session));
}

export async function initStore(): Promise<void> {
  sessions.clear();
  await ensureSessionsRoot();

  for (const id of await listPersistedSessionIds()) {
    try {
      const stored = await loadSessionData<unknown>(id, SESSION_FILE, null);
      if (!isCompatibleSession(stored, id)) {
        logger.warn(`Deleting incompatible session "${id}".`);
        await deleteSessionData(id);
        continue;
      }
      const agent = getAgent(stored.agentId);
      if (!getEnabledAgentModes(agent).some((mode) => mode.id === stored.activeModeId)) {
        logger.warn(`Deleting session "${id}" with an unavailable mode.`);
        await deleteSessionData(id);
        continue;
      }

      const interrupted = abortInterruptedRuns(stored.runs, stored.messages, id);
      const session = interrupted.changed ? { ...stored, runs: interrupted.runs } : stored;
      sessions.set(id, session);
      if (interrupted.changed) await persistSession(session);
      await ensureTasksLoaded(id);
      await ensureSessionFactsLoaded(id);
    } catch (error) {
      logger.warn(`Deleting unreadable session "${id}":`, getErrorMessage(error));
      sessions.delete(id);
      await deleteSessionData(id).catch(() => undefined);
    }
  }

  logger.info(`Loaded ${sessions.size} session(s) from disk.`);
}

export async function createSession(data: {
  agentId: string;
  providerId: string;
  model: string;
  activeModeId: SessionState["activeModeId"];
  approvalMode: SessionState["approvalMode"];
  activeToolIds: string[];
  activeMcpIds: string[];
  activeSkillIds: string[];
  llmRequestConfig?: SessionState["llmRequestConfig"];
}): Promise<SessionRecord> {
  const now = new Date().toISOString();
  const session: SessionRecord = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: "",
    providerId: data.providerId,
    model: data.model,
    agentId: data.agentId,
    activeModeId: data.activeModeId,
    approvalMode: data.approvalMode,
    activeToolIds: data.activeToolIds,
    activeMcpIds: data.activeMcpIds,
    activeSkillIds: data.activeSkillIds,
    llmRequestConfig: data.llmRequestConfig,
    messages: [],
    runs: [],
    assets: [],
    contextState: { consecutiveCompactionFailures: 0 },
    loadedSkillIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await persistSession(session);
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): SessionRecord | undefined {
  return sessions.get(id);
}

export async function updateSession(id: string, update: Partial<SessionRecord>): Promise<SessionRecord> {
  const session = sessions.get(id);
  if (!session) throw new NotFoundError("Session", id);
  const next: SessionRecord = {
    ...session,
    ...structuredClone(update),
    schemaVersion: SESSION_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await persistSession(next);
  sessions.set(id, next);
  return next;
}

export async function deleteSession(id: string): Promise<boolean> {
  if (!sessions.has(id)) return false;
  await deleteSessionData(id);
  sessions.delete(id);
  return true;
}

export function listSessions(): SessionRecord[] {
  return [...sessions.values()];
}
