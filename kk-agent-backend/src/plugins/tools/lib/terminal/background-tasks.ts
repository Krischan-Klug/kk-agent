import { randomUUID } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AccessScope } from "../../types.js";
import type { TerminalShellProfile } from "./shell-profile.js";
import {
  spawnShellProcess,
  terminateProcessTree,
  waitForProcess,
  drainProcessOutput,
  closeProcessOutput,
  type ManagedShellProcess,
  type ProcessTermination,
} from "./process.js";

type TerminalTaskStatus =
  | "running"
  | "stopping"
  | "stopped"
  | "stop_failed"
  | "completed"
  | "failed"
  | "timed_out";

export interface TerminalTaskSnapshot {
  id: string;
  sessionId: string;
  command: string;
  cwd: string;
  status: TerminalTaskStatus;
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  stdoutPath: string;
  stderrPath: string;
  statusPath: string;
  accessScope: AccessScope;
  shell: TerminalShellProfile["kind"];
  shellVersion: string;
  error?: string;
  terminationMethod?: ProcessTermination["method"];
  terminationVerified?: boolean;
  terminationDurationMs?: number;
}

interface TerminalTaskRecord extends TerminalTaskSnapshot {
  processHandle: ManagedShellProcess;
  stdoutStream: WriteStream;
  stderrStream: WriteStream;
  stopRequested: boolean;
  timedOut: boolean;
  timeout?: NodeJS.Timeout;
  termination?: Promise<ProcessTermination>;
  settled: Promise<void>;
  writeQueue: Promise<void>;
  error?: string;
  terminationMethod?: ProcessTermination["method"];
  terminationVerified?: boolean;
  terminationDurationMs?: number;
}

const MAX_RETAINED_TASKS_PER_SESSION = 100;
const STOP_SETTLE_TIMEOUT_MS = 1_500;
const records = new Map<string, TerminalTaskRecord>();

function waitForStream(stream: WriteStream): Promise<void> {
  if (stream.writableFinished || stream.destroyed) return Promise.resolve();
  return new Promise((resolveStream) => {
    const finish = () => resolveStream();
    stream.once("finish", finish);
    stream.once("error", finish);
    stream.once("close", finish);
  });
}

function persistedStatus(record: TerminalTaskRecord): Record<string, unknown> {
  return {
    id: record.id,
    status: record.status,
    command: record.command,
    cwd: record.cwd,
    shell: record.shell,
    shellVersion: record.shellVersion,
    accessScope: record.accessScope,
    privilege: "current_user",
    startedAt: record.startedAt,
    stdoutPath: record.stdoutPath,
    stderrPath: record.stderrPath,
    ...(record.exitCode === undefined ? {} : { exitCode: record.exitCode }),
    ...(record.error ? { error: record.error } : {}),
    ...(record.terminationMethod ? { terminationMethod: record.terminationMethod } : {}),
    ...(record.terminationVerified === undefined ? {} : { terminationVerified: record.terminationVerified }),
    ...(record.terminationDurationMs === undefined ? {} : { terminationDurationMs: record.terminationDurationMs }),
    ...(record.status === "timed_out" ? { timedOut: true } : {}),
    ...(record.completedAt ? { completedAt: record.completedAt } : {}),
  };
}

function queueStatusWrite(record: TerminalTaskRecord): Promise<void> {
  const snapshot = JSON.stringify(persistedStatus(record), null, 2);
  record.writeQueue = record.writeQueue
    .catch(() => undefined)
    .then(async () => {
      const temporaryPath = `${record.statusPath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, snapshot, "utf8");
      await rename(temporaryPath, record.statusPath);
    });
  return record.writeQueue;
}

function terminate(record: TerminalTaskRecord): Promise<ProcessTermination> {
  record.termination ??= terminateProcessTree(record.processHandle);
  return record.termination;
}

function finishOutputStreams(record: TerminalTaskRecord): void {
  const { child } = record.processHandle;
  child.stdout?.unpipe(record.stdoutStream);
  child.stderr?.unpipe(record.stderrStream);
  closeProcessOutput(record.processHandle);
  if (!record.stdoutStream.writableEnded) record.stdoutStream.end();
  if (!record.stderrStream.writableEnded) record.stderrStream.end();
}

async function settleStoppedTask(record: TerminalTaskRecord): Promise<void> {
  const settled = await Promise.race([
    record.settled.then(() => true),
    new Promise<false>((resolveTimeout) => setTimeout(() => resolveTimeout(false), STOP_SETTLE_TIMEOUT_MS)),
  ]);
  if (settled) return;

  finishOutputStreams(record);
  record.status = "stop_failed";
  record.error = `Process did not report exit within ${STOP_SETTLE_TIMEOUT_MS}ms after verified containment termination.`;
  record.completedAt = new Date().toISOString();
  await queueStatusWrite(record).catch(() => undefined);
  pruneCompletedRecords(record.sessionId);
}

function pruneCompletedRecords(sessionId: string): void {
  const completed = [...records.values()]
    .filter((record) => record.sessionId === sessionId && !["running", "stopping"].includes(record.status))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  while (completed.length > MAX_RETAINED_TASKS_PER_SESSION) {
    const oldest = completed.shift();
    if (oldest) records.delete(oldest.id);
  }
}

function snapshot(record: TerminalTaskRecord): TerminalTaskSnapshot {
  return {
    id: record.id,
    sessionId: record.sessionId,
    command: record.command,
    cwd: record.cwd,
    status: record.status,
    startedAt: record.startedAt,
    ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    ...(record.exitCode === undefined ? {} : { exitCode: record.exitCode }),
    stdoutPath: record.stdoutPath,
    stderrPath: record.stderrPath,
    statusPath: record.statusPath,
    accessScope: record.accessScope,
    shell: record.shell,
    shellVersion: record.shellVersion,
    ...(record.error ? { error: record.error } : {}),
    ...(record.terminationMethod ? { terminationMethod: record.terminationMethod } : {}),
    ...(record.terminationVerified === undefined ? {} : { terminationVerified: record.terminationVerified }),
    ...(record.terminationDurationMs === undefined ? {} : { terminationDurationMs: record.terminationDurationMs }),
  };
}

export async function startBackgroundTerminalTask(input: {
  sessionId: string;
  profile: TerminalShellProfile;
  command: string;
  cwd: string;
  accessScope: AccessScope;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<TerminalTaskSnapshot> {
  const id = randomUUID();
  const taskDirectory = join(input.cwd, ".kk-agent-shell-tasks");
  await mkdir(taskDirectory, { recursive: true });

  const stdoutPath = join(taskDirectory, `${id}.stdout.txt`);
  const stderrPath = join(taskDirectory, `${id}.stderr.txt`);
  const statusPath = join(taskDirectory, `${id}.status.json`);
  const processHandle = await spawnShellProcess(input.profile, input.command, input.cwd, input.env);
  const { child } = processHandle;
  const stdoutStream = createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = createWriteStream(stderrPath, { flags: "a" });
  const completion = waitForProcess(processHandle);
  child.stdout?.pipe(stdoutStream);
  child.stderr?.pipe(stderrStream);

  const startedAt = new Date().toISOString();
  const record: TerminalTaskRecord = {
    id,
    sessionId: input.sessionId,
    command: input.command,
    cwd: input.cwd,
    status: "running",
    startedAt,
    stdoutPath,
    stderrPath,
    statusPath,
    accessScope: input.accessScope,
    shell: input.profile.kind,
    shellVersion: input.profile.version,
    processHandle,
    stdoutStream,
    stderrStream,
    stopRequested: false,
    timedOut: false,
    settled: Promise.resolve(),
    writeQueue: Promise.resolve(),
  };

  records.set(id, record);
  try {
    await queueStatusWrite(record);
  } catch (error) {
    record.stopRequested = true;
    await terminate(record);
    await completion;
    records.delete(id);
    throw error;
  }

  if (input.timeoutMs !== undefined) {
    record.timeout = setTimeout(() => {
      record.timedOut = true;
      void terminate(record);
    }, input.timeoutMs);
    record.timeout.unref();
  }

  record.settled = completion.then(async (result) => {
    if (record.timeout) clearTimeout(record.timeout);
    await drainProcessOutput(record.processHandle);
    finishOutputStreams(record);
    await Promise.all([waitForStream(stdoutStream), waitForStream(stderrStream)]);
    if (record.status === "stop_failed") return;
    const termination = await record.termination;
    record.terminationMethod = termination?.method;
    record.terminationVerified = termination?.success;
    record.terminationDurationMs = termination?.durationMs;
    record.exitCode = result.code;
    record.error = result.error?.message;
    if (termination && !termination.success) {
      record.error = termination.error;
    }
    record.status = termination && !termination.success
      ? "stop_failed"
      : record.stopRequested
        ? "stopped"
      : record.timedOut
        ? "timed_out"
        : result.code === 0
          ? "completed"
          : "failed";
    record.completedAt = new Date().toISOString();
    await queueStatusWrite(record).catch(() => undefined);
    pruneCompletedRecords(record.sessionId);
  });
  child.unref();

  return snapshot(record);
}

function getOwnedRecord(sessionId: string, taskId: string): TerminalTaskRecord | undefined {
  const record = records.get(taskId);
  return record?.sessionId === sessionId ? record : undefined;
}

export function getTerminalTask(sessionId: string, taskId: string): TerminalTaskSnapshot | null {
  const record = getOwnedRecord(sessionId, taskId);
  return record ? snapshot(record) : null;
}

export function listActiveTerminalTasks(sessionId: string): TerminalTaskSnapshot[] {
  return [...records.values()]
    .filter((record) => record.sessionId === sessionId && ["running", "stopping"].includes(record.status))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    .map(snapshot);
}

export async function stopTerminalTask(sessionId: string, taskId: string): Promise<TerminalTaskSnapshot | null> {
  const record = getOwnedRecord(sessionId, taskId);
  if (!record) return null;
  if (!["running", "stopping"].includes(record.status)) return snapshot(record);

  if (!record.stopRequested) {
    record.stopRequested = true;
    record.status = "stopping";
    await queueStatusWrite(record).catch(() => undefined);
    await terminate(record);
  }
  await settleStoppedTask(record);
  return snapshot(record);
}

export async function stopAllBackgroundTerminalTasks(): Promise<void> {
  const active = [...records.values()].filter((record) => ["running", "stopping"].includes(record.status));
  await Promise.allSettled(active.map(async (record) => {
    if (!record.stopRequested) {
      record.stopRequested = true;
      record.status = "stopping";
      await queueStatusWrite(record).catch(() => undefined);
      await terminate(record);
    }
    await settleStoppedTask(record);
  }));
}
