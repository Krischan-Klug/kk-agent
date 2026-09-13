import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { ToolRuntimeContext } from "../../../loop/types.js";
import type { AccessScope, InternalToolDefinition, ToolCallResult } from "../../types.js";
import {
  getDefaultPathForScope,
  resolveAccessScope,
  resolveTerminalConfig,
} from "../access-paths.js";
import {
  getTerminalShellProfile,
  type TerminalShellProfile,
} from "./shell-profile.js";
import { isUnmanagedProcessTerminationCommand } from "./command-policy.js";
import {
  getTerminalTask,
  startBackgroundTerminalTask,
  stopTerminalTask,
  type TerminalTaskSnapshot,
} from "./background-tasks.js";
import {
  closeProcessOutput,
  drainProcessOutput,
  spawnShellProcess,
  terminateProcessTree,
  waitForProcess,
  type ProcessCompletion,
} from "./process.js";
import {
  createTerminalOutputCapture,
  discardTerminalOutputCapture,
  finishTerminalOutputCapture,
  readTerminalOutput,
} from "./output-store.js";

const DEFAULT_TIMEOUT = 30000;
const MAX_BUFFER = 1024 * 1024;
const RETAINED_PREVIEW_HEAD_BYTES = 4 * 1024;
const RETAINED_PREVIEW_TAIL_BYTES = 4 * 1024;
const TERMINATED_PROCESS_EXIT_GRACE_MS = 1_500;

function getWorkingDirectory(tool: InternalToolDefinition): string {
  return resolveTerminalConfig(tool.config).workingDirectory ?? resolve("/");
}

function getAllowedRoot(tool: InternalToolDefinition): string {
  return getDefaultPathForScope(resolveAccessScope(tool.config?.accessScope));
}

function normalizePathForComparison(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function resolveWithinWorkingDirectory(allowedRoot: string, baseDirectory: string, target?: unknown): string {
  const candidate = typeof target === "string" && target.trim()
    ? resolve(baseDirectory, target)
    : resolve(baseDirectory);
  const resolvedRoot = resolve(allowedRoot);
  const comparableRoot = normalizePathForComparison(resolvedRoot);
  const normalizedRoot = comparableRoot.endsWith(sep) ? comparableRoot : `${comparableRoot}${sep}`;
  const normalizedCandidate = normalizePathForComparison(candidate);
  if (normalizedCandidate !== comparableRoot && !normalizedCandidate.startsWith(normalizedRoot)) {
    throw new Error(`Working directory override "${String(target ?? "")}" is outside the allowed access scope`);
  }
  return candidate;
}

function combineOutput(stdout: string, stderr: string): string {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
}

function updateTail(current: Buffer, chunk: Buffer): Buffer {
  const combined = current.length === 0 ? chunk : Buffer.concat([current, chunk]);
  return combined.length <= RETAINED_PREVIEW_TAIL_BYTES
    ? combined
    : combined.subarray(combined.length - RETAINED_PREVIEW_TAIL_BYTES);
}

function streamPreview(label: string, head: Buffer, tail: Buffer, totalBytes: number): string[] {
  if (totalBytes === 0) return [];
  if (totalBytes <= RETAINED_PREVIEW_HEAD_BYTES + RETAINED_PREVIEW_TAIL_BYTES) {
    return [`[${label}: ${totalBytes} byte(s)]`, head.subarray(0, totalBytes).toString("utf8")];
  }
  const headText = head.subarray(0, RETAINED_PREVIEW_HEAD_BYTES).toString("utf8");
  const tailText = tail.toString("utf8");
  return [
    `[${label} head: ${Math.min(totalBytes, RETAINED_PREVIEW_HEAD_BYTES)} byte(s)]`,
    headText,
    `[${label} tail: ${Math.min(totalBytes, RETAINED_PREVIEW_TAIL_BYTES)} byte(s)]`,
    tailText,
  ];
}

function retainedOutputNotice(input: {
  outputId?: string;
  stdoutHead: Buffer;
  stderrHead: Buffer;
  stdoutTail: Buffer;
  stderrTail: Buffer;
  stdoutBytes: number;
  stderrBytes: number;
}): string {
  const control = input.outputId
    ? [
        "[terminal output retained]",
        `outputId: ${input.outputId}`,
        `stdoutBytes: ${input.stdoutBytes}`,
        `stderrBytes: ${input.stderrBytes}`,
        `Read exact data with Terminal action="output" and outputId="${input.outputId}".`,
      ]
    : [
        "[terminal output truncated; no active session was available for retention]",
        `stdoutBytes: ${input.stdoutBytes}`,
        `stderrBytes: ${input.stderrBytes}`,
      ];
  return [
    ...control,
    ...streamPreview("stdout", input.stdoutHead, input.stdoutTail, input.stdoutBytes),
    ...streamPreview("stderr", input.stderrHead, input.stderrTail, input.stderrBytes),
  ].join("\n");
}

function shellMetadata(
  profile: TerminalShellProfile,
  cwd: string,
  accessScope: AccessScope,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    shell: profile.kind,
    shellDisplayName: profile.displayName,
    shellVersion: profile.version,
    shellExecutable: profile.executable,
    cwd,
    accessScope,
    privilege: "current_user",
    ...fields,
  };
}

function foregroundResult(
  profile: TerminalShellProfile,
  cwd: string,
  accessScope: AccessScope,
  output: string,
  exitCode: number,
  fields: Record<string, unknown> = {},
): ToolCallResult {
  return {
    content: `${output || "[no output]"}\n\n[exit code: ${exitCode}]`,
    isError: exitCode !== 0,
    metadata: shellMetadata(profile, cwd, accessScope, { exitCode, ...fields }),
  };
}

function timeoutResult(
  profile: TerminalShellProfile,
  cwd: string,
  accessScope: AccessScope,
  timeoutMs: number,
  output: string,
  fields: Record<string, unknown> = {},
): ToolCallResult {
  return {
    content: `${output || "[no output]"}\n\n[timed out after ${timeoutMs}ms]`,
    isError: true,
    metadata: shellMetadata(profile, cwd, accessScope, {
      timedOut: true,
      interrupted: true,
      errorKind: "timeout",
      ...fields,
    }),
  };
}

function interruptedResult(
  profile: TerminalShellProfile,
  cwd: string,
  accessScope: AccessScope,
  output: string,
  fields: Record<string, unknown> = {},
): ToolCallResult {
  return {
    content: `${output || "[no output]"}\n\n[interrupted]`,
    isError: true,
    metadata: shellMetadata(profile, cwd, accessScope, {
      interrupted: true,
      errorKind: "abort",
      ...fields,
    }),
  };
}

function commandEnvironment(overrides?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(process.platform !== "win32" ? { LANG: process.env.LANG || "C.UTF-8", LC_ALL: process.env.LC_ALL || "C.UTF-8" } : {}),
    ...(overrides ?? {}),
  };
}

async function executeForegroundCommand(
  profile: TerminalShellProfile,
  command: string,
  cwd: string,
  accessScope: AccessScope,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
  sessionId?: string,
  abortSignal?: AbortSignal,
): Promise<ToolCallResult> {
  const captureStore = sessionId ? await createTerminalOutputCapture(sessionId) : undefined;
  let processHandle;
  try {
    processHandle = await spawnShellProcess(profile, command, cwd, env);
  } catch (error) {
    if (captureStore) await discardTerminalOutputCapture(captureStore);
    throw error;
  }
  const { child } = processHandle;
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutTail: Buffer = Buffer.alloc(0);
  let stderrTail: Buffer = Buffer.alloc(0);
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let timedOut = false;
  let interrupted = false;
  let termination: ReturnType<typeof terminateProcessTree> | undefined;
  let signalTerminationStarted!: () => void;
  const terminationStarted = new Promise<void>((resolveStarted) => {
    signalTerminationStarted = resolveStarted;
  });
  if (captureStore) {
    child.stdout?.pipe(captureStore.stdout);
    child.stderr?.pipe(captureStore.stderr);
  }

  const terminate = () => {
    if (!termination) {
      signalTerminationStarted();
      termination = terminateProcessTree(processHandle);
    }
    return termination;
  };
  const capture = (chunks: Buffer[], currentBytes: number, chunk: Buffer): number => {
    const remaining = Math.max(0, MAX_BUFFER - currentBytes);
    if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
    return currentBytes + chunk.length;
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    const buffer = Buffer.from(chunk);
    stdoutTail = updateTail(stdoutTail, buffer);
    stdoutBytes = capture(stdoutChunks, stdoutBytes, buffer);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const buffer = Buffer.from(chunk);
    stderrTail = updateTail(stderrTail, buffer);
    stderrBytes = capture(stderrChunks, stderrBytes, buffer);
  });

  const processCompletion = waitForProcess(processHandle);
  processHandle.start();

  const timeout = setTimeout(() => {
    timedOut = true;
    void terminate();
  }, timeoutMs);

  const handleAbort = () => {
    interrupted = true;
    void terminate();
  };
  if (abortSignal?.aborted) handleAbort();
  else abortSignal?.addEventListener("abort", handleAbort, { once: true });

  const completion = await Promise.race<ProcessCompletion | undefined>([
    processCompletion,
    terminationStarted.then(async () => {
      await termination;
      await new Promise((resolveGrace) => setTimeout(resolveGrace, TERMINATED_PROCESS_EXIT_GRACE_MS));
      return undefined;
    }),
  ]);
  clearTimeout(timeout);
  abortSignal?.removeEventListener("abort", handleAbort);
  await termination;
  await drainProcessOutput(processHandle);
  if (captureStore) {
    child.stdout?.unpipe(captureStore.stdout);
    child.stderr?.unpipe(captureStore.stderr);
    await finishTerminalOutputCapture(captureStore);
  }
  closeProcessOutput(processHandle);

  const stdoutHead = Buffer.concat(stdoutChunks);
  const stderrHead = Buffer.concat(stderrChunks);
  const outputLimitExceeded = stdoutBytes + stderrBytes > MAX_BUFFER;
  const output = outputLimitExceeded
    ? retainedOutputNotice({
        outputId: captureStore?.id,
        stdoutHead,
        stderrHead,
        stdoutTail,
        stderrTail,
        stdoutBytes,
        stderrBytes,
      })
    : combineOutput(stdoutHead.toString("utf8"), stderrHead.toString("utf8"));
  const terminationResult = await termination;
  const terminationMetadata = terminationResult
    ? {
        terminationMethod: terminationResult.method,
        terminationVerified: terminationResult.success,
        terminationDurationMs: terminationResult.durationMs,
        ...(terminationResult.error ? { terminationError: terminationResult.error } : {}),
      }
    : {};
  const outputMetadata = outputLimitExceeded && captureStore
    ? { outputId: captureStore.id, stdoutBytes, stderrBytes, outputTruncated: true }
    : {};
  if (!outputLimitExceeded && captureStore) await discardTerminalOutputCapture(captureStore);
  if (timedOut) return timeoutResult(profile, cwd, accessScope, timeoutMs, output, { ...terminationMetadata, ...outputMetadata });
  if (interrupted) return interruptedResult(profile, cwd, accessScope, output, { ...terminationMetadata, ...outputMetadata });
  if (!completion) {
    return foregroundResult(profile, cwd, accessScope, output || "Process did not report exit after termination.", 1, {
      interrupted: true,
      errorKind: "termination_failed",
      ...outputMetadata,
    });
  }
  if (completion.error) {
    return foregroundResult(profile, cwd, accessScope, output || completion.error.message, 1, { errorKind: "spawn", ...outputMetadata });
  }
  return foregroundResult(profile, cwd, accessScope, output, completion.code, {
    interrupted: Boolean(completion.signal),
    ...(completion.code === 0 ? {} : { errorKind: "exit_code" }),
    ...outputMetadata,
  });
}

function backgroundTaskResult(
  profile: TerminalShellProfile,
  task: TerminalTaskSnapshot,
  timeoutMs?: number,
): ToolCallResult {
  return {
    content: [
      `Background command started with id ${task.id}.`,
      `stdout: ${task.stdoutPath}`,
      `stderr: ${task.stderrPath}`,
      `status: ${task.statusPath}`,
      `Use Terminal with action="status" or action="stop" and taskId="${task.id}".`,
    ].join("\n"),
    isError: false,
    metadata: shellMetadata(profile, task.cwd, task.accessScope, {
      background: true,
      taskId: task.id,
      stdoutPath: task.stdoutPath,
      stderrPath: task.stderrPath,
      statusPath: task.statusPath,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    }),
  };
}

function taskResult(action: "status" | "stop", task: TerminalTaskSnapshot): ToolCallResult {
  const completed = task.completedAt ? `\ncompletedAt: ${task.completedAt}` : "";
  const exitCode = task.exitCode === undefined ? "" : `\nexitCode: ${task.exitCode}`;
  const termination = task.terminationMethod
    ? `\ntermination: ${task.terminationMethod}, verified=${String(task.terminationVerified)}, durationMs=${task.terminationDurationMs ?? "unknown"}`
    : "";
  return {
    content: [
      `Terminal task ${task.id}: ${task.status}`,
      `command: ${task.command}`,
      `cwd: ${task.cwd}${exitCode}${completed}${termination}`,
      `stdout: ${task.stdoutPath}`,
      `stderr: ${task.stderrPath}`,
    ].join("\n"),
    isError: task.status === "stop_failed",
    metadata: {
      action,
      background: true,
      taskId: task.id,
      status: task.status,
      exitCode: task.exitCode,
      cwd: task.cwd,
      shell: task.shell,
      shellVersion: task.shellVersion,
      accessScope: task.accessScope,
      privilege: "current_user",
      stdoutPath: task.stdoutPath,
      stderrPath: task.stderrPath,
      statusPath: task.statusPath,
      error: task.error,
      terminationMethod: task.terminationMethod,
      terminationVerified: task.terminationVerified,
      terminationDurationMs: task.terminationDurationMs,
    },
  };
}

function invalidTaskResult(taskId: string): ToolCallResult {
  return {
    content: `No terminal task with id "${taskId}" belongs to the active session.`,
    isError: true,
    metadata: { background: true, taskId, errorKind: "task_not_found" },
  };
}

function validTimeout(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function executeTerminalTool(
  config: InternalToolDefinition,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolRuntimeContext,
): Promise<ToolCallResult | null> {
  if (toolName !== "Terminal") return null;

  const profile = getTerminalShellProfile();
  if (!profile) return { content: "Terminal is unavailable because no supported shell was detected.", isError: true };

  const action = args.action === undefined ? "run" : String(args.action).trim().toLowerCase();
  if (!new Set(["run", "status", "stop", "output"]).has(action)) {
    return { content: `Unsupported Terminal action "${action}". Use run, status, stop, or output.`, isError: true };
  }

  if (action === "output") {
    const sessionId = context?.sessionId;
    if (!sessionId) return { content: "Terminal output reads require an active session.", isError: true };
    const outputId = String(args.outputId ?? "").trim();
    if (!outputId) return { content: "outputId is required for Terminal action \"output\".", isError: true };
    const stream = args.stream === "stderr" ? "stderr" : "stdout";
    try {
      const result = await readTerminalOutput({
        sessionId,
        outputId,
        stream,
        offsetBytes: typeof args.offsetBytes === "number" ? args.offsetBytes : undefined,
        limitBytes: typeof args.limitBytes === "number" ? args.limitBytes : undefined,
        pattern: typeof args.pattern === "string" && args.pattern ? args.pattern : undefined,
      });
      const { content, ...details } = result;
      return {
        content: [
          "[terminal output page]",
          `outputId: ${outputId}`,
          `stream: ${stream}`,
          `offsetBytes: ${result.offset}`,
          `bytesReturned: ${result.bytesRead}`,
          `totalBytes: ${result.size}`,
          `truncated: ${String(result.truncated)}`,
          "",
          content || "[no output]",
        ].join("\n"),
        isError: false,
        metadata: { action, outputId, stream, ...details },
      };
    } catch (error) {
      return { content: error instanceof Error ? error.message : String(error), isError: true, metadata: { action, outputId, stream } };
    }
  }

  if (action === "status" || action === "stop") {
    const sessionId = context?.sessionId;
    if (!sessionId) return { content: "Terminal task operations require an active session.", isError: true };
    const taskId = String(args.taskId ?? "").trim();
    if (!taskId) return { content: `taskId is required for Terminal action "${action}".`, isError: true };
    const task = action === "status"
      ? getTerminalTask(sessionId, taskId)
      : await stopTerminalTask(sessionId, taskId);
    return task ? taskResult(action, task) : invalidTaskResult(taskId);
  }

  const accessScope = resolveAccessScope(config.config?.accessScope);
  const workingDirectory = getWorkingDirectory(config);
  const allowedRoot = getAllowedRoot(config);
  const command = String(args.command ?? "").trim();
  if (!command) throw new Error("command is required");
  if (isUnmanagedProcessTerminationCommand(command)) {
    return {
      content: "Raw process-termination commands are disabled. Stop a managed background command with Terminal action=\"stop\" and its taskId.",
      isError: true,
      metadata: { errorKind: "unmanaged_process_termination" },
    };
  }

  const cwd = resolveWithinWorkingDirectory(allowedRoot, workingDirectory, args.cwd);
  if (!existsSync(cwd)) throw new Error(`Working directory "${cwd}" does not exist`);

  const requestedTimeout = validTimeout(args.timeoutMs);
  const envOverrides = typeof args.env === "object" && args.env !== null
    ? Object.fromEntries(Object.entries(args.env).map(([key, value]) => [key, String(value)]))
    : undefined;
  const env = commandEnvironment(envOverrides);

  if (args.run_in_background === true) {
    const sessionId = context?.sessionId;
    if (!sessionId) return { content: "Background terminal commands require an active session.", isError: true };
    try {
      const task = await startBackgroundTerminalTask({
        sessionId,
        profile,
        command,
        cwd,
        accessScope,
        env,
        timeoutMs: requestedTimeout,
      });
      return backgroundTaskResult(profile, task, requestedTimeout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: `${message}\n\n[background command failed to start]`,
        isError: true,
        metadata: shellMetadata(profile, cwd, accessScope, { background: true, errorKind: "spawn" }),
      };
    }
  }

  return executeForegroundCommand(
    profile,
    command,
    cwd,
    accessScope,
    requestedTimeout ?? DEFAULT_TIMEOUT,
    env,
    context?.sessionId,
    context?.abortSignal,
  );
}
