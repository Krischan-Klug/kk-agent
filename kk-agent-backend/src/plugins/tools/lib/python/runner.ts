import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { getStateDirPath } from "../../../lib/state.js";
import {
  attachProcessContainment,
  terminateProcessTree,
  waitForProcess,
  type ManagedShellProcess,
} from "../terminal/process.js";
import { PYTHON_DEFAULT_TIMEOUT_SECONDS, PYTHON_MAX_TIMEOUT_SECONDS } from "./config.js";

const MAX_CODE_CHARS = 20_000;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_PROTOCOL_BYTES = 32 * 1024 * 1024;
const MAX_PERSISTENT_SANDBOXES = 3;
const SANDBOX_IDLE_TTL_MS = 10 * 60 * 1_000;
const SANDBOX_START_TIMEOUT_MS = 45_000;

const CURATED_WHEELS: Record<string, string> = {
  trimesh: "https://files.pythonhosted.org/packages/f5/c8/5ede3b786ef58e0076e9ca748b2c1787183f85e5ad8133373715c31248f9/trimesh-5.1.0-py3-none-any.whl#sha256=0fa85d1d131e321b683c00747c20090200b92071298b905ea588f609eb204c89",
};

const CURATED_PACKAGE_IMPORTS: Record<string, string> = {
  trimesh: "trimesh",
};

let catalogImportMap: { directory: string; imports: ReadonlyMap<string, string> } | undefined;

const PYTHON_EXECUTOR = String.raw`
import ast as _kk_ast

def _kk_execute(code, scope, input_files):
    scope["INPUT_FILES"] = dict(input_files)
    tree = _kk_ast.parse(code, filename="<agent-python>", mode="exec")
    result = None
    if tree.body and isinstance(tree.body[-1], _kk_ast.Expr):
        prefix = _kk_ast.Module(body=tree.body[:-1], type_ignores=[])
        if prefix.body:
            exec(compile(prefix, "<agent-python>", "exec"), scope, scope)
        final = _kk_ast.Expression(body=tree.body[-1].value)
        result = eval(compile(final, "<agent-python>", "eval"), scope, scope)
    else:
        exec(compile(tree, "<agent-python>", "exec"), scope, scope)
    return repr(result) if result is not None else None
`;

const PYTHON_WORKER_SOURCE = `
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { basename, join } from "node:path";

const hostProcess = process;
const pyodideDir = hostProcess.argv[1];
const cacheDir = hostProcess.argv[2];
const packageBaseUrl = hostProcess.argv[3];
const protocol = (body) => writeFileSync(3, JSON.stringify(body) + "\\n");
const lines = createInterface({ input: hostProcess.stdin, crlfDelay: Infinity });
const iterator = lines[Symbol.asyncIterator]();

const append = (parts, value) => {
  const current = parts.reduce((sum, part) => sum + part.length, 0);
  if (current >= 64000) return;
  parts.push(String(value).slice(0, 64000 - current));
};

const resetDirectory = (FS, directory) => {
  try {
    for (const name of FS.readdir(directory)) {
      if (name === "." || name === "..") continue;
      const path = directory + "/" + name;
      const stat = FS.stat(path);
      if (FS.isDir(stat.mode)) {
        resetDirectory(FS, path);
        FS.rmdir(path);
      } else {
        FS.unlink(path);
      }
    }
  } catch {
    FS.mkdirTree(directory);
  }
};

try {
  const first = await iterator.next();
  if (first.done || JSON.parse(first.value).type !== "bootstrap") throw new Error("Python worker bootstrap was not received");
  const moduleUrl = pathToFileURL(join(pyodideDir, "pyodide.mjs")).href;
  const { loadPyodide } = await import(moduleUrl);
  const sandboxGlobals = Object.freeze(Object.create(null));
  const startupStderr = [];
  const pyodide = await loadPyodide({
    indexURL: pyodideDir + "/",
    packageCacheDir: cacheDir,
    packageBaseUrl,
    jsglobals: sandboxGlobals,
    stdout: () => {},
    stderr: (value) => append(startupStderr, value + "\\n"),
  });
  pyodide.FS.mkdirTree("/input");
  pyodide.FS.mkdirTree("/output");
  pyodide.FS.mkdirTree("/workspace");
  const internalScope = pyodide.runPython("{}");
  const userScope = pyodide.runPython("{'__name__': '__main__'}");
  pyodide.runPython(${JSON.stringify(PYTHON_EXECUTOR)}, { globals: internalScope });
  const installedWheels = new Set();
  protocol({ type: "ready", stderr: startupStderr.join("") });

  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    let payload;
    try {
      payload = JSON.parse(next.value);
    } catch (error) {
      protocol({ type: "fatal", error: "Invalid Python worker request: " + (error instanceof Error ? error.message : String(error)) });
      continue;
    }
    if (payload.type === "shutdown") break;
    if (payload.type !== "execute" || typeof payload.id !== "string") continue;

    const startedAt = Date.now();
    const stdoutParts = [];
    const stderrParts = [];
    pyodide.setStdout({ batched: (value) => append(stdoutParts, value + "\\n") });
    pyodide.setStderr({ batched: (value) => append(stderrParts, value + "\\n") });
    try {
      resetDirectory(pyodide.FS, "/input");
      resetDirectory(pyodide.FS, "/output");
      for (const file of payload.files) {
        pyodide.FS.writeFile("/input/" + file.filename, Uint8Array.from(Buffer.from(file.base64, "base64")));
      }

      if (payload.packages.length) {
        await pyodide.loadPackage(payload.packages, {
          messageCallback: () => {},
          errorCallback: (value) => append(stderrParts, value + "\\n"),
        });
      }
      if (payload.wheels.length) {
        const wheelPaths = [];
        for (const rawUrl of payload.wheels) {
          if (installedWheels.has(rawUrl)) continue;
          const url = new URL(rawUrl);
          const expectedHash = url.hash.match(/^#sha256=([a-f0-9]{64})$/)?.[1];
          const wheelName = basename(url.pathname);
          if (!expectedHash || !/^[A-Za-z0-9_.-]+\\.whl$/.test(wheelName)) throw new Error("Curated Python wheel metadata is invalid");
          url.hash = "";
          const cachePath = join(cacheDir, wheelName);
          let wheel;
          try {
            wheel = await readFile(cachePath);
          } catch {
            wheel = null;
          }
          const matches = (value) => value && createHash("sha256").update(value).digest("hex") === expectedHash;
          if (!matches(wheel)) {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to download curated Python package: HTTP " + response.status);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length > 20 * 1024 * 1024 || !matches(bytes)) throw new Error("Curated Python package failed integrity validation");
            wheel = bytes;
            await writeFile(cachePath, wheel);
          }
          const virtualPath = "/tmp/" + wheelName;
          pyodide.FS.writeFile(virtualPath, wheel);
          wheelPaths.push(virtualPath);
          installedWheels.add(rawUrl);
        }
        if (wheelPaths.length) {
          const wheelsProxy = pyodide.toPy(wheelPaths);
          internalScope.set("_kk_wheels", wheelsProxy);
          pyodide.runPython("import posixpath as _kk_posixpath, sysconfig as _kk_sysconfig, zipfile as _kk_zipfile\\n_kk_site_packages = _kk_sysconfig.get_paths()['purelib']\\nfor _kk_wheel in _kk_wheels:\\n    with _kk_zipfile.ZipFile(_kk_wheel) as _kk_archive:\\n        if any(_kk_posixpath.isabs(_kk_name) or '..' in _kk_posixpath.normpath(_kk_name).split('/') for _kk_name in _kk_archive.namelist()):\\n            raise ValueError('Curated Python wheel contains an unsafe path')\\n        _kk_archive.extractall(_kk_site_packages)", { globals: internalScope });
          internalScope.delete("_kk_wheels");
          wheelsProxy.destroy();
        }
      }
      await pyodide.loadPackagesFromImports(payload.code, {
        messageCallback: () => {},
        errorCallback: (value) => append(stderrParts, value + "\\n"),
      });

      const inputFilesProxy = pyodide.toPy(Object.fromEntries(payload.files.map((file) => [file.assetId, "/input/" + file.filename])));
      internalScope.set("_kk_code", payload.code);
      internalScope.set("_kk_user_scope", userScope);
      internalScope.set("_kk_input_files", inputFilesProxy);
      const resultProxy = pyodide.runPython("_kk_execute(_kk_code, _kk_user_scope, _kk_input_files)", { globals: internalScope });
      const result = resultProxy == null ? null : String(resultProxy);
      if (resultProxy && typeof resultProxy.destroy === "function") resultProxy.destroy();
      inputFilesProxy.destroy();
      internalScope.delete("_kk_code");
      internalScope.delete("_kk_user_scope");
      internalScope.delete("_kk_input_files");

      const artifacts = [];
      let artifactBytes = 0;
      const walk = (directory, relative = "") => {
        for (const name of pyodide.FS.readdir(directory)) {
          if (name === "." || name === "..") continue;
          const path = directory + "/" + name;
          const nextRelative = relative ? relative + "/" + name : name;
          const stat = pyodide.FS.stat(path);
          if (pyodide.FS.isDir(stat.mode)) {
            walk(path, nextRelative);
          } else {
            const data = pyodide.FS.readFile(path);
            artifactBytes += data.byteLength;
            if (artifacts.length >= 8 || artifactBytes > 20 * 1024 * 1024) throw new Error("Python output exceeds 8 files or 20 MB");
            artifacts.push({ filename: nextRelative.replaceAll("/", "_"), base64: Buffer.from(data).toString("base64") });
          }
        }
      };
      walk("/output");
      protocol({ type: "result", id: payload.id, ok: true, stdout: stdoutParts.join(""), stderr: stderrParts.join(""), result, artifacts, durationMs: Date.now() - startedAt });
    } catch (error) {
      protocol({ type: "result", id: payload.id, ok: false, stdout: stdoutParts.join(""), stderr: stderrParts.join(""), error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt });
    }
  }
} catch (error) {
  protocol({ type: "fatal", error: error instanceof Error ? error.message : String(error) });
}
`;

export interface PythonInputFile {
  assetId: string;
  filename: string;
  data: Buffer;
}

interface PythonOutputArtifact {
  filename: string;
  data: Buffer;
}

export interface PythonExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  result: string | null;
  artifacts: PythonOutputArtifact[];
  packages: string[];
  durationMs: number;
  error?: string;
  errorKind?: "execution_error" | "timeout" | "cancelled" | "runtime_error";
}

export interface PythonRuntimeResolution {
  status: "running" | "unavailable";
  error?: string;
  directory?: string;
}

interface WorkerResponse {
  type?: "ready" | "result" | "fatal";
  id?: string;
  ok?: boolean;
  stdout?: string;
  stderr?: string;
  result?: string | null;
  artifacts?: Array<{ filename?: string; base64?: string }>;
  durationMs?: number;
  error?: string;
}

interface PyodideLockManifest {
  packages?: Record<string, { imports?: string[] }>;
}

interface PendingRequest {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
}

interface PythonWorker {
  child: ChildProcess;
  processHandle: ManagedShellProcess;
  completion: ReturnType<typeof waitForProcess>;
  pending: Map<string, PendingRequest>;
  diagnostics: () => string;
  execute: (
    code: string,
    files: PythonInputFile[],
    packages: string[],
    runtimePackages: string[],
    wheels: string[],
    timeoutSeconds: number,
    abortSignal?: AbortSignal,
  ) => Promise<PythonExecutionResult>;
  stop: () => Promise<void>;
}

interface SandboxSlot {
  worker: Promise<PythonWorker>;
  tail: Promise<void>;
  busy: boolean;
  lastUsed: number;
  idleTimer?: NodeJS.Timeout;
}

const sandboxes = new Map<string, SandboxSlot>();
let workerCreationTail: Promise<void> = Promise.resolve();

function isPyodideDirectory(directory: string): boolean {
  return ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]
    .every((filename) => existsSync(join(directory, filename)));
}

export function getPythonRuntimeResolution(): PythonRuntimeResolution {
  const entryDirectory = dirname(resolve(process.argv[1] ?? process.cwd()));
  const candidates = [
    process.env.KK_AGENT_PYODIDE_DIR,
    join(entryDirectory, "pyodide"),
    join(process.cwd(), "node_modules", "pyodide"),
    join(process.cwd(), "..", "node_modules", "pyodide"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const directory = candidates.map((candidate) => resolve(candidate)).find(isPyodideDirectory);
  return directory
    ? { status: "running", directory }
    : { status: "unavailable", error: "Bundled Pyodide runtime was not found." };
}

function getCatalogImportMap(pyodideDirectory: string): ReadonlyMap<string, string> {
  if (catalogImportMap?.directory === pyodideDirectory) return catalogImportMap.imports;
  const manifest = JSON.parse(readFileSync(join(pyodideDirectory, "pyodide-lock.json"), "utf8")) as PyodideLockManifest;
  const imports = new Map<string, string>(Object.entries(CURATED_PACKAGE_IMPORTS));
  for (const [packageName, descriptor] of Object.entries(manifest.packages ?? {})) {
    for (const importName of descriptor.imports ?? []) {
      if (!imports.has(importName)) imports.set(importName, packageName);
    }
  }
  catalogImportMap = { directory: pyodideDirectory, imports };
  return imports;
}

function detectPackages(code: string, pyodideDirectory: string): string[] {
  const catalog = getCatalogImportMap(pyodideDirectory);
  const packages = new Set<string>();
  const fromPattern = /(?:^|[;\n])\s*from\s+([A-Za-z_][A-Za-z0-9_]*)/gu;
  for (const match of code.matchAll(fromPattern)) {
    const packageName = catalog.get(match[1]!);
    if (packageName) packages.add(packageName);
  }
  const importPattern = /(?:^|[;\n])\s*import\s+([^;\n]+)/gu;
  for (const match of code.matchAll(importPattern)) {
    for (const imported of match[1]!.split(",")) {
      const root = imported.trim().split(/[.\s]/u, 1)[0] ?? "";
      const packageName = catalog.get(root);
      if (packageName) packages.add(packageName);
    }
  }
  return [...packages];
}

function getPackageBaseUrl(pyodideDirectory: string): string {
  const manifest = JSON.parse(readFileSync(join(pyodideDirectory, "package.json"), "utf8")) as { version?: string };
  if (!manifest.version || !/^\d+(?:\.\d+){2}$/u.test(manifest.version)) throw new Error("Bundled Pyodide package has an invalid version.");
  return `https://cdn.jsdelivr.net/pyodide/v${manifest.version}/full/`;
}

function parseExecutionResponse(response: WorkerResponse, packages: string[]): PythonExecutionResult {
  return {
    ok: response.ok === true,
    stdout: response.stdout ?? "",
    stderr: response.stderr ?? "",
    result: response.result ?? null,
    artifacts: (response.artifacts ?? []).map((artifact) => ({
      filename: artifact.filename ?? "output.bin",
      data: Buffer.from(artifact.base64 ?? "", "base64"),
    })),
    packages,
    durationMs: response.durationMs ?? 0,
    ...(response.error ? { error: response.error, errorKind: "execution_error" as const } : {}),
  };
}

async function createPythonWorker(): Promise<PythonWorker> {
  const resolution = getPythonRuntimeResolution();
  if (resolution.status === "unavailable" || !resolution.directory) throw new Error(resolution.error);
  const cacheDirectory = getStateDirPath("python-package-cache");
  await mkdir(cacheDirectory, { recursive: true });
  const child = spawn(
    process.execPath,
    ["--max-old-space-size=384", "--input-type=module", "-e", PYTHON_WORKER_SOURCE, resolution.directory, cacheDirectory, getPackageBaseUrl(resolution.directory)],
    {
      cwd: cacheDirectory,
      env: {
        ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE ?? "1",
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      detached: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe", "pipe"],
    },
  );
  let runnerStdout = "";
  let runnerStderr = "";
  let protocolBuffer = "";
  let protocolOverflow = false;
  let readyResolve!: (response: WorkerResponse) => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<WorkerResponse>((resolveReady, rejectReady) => {
    readyResolve = resolveReady;
    readyReject = rejectReady;
  });
  const pending = new Map<string, PendingRequest>();
  let readyComplete = false;
  let containedProcess: ManagedShellProcess | undefined;
  const protocolStream = child.stdio[3] as Readable | null;
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  protocolStream?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => { runnerStdout = (runnerStdout + chunk).slice(-64_000); });
  child.stderr?.on("data", (chunk: string) => { runnerStderr = (runnerStderr + chunk).slice(-64_000); });
  protocolStream?.on("data", (chunk: string) => {
    if (protocolBuffer.length + chunk.length > MAX_PROTOCOL_BYTES) {
      protocolOverflow = true;
      if (containedProcess) void terminateProcessTree(containedProcess);
      return;
    }
    protocolBuffer += chunk;
    for (;;) {
      const newline = protocolBuffer.indexOf("\n");
      if (newline < 0) break;
      const raw = protocolBuffer.slice(0, newline);
      protocolBuffer = protocolBuffer.slice(newline + 1);
      if (!raw) continue;
      try {
        const response = JSON.parse(raw) as WorkerResponse;
        if (response.type === "ready") readyResolve(response);
        else if (response.type === "fatal") {
          const error = new Error(response.error ?? "Python worker failed.");
          if (!readyComplete) readyReject(error);
          for (const request of pending.values()) request.reject(error);
          pending.clear();
          if (containedProcess) void terminateProcessTree(containedProcess);
        }
        else if (response.type === "result" && response.id) {
          const request = pending.get(response.id);
          if (request) {
            pending.delete(response.id);
            request.resolve(response);
          }
        }
      } catch (error) {
        const failure = new Error(`Invalid Python worker response: ${error instanceof Error ? error.message : String(error)}`);
        if (!readyComplete) readyReject(failure);
        for (const request of pending.values()) request.reject(failure);
        pending.clear();
        if (containedProcess) void terminateProcessTree(containedProcess);
      }
    }
  });

  const processHandle = await attachProcessContainment(child);
  containedProcess = processHandle;
  const completion = waitForProcess(processHandle);
  const diagnostics = () => [runnerStderr.trim(), runnerStdout.trim()].filter(Boolean).join("\n");
  void completion.then((finished) => {
    const message = protocolOverflow
      ? "Python worker output exceeded the protocol limit."
      : diagnostics() || `Python worker exited with code ${finished.code}.`;
    const error = new Error(message);
    readyReject(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });
  child.stdin?.write(JSON.stringify({ type: "bootstrap" }) + "\n");
  const startupTimeout = setTimeout(() => readyReject(new Error(`Python worker did not start within ${SANDBOX_START_TIMEOUT_MS}ms.`)), SANDBOX_START_TIMEOUT_MS);
  try {
    await ready;
    readyComplete = true;
  } catch (error) {
    await terminateProcessTree(processHandle).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(startupTimeout);
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (child.exitCode === null && child.signalCode === null) child.stdin?.write(JSON.stringify({ type: "shutdown" }) + "\n");
    await Promise.race([completion, new Promise<void>((resolveWait) => setTimeout(resolveWait, 100))]);
    if (child.exitCode === null && child.signalCode === null) await terminateProcessTree(processHandle).catch(() => undefined);
  };

  const execute: PythonWorker["execute"] = async (code, files, packages, runtimePackages, wheels, timeoutSeconds, abortSignal) => {
    if (abortSignal?.aborted) {
      return { ok: false, stdout: "", stderr: "", result: null, artifacts: [], packages, durationMs: 0, error: "Python execution was cancelled.", errorKind: "cancelled" };
    }
    const id = randomUUID();
    const response = new Promise<WorkerResponse>((resolveResponse, rejectResponse) => {
      pending.set(id, { resolve: resolveResponse, reject: rejectResponse });
    });
    child.stdin?.write(JSON.stringify({
      type: "execute",
      id,
      code,
      packages: runtimePackages,
      wheels,
      files: files.map((file) => ({ assetId: file.assetId, filename: file.filename, base64: file.data.toString("base64") })),
    }) + "\n");

    let timedOut = false;
    let cancelled = false;
    let timeout: NodeJS.Timeout | undefined;
    let abort: (() => void) | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        reject(new Error("timeout"));
      }, timeoutSeconds * 1_000);
      abort = () => {
        cancelled = true;
        reject(new Error("cancelled"));
      };
      abortSignal?.addEventListener("abort", abort, { once: true });
    });
    try {
      return parseExecutionResponse(await Promise.race([response, interrupted]), packages);
    } catch (error) {
      pending.delete(id);
      if (timedOut || cancelled) await stop();
      if (cancelled) return { ok: false, stdout: "", stderr: diagnostics(), result: null, artifacts: [], packages, durationMs: 0, error: "Python execution was cancelled.", errorKind: "cancelled" };
      if (timedOut) return { ok: false, stdout: "", stderr: diagnostics(), result: null, artifacts: [], packages, durationMs: timeoutSeconds * 1_000, error: `Python execution exceeded ${timeoutSeconds} seconds.`, errorKind: "timeout" };
      return { ok: false, stdout: "", stderr: diagnostics(), result: null, artifacts: [], packages, durationMs: 0, error: error instanceof Error ? error.message : String(error), errorKind: "runtime_error" };
    } finally {
      if (timeout) clearTimeout(timeout);
      if (abort) abortSignal?.removeEventListener("abort", abort);
    }
  };

  return { child, processHandle, completion, pending, diagnostics, execute, stop };
}

async function createPythonWorkerSerialized(): Promise<PythonWorker> {
  const previous = workerCreationTail;
  let release!: () => void;
  const current = new Promise<void>((resolveRelease) => { release = resolveRelease; });
  workerCreationTail = previous.then(() => current);
  await previous;
  try {
    return await createPythonWorker();
  } finally {
    release();
  }
}

function createSandboxSlot(): SandboxSlot {
  return { worker: createPythonWorkerSerialized(), tail: Promise.resolve(), busy: false, lastUsed: Date.now() };
}

async function makePersistentSandboxCapacity(exceptSessionId: string): Promise<boolean> {
  if (sandboxes.size < MAX_PERSISTENT_SANDBOXES) return true;
  const candidate = [...sandboxes.entries()]
    .filter(([sessionId, slot]) => sessionId !== exceptSessionId && !slot.busy)
    .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
  if (candidate) await disposePythonSandbox(candidate[0]);
  return sandboxes.size < MAX_PERSISTENT_SANDBOXES;
}

function scheduleSandboxIdleDisposal(sessionId: string, slot: SandboxSlot): void {
  if (slot.idleTimer) clearTimeout(slot.idleTimer);
  slot.idleTimer = setTimeout(() => { void disposePythonSandbox(sessionId); }, SANDBOX_IDLE_TTL_MS);
  slot.idleTimer.unref();
}

async function executeInPersistentSandbox(
  sessionId: string,
  code: string,
  files: PythonInputFile[],
  packages: string[],
  runtimePackages: string[],
  wheels: string[],
  timeoutSeconds: number,
  abortSignal?: AbortSignal,
): Promise<PythonExecutionResult> {
  let slot = sandboxes.get(sessionId);
  if (!slot) {
    if (!(await makePersistentSandboxCapacity(sessionId))) {
      const worker = await createPythonWorkerSerialized();
      try {
        return await worker.execute(code, files, packages, runtimePackages, wheels, timeoutSeconds, abortSignal);
      } finally {
        await worker.stop();
      }
    }
    slot = createSandboxSlot();
    sandboxes.set(sessionId, slot);
  }
  if (slot.idleTimer) clearTimeout(slot.idleTimer);
  const previous = slot.tail;
  let release!: () => void;
  const current = new Promise<void>((resolveRelease) => { release = resolveRelease; });
  slot.tail = previous.then(() => current);
  await previous;
  slot.busy = true;
  try {
    const worker = await slot.worker;
    const result = await worker.execute(code, files, packages, runtimePackages, wheels, timeoutSeconds, abortSignal);
    if (["timeout", "cancelled", "runtime_error"].includes(result.errorKind ?? "")) {
      sandboxes.delete(sessionId);
      await worker.stop();
    }
    return result;
  } catch (error) {
    sandboxes.delete(sessionId);
    return { ok: false, stdout: "", stderr: "", result: null, artifacts: [], packages, durationMs: 0, error: error instanceof Error ? error.message : String(error), errorKind: "runtime_error" };
  } finally {
    slot.busy = false;
    slot.lastUsed = Date.now();
    release();
    if (sandboxes.get(sessionId) === slot) scheduleSandboxIdleDisposal(sessionId, slot);
  }
}

export async function disposePythonSandbox(sessionId: string): Promise<void> {
  const slot = sandboxes.get(sessionId);
  if (!slot) return;
  sandboxes.delete(sessionId);
  if (slot.idleTimer) clearTimeout(slot.idleTimer);
  await slot.worker.then((worker) => worker.stop()).catch(() => undefined);
}

export async function stopAllPythonSandboxes(): Promise<void> {
  await Promise.allSettled([...sandboxes.keys()].map(disposePythonSandbox));
}

export async function runPythonSandbox(
  codeInput: string,
  files: PythonInputFile[] = [],
  timeoutSecondsInput = PYTHON_DEFAULT_TIMEOUT_SECONDS,
  abortSignal?: AbortSignal,
  sessionId?: string,
): Promise<PythonExecutionResult> {
  const code = codeInput.trim();
  if (!code) throw new Error("Python requires non-empty code.");
  if (code.length > MAX_CODE_CHARS) throw new Error(`Python code exceeds ${MAX_CODE_CHARS} characters.`);
  const totalInputBytes = files.reduce((sum, file) => sum + file.data.length, 0);
  if (files.length > 8 || totalInputBytes > MAX_INPUT_BYTES) throw new Error("Python input exceeds 8 files or 10 MB.");
  const timeoutSeconds = Number.isFinite(timeoutSecondsInput)
    ? Math.min(PYTHON_MAX_TIMEOUT_SECONDS, Math.max(1, Math.floor(timeoutSecondsInput)))
    : PYTHON_DEFAULT_TIMEOUT_SECONDS;
  const resolution = getPythonRuntimeResolution();
  if (resolution.status === "unavailable" || !resolution.directory) throw new Error(resolution.error);
  const packages = detectPackages(code, resolution.directory);
  const wheels = packages.flatMap((packageName) => CURATED_WHEELS[packageName] ? [CURATED_WHEELS[packageName]!] : []);
  const runtimePackages = [...new Set([
    ...packages.filter((packageName) => !CURATED_WHEELS[packageName]),
    ...(wheels.length ? ["numpy"] : []),
  ])];

  if (sessionId) return executeInPersistentSandbox(sessionId, code, files, packages, runtimePackages, wheels, timeoutSeconds, abortSignal);
  const worker = await createPythonWorkerSerialized();
  try {
    return await worker.execute(code, files, packages, runtimePackages, wheels, timeoutSeconds, abortSignal);
  } finally {
    await worker.stop();
  }
}
