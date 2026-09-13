import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { getStateDirPath } from "../../lib/state.js";
import {
  attachProcessContainment,
  terminateProcessTree,
  waitForProcess,
  type ManagedShellProcess,
} from "../../tools/lib/terminal/process.js";

const DOCLING_VERSION = "2.126.0";
const LANCEDB_VERSION = "0.38.0";
const SENTENCE_TRANSFORMERS_VERSION = "6.0.1";
const STRIPRTF_VERSION = "0.0.29";
const WORKER_START_TIMEOUT_MS = 5 * 60 * 1_000;
const INGEST_TIMEOUT_MS = 10 * 60 * 1_000;
const SEARCH_TIMEOUT_MS = 2 * 60 * 1_000;
const MAX_DIAGNOSTIC_CHARS = 64_000;

export interface RetrievalMatch {
  index: number;
  locator: string;
  text: string;
  headings: string[];
  pages: number[];
  score: number;
}

export interface DocumentIngestResult {
  textAvailable: boolean;
  chunkCount: number;
  pageCount: number;
  embeddingModel: string;
}

interface WorkerEnvelope<T = unknown> {
  type?: "ready" | "result";
  protocolVersion?: number;
  id?: string;
  ok?: boolean;
  result?: T;
  error?: string;
  traceback?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface RetrievalWorker {
  child: ChildProcess;
  processHandle: ManagedShellProcess;
  pending: Map<string, PendingRequest>;
  diagnostics: () => string;
  call: <T>(payload: Record<string, unknown>, timeoutMs: number) => Promise<T>;
  stop: () => Promise<void>;
}

let workerPromise: Promise<RetrievalWorker> | undefined;
let workerGeneration = 0;
let requestTail: Promise<void> = Promise.resolve();

export function shouldDetachRetrievalWorker(platform: NodeJS.Platform = process.platform): boolean {
  return platform !== "win32";
}

function appendDiagnostic(current: string, chunk: string): string {
  return (current + chunk).slice(-MAX_DIAGNOSTIC_CHARS);
}

function resolveRuntimeFile(filename: string): string | undefined {
  const entryDirectory = dirname(resolve(process.argv[1] ?? process.cwd()));
  return [
    join(entryDirectory, "runtime", filename),
    join(process.cwd(), "runtime", filename),
    join(process.cwd(), "kk-agent-backend", "runtime", filename),
  ].map((candidate) => resolve(candidate)).find(existsSync);
}

function resolveUvxExecutable(): string {
  const entryDirectory = dirname(resolve(process.argv[1] ?? process.cwd()));
  const filename = process.platform === "win32" ? "uvx.exe" : "uvx";
  const bundled = [
    process.env.KK_AGENT_UVX_PATH,
    join(entryDirectory, "uv", filename),
    join(process.cwd(), "managed-runtimes", "uv", filename),
    join(process.cwd(), "kk-agent-backend", "managed-runtimes", "uv", filename),
  ].filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => resolve(candidate))
    .find(existsSync);
  return bundled ?? "uvx";
}

function workerError(message: string, diagnostics: string): Error {
  return new Error([message, diagnostics.trim()].filter(Boolean).join("\n\n"));
}

async function createRetrievalWorker(): Promise<RetrievalWorker> {
  const generation = ++workerGeneration;
  const script = resolveRuntimeFile("rag-worker.py");
  if (!script) throw new Error("Bundled RAG worker script was not found.");
  const cacheRoot = getStateDirPath("rag-runtime");
  await mkdir(cacheRoot, { recursive: true });
  const child = spawn(resolveUvxExecutable(), [
    "--from", `docling==${DOCLING_VERSION}`,
    "--with", `lancedb==${LANCEDB_VERSION}`,
    "--with", `sentence-transformers==${SENTENCE_TRANSFORMERS_VERSION}`,
    "--with", `striprtf==${STRIPRTF_VERSION}`,
    "python", script,
  ], {
    cwd: dirname(script),
    detached: shouldDetachRetrievalWorker(),
    windowsHide: true,
    shell: false,
    env: {
      ...process.env,
      HF_HOME: join(cacheRoot, "huggingface"),
      UV_CACHE_DIR: join(cacheRoot, "uv"),
      HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
      TOKENIZERS_PARALLELISM: "false",
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      UV_NO_PROGRESS: "1",
      NO_COLOR: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutDiagnostics = "";
  let stderrDiagnostics = "";
  const pending = new Map<string, PendingRequest>();
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  let readySettled = false;
  const ready = new Promise<void>((resolveReady, rejectReady) => {
    readyResolve = resolveReady;
    readyReject = rejectReady;
  });
  const lines = createInterface({ input: child.stdout! });
  const diagnostics = () => [stderrDiagnostics.trim(), stdoutDiagnostics.trim()].filter(Boolean).join("\n");

  lines.on("line", (line) => {
    if (!line.startsWith("KK_RAG ")) {
      stdoutDiagnostics = appendDiagnostic(stdoutDiagnostics, `${line}\n`);
      return;
    }
    try {
      const response = JSON.parse(line.slice("KK_RAG ".length)) as WorkerEnvelope;
      if (response.type === "ready") {
        if (response.protocolVersion !== 1) {
          readyReject(new Error(`Unsupported RAG worker protocol ${String(response.protocolVersion)}.`));
        } else {
          readyResolve();
        }
        return;
      }
      if (response.type !== "result" || !response.id) return;
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (response.ok) request.resolve(response.result);
      else request.reject(workerError(response.error ?? "RAG worker request failed.", response.traceback ?? diagnostics()));
    } catch (error) {
      stdoutDiagnostics = appendDiagnostic(stdoutDiagnostics, `${line}\n`);
      const failure = workerError(`Invalid RAG worker response: ${error instanceof Error ? error.message : String(error)}`, diagnostics());
      for (const request of pending.values()) request.reject(failure);
      pending.clear();
    }
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderrDiagnostics = appendDiagnostic(stderrDiagnostics, chunk);
  });
  child.stdin?.on("error", (error) => {
    const failure = workerError(`RAG worker input failed: ${error.message}`, diagnostics());
    readyReject(failure);
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
  });

  const processHandle = await attachProcessContainment(child);
  const completion = waitForProcess(processHandle);
  void completion.then((result) => {
    const failure = workerError(result.error?.message ?? `RAG worker exited with code ${result.code}.`, diagnostics());
    readyReject(failure);
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
    if (workerGeneration === generation) workerPromise = undefined;
  });

  const startupTimeout = setTimeout(() => {
    readyReject(workerError(`RAG worker did not start within ${WORKER_START_TIMEOUT_MS}ms.`, diagnostics()));
  }, WORKER_START_TIMEOUT_MS);
  try {
    await ready;
    readySettled = true;
  } catch (error) {
    await terminateProcessTree(processHandle).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(startupTimeout);
  }

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.stdin?.write(`${JSON.stringify({ action: "shutdown" })}\n`);
    }
    await Promise.race([completion, new Promise<void>((resolveWait) => setTimeout(resolveWait, 250))]);
    if (child.exitCode === null && child.signalCode === null) {
      await terminateProcessTree(processHandle).catch(() => undefined);
    }
  };

  const call = async <T>(payload: Record<string, unknown>, timeoutMs: number): Promise<T> => {
    if (!readySettled || stopped) throw workerError("RAG worker is not running.", diagnostics());
    const id = randomUUID();
    const response = new Promise<T>((resolveResponse, rejectResponse) => {
      pending.set(id, {
        resolve: (value) => resolveResponse(value as T),
        reject: rejectResponse,
      });
    });
    if (!child.stdin || child.stdin.destroyed || child.stdin.writableEnded) {
      pending.delete(id);
      throw workerError("RAG worker input stream is unavailable.", diagnostics());
    }
    child.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(workerError(`RAG worker request exceeded ${timeoutMs}ms.`, diagnostics())), timeoutMs);
    });
    try {
      return await Promise.race([response, timeout]);
    } catch (error) {
      pending.delete(id);
      await stop();
      workerPromise = undefined;
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  return { child, processHandle, pending, diagnostics, call, stop };
}

async function serializedCall<T>(payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const previous = requestTail;
  let release!: () => void;
  const current = new Promise<void>((resolveRelease) => { release = resolveRelease; });
  requestTail = previous.catch(() => undefined).then(() => current);
  await previous.catch(() => undefined);
  try {
    workerPromise ??= createRetrievalWorker();
    return await (await workerPromise).call<T>(payload, timeoutMs);
  } finally {
    release();
  }
}

export function ingestDocumentWithRag(
  sourcePath: string,
  assetDirectory: string,
  plainText: boolean,
): Promise<DocumentIngestResult> {
  return serializedCall<DocumentIngestResult>({
    action: "ingest",
    sourcePath,
    assetDir: assetDirectory,
    plainText,
  }, INGEST_TIMEOUT_MS);
}

export async function searchDocumentWithRag(assetDirectory: string, query: string, limit: number): Promise<RetrievalMatch[]> {
  const response = await serializedCall<{ matches: RetrievalMatch[] }>({
    action: "search",
    assetDir: assetDirectory,
    query,
    limit,
  }, SEARCH_TIMEOUT_MS);
  return response.matches;
}

export async function stopRetrievalWorker(): Promise<void> {
  const worker = workerPromise;
  workerPromise = undefined;
  if (worker) await worker.then((active) => active.stop()).catch(() => undefined);
}
