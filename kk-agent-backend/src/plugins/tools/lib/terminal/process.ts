import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildShellCommandArgs,
  type TerminalShellProfile,
} from "./shell-profile.js";

const WINDOWS_JOB_START_TIMEOUT_MS = 10_000;
const WINDOWS_JOB_STOP_TIMEOUT_MS = 4_000;
const MSYS_GROUP_TIMEOUT_MS = 2_500;
const OUTPUT_DRAIN_TIMEOUT_MS = 250;
const WINDOWS_JOB_READY = "KK_AGENT_JOB_READY";
const WINDOWS_JOB_STOPPED = "KK_AGENT_JOB_STOPPED";

const WINDOWS_JOB_SUPERVISOR_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$TargetProcessId = [int]$env:KK_AGENT_JOB_TARGET_PID

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class KkAgentJobObject
{
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const uint PROCESS_TERMINATE = 0x0001;
    private const uint PROCESS_SET_QUOTA = 0x0100;
    private const uint WAIT_OBJECT_0 = 0x00000000;
    private const uint WAIT_TIMEOUT = 0x00000102;

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr handle);

    private static Win32Exception LastError(string operation)
    {
        return new Win32Exception(Marshal.GetLastWin32Error(), operation + " failed");
    }

    public static IntPtr CreateAndAssign(uint processId)
    {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw LastError("CreateJobObject");

        try
        {
            var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if (!SetInformationJobObject(
                job,
                9,
                ref limits,
                (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))))
            {
                throw LastError("SetInformationJobObject");
            }

            IntPtr process = OpenProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA, false, processId);
            if (process == IntPtr.Zero) throw LastError("OpenProcess");
            try
            {
                if (!AssignProcessToJobObject(job, process))
                    throw LastError("AssignProcessToJobObject");
            }
            finally
            {
                CloseHandle(process);
            }

            return job;
        }
        catch
        {
            CloseHandle(job);
            throw;
        }
    }

    public static void TerminateAndWait(IntPtr job, uint timeoutMs)
    {
        uint state = WaitForSingleObject(job, 0);
        if (state == WAIT_OBJECT_0) return;
        if (state != WAIT_TIMEOUT) throw LastError("WaitForSingleObject");

        if (!TerminateJobObject(job, 1)) throw LastError("TerminateJobObject");
        state = WaitForSingleObject(job, timeoutMs);
        if (state == WAIT_TIMEOUT) throw new TimeoutException("Windows Job Object did not become empty in time");
        if (state != WAIT_OBJECT_0) throw LastError("WaitForSingleObject");
    }
}
'@

$job = [IntPtr]::Zero
try {
  $job = [KkAgentJobObject]::CreateAndAssign([uint32]$TargetProcessId)
  [Console]::Out.WriteLine('${WINDOWS_JOB_READY}')
  [Console]::Out.Flush()
  $null = [Console]::In.ReadLine()
  [KkAgentJobObject]::TerminateAndWait($job, 2500)
  [Console]::Out.WriteLine('${WINDOWS_JOB_STOPPED}')
  [Console]::Out.Flush()
} catch {
  [Console]::Error.WriteLine($_.Exception.ToString())
  exit 1
} finally {
  if ($job -ne [IntPtr]::Zero) {
    [KkAgentJobObject]::CloseHandle($job) | Out-Null
  }
}
`;

export interface ProcessCompletion {
  code: number;
  signal?: NodeJS.Signals;
  error?: Error;
}

export interface ProcessTermination {
  method: "windows_job" | "windows_job_msys_group" | "process_group" | "root_process" | "already_exited";
  success: boolean;
  durationMs: number;
  error?: string;
}

interface SupervisorExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

interface WindowsJobController {
  terminate(): Promise<ProcessTermination>;
}

export interface ManagedShellProcess {
  child: ChildProcess;
  terminate(): Promise<ProcessTermination>;
  finalizeAfterExit(): Promise<ProcessTermination | undefined>;
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolveSpawn, rejectSpawn) => {
    child.once("spawn", resolveSpawn);
    child.once("error", rejectSpawn);
  });
}

function gatedCommand(profile: TerminalShellProfile, command: string, msysGroupFile?: string): string {
  if (profile.dialect === "powershell") return `$null = [Console]::In.ReadLine()\n${command}`;
  const reportMsysGroup = msysGroupFile
    ? `__kk_agent_pgid="$(ps -l -p $$ | tail -n 1 | awk '{print $3}')"\ncase "$__kk_agent_pgid" in (*[!0-9]*|'') exit 125;; esac\nprintf '%s\\n' "$__kk_agent_pgid" > '${msysGroupFile.replace(/'/g, "'\\''")}'\n`
    : "";
  return `IFS= read -r __kk_agent_start_gate || exit 126\n${reportMsysGroup}${command}`;
}

async function readMsysProcessGroup(path: string): Promise<number> {
  const deadline = Date.now() + WINDOWS_JOB_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const raw = await readFile(path, "utf8").catch(() => "");
    if (raw.trim()) {
      const pgid = Number.parseInt(raw.trim(), 10);
      if (!Number.isInteger(pgid) || pgid <= 0) throw new Error(`Git Bash reported invalid process group "${raw.trim()}"`);
      return pgid;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(`Git Bash did not report its process group within ${WINDOWS_JOB_START_TIMEOUT_MS}ms`);
}

function terminateMsysProcessGroup(profile: TerminalShellProfile, pgid: number): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolveTermination) => {
    const script = [
      `kill -KILL -- -${pgid} 2>/dev/null || true`,
      `for __kk_agent_i in 1 2 3 4 5 6 7 8 9 10; do`,
      `  kill -0 -- -${pgid} 2>/dev/null || exit 0`,
      `  sleep 0.02`,
      `done`,
      `exit 1`,
    ].join("\n");
    const killer = spawn(profile.executable, buildShellCommandArgs(profile, script), {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    });
    let settled = false;
    const finish = (success: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveTermination({ success, ...(error ? { error } : {}) });
    };
    const timeout = setTimeout(() => {
      killer.kill("SIGKILL");
      finish(false, `Git Bash process group ${pgid} did not stop within ${MSYS_GROUP_TIMEOUT_MS}ms`);
    }, MSYS_GROUP_TIMEOUT_MS);
    killer.once("error", (error) => finish(false, error.message));
    killer.once("exit", (code) => finish(code === 0, code === 0 ? undefined : `Git Bash process group ${pgid} survived termination`));
  });
}

function startWindowsJobController(targetPid: number): Promise<WindowsJobController> {
  const supervisor = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      WINDOWS_JOB_SUPERVISOR_SCRIPT,
    ],
    {
      env: { ...process.env, KK_AGENT_JOB_TARGET_PID: String(targetPid) },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  supervisor.stdout?.setEncoding("utf8");
  supervisor.stderr?.setEncoding("utf8");
  supervisor.stdout?.on("data", (chunk: string) => { stdout += chunk; });
  supervisor.stderr?.on("data", (chunk: string) => { stderr += chunk; });

  const exit = new Promise<SupervisorExit>((resolveExit) => {
    supervisor.once("exit", (code, signal) => resolveExit({ code, signal }));
  });

  return new Promise((resolveController, rejectController) => {
    let settled = false;
    let termination: Promise<ProcessTermination> | undefined;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectController(error);
    };
    const ready = () => {
      if (settled || !stdout.split(/\r?\n/).includes(WINDOWS_JOB_READY)) return;
      settled = true;
      clearTimeout(timeout);
      resolveController({
        terminate() {
          termination ??= (async () => {
            const startedAt = Date.now();
            if (!supervisor.stdin?.destroyed) supervisor.stdin.end("terminate\n");
            const result = await new Promise<SupervisorExit>((resolveResult) => {
              const timeout = setTimeout(
                () => resolveResult({ code: null, signal: null }),
                WINDOWS_JOB_STOP_TIMEOUT_MS,
              );
              void exit.then((value) => {
                clearTimeout(timeout);
                resolveResult(value);
              });
            });
            const durationMs = Date.now() - startedAt;
            const verified = result.code === 0 && stdout.split(/\r?\n/).includes(WINDOWS_JOB_STOPPED);
            if (verified) return { method: "windows_job", success: true, durationMs };
            if (result.code === null && result.signal === null) supervisor.kill("SIGKILL");
            const detail = stderr.trim() || (result.code === null
              ? `Windows Job Object supervisor did not exit within ${WINDOWS_JOB_STOP_TIMEOUT_MS}ms`
              : `Windows Job Object supervisor exited with code ${result.code ?? "unknown"}`);
            return { method: "windows_job", success: false, durationMs, error: detail };
          })();
          return termination;
        },
      });
    };
    const timeout = setTimeout(() => {
      supervisor.kill("SIGKILL");
      fail(new Error(`Windows Job Object supervisor was not ready within ${WINDOWS_JOB_START_TIMEOUT_MS}ms${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    }, WINDOWS_JOB_START_TIMEOUT_MS);
    supervisor.stdout?.on("data", ready);
    supervisor.once("error", fail);
    void exit.then((result) => {
      if (!settled) fail(new Error(stderr.trim() || `Windows Job Object supervisor exited before assignment with code ${result.code ?? "unknown"}`));
    });
  });
}

export async function spawnShellProcess(
  profile: TerminalShellProfile,
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<ManagedShellProcess> {
  const windows = process.platform === "win32";
  const msysGroupFile = windows && profile.kind === "git-bash"
    ? join(tmpdir(), `kk-agent-msys-group-${randomUUID()}.pid`).replace(/\\/g, "/")
    : undefined;
  const child = spawn(
    profile.executable,
    buildShellCommandArgs(profile, windows ? gatedCommand(profile, command, msysGroupFile) : command),
    {
      cwd,
      env,
      detached: true,
      windowsHide: true,
      stdio: [windows ? "pipe" : "ignore", "pipe", "pipe"],
    },
  );
  await waitForSpawn(child);

  if (windows) {
    let controller: WindowsJobController | undefined;
    try {
      controller = await startWindowsJobController(child.pid!);
      const assignedController = controller;
      child.stdin?.end("start\n");
      const pgid = msysGroupFile ? await readMsysProcessGroup(msysGroupFile) : undefined;
      if (msysGroupFile) await rm(msysGroupFile, { force: true }).catch(() => undefined);
      let termination: Promise<ProcessTermination> | undefined;
      const terminate = () => {
        termination ??= (async () => {
          const startedAt = Date.now();
          const msys = pgid === undefined ? undefined : await terminateMsysProcessGroup(profile, pgid);
          const job = await assignedController.terminate();
          const success = job.success && (msys?.success ?? true);
          const error = [msys?.error, job.error].filter(Boolean).join("; ");
          return {
            method: pgid === undefined ? "windows_job" as const : "windows_job_msys_group" as const,
            success,
            durationMs: Date.now() - startedAt,
            ...(error ? { error } : {}),
          };
        })();
        return termination;
      };
      return {
        child,
        terminate,
        finalizeAfterExit: terminate,
      };
    } catch (error) {
      if (msysGroupFile) await rm(msysGroupFile, { force: true }).catch(() => undefined);
      await controller?.terminate().catch(() => undefined);
      child.stdin?.destroy();
      child.kill("SIGKILL");
      throw error;
    }
  }

  let termination: Promise<ProcessTermination> | undefined;
  const terminate = () => {
    termination ??= Promise.resolve().then(() => {
      const startedAt = Date.now();
      try {
        process.kill(-child.pid!, "SIGKILL");
        return { method: "process_group" as const, success: true, durationMs: Date.now() - startedAt };
      } catch (groupError) {
        try {
          child.kill("SIGKILL");
          return { method: "root_process" as const, success: true, durationMs: Date.now() - startedAt };
        } catch {
          return {
            method: "root_process" as const,
            success: false,
            durationMs: Date.now() - startedAt,
            error: groupError instanceof Error ? groupError.message : String(groupError),
          };
        }
      }
    });
    return termination;
  };
  return { child, terminate, finalizeAfterExit: async () => undefined };
}

export function terminateProcessTree(processHandle: ManagedShellProcess): Promise<ProcessTermination> {
  const child = processHandle.child;
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return processHandle.finalizeAfterExit().then((result) => result ?? {
      method: "already_exited",
      success: true,
      durationMs: 0,
    });
  }
  return processHandle.terminate();
}

export function waitForProcess(processHandle: ManagedShellProcess): Promise<ProcessCompletion> {
  const child = processHandle.child;
  const closed = new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
  return new Promise((resolveCompletion) => {
    let settled = false;
    const settle = async (completion: ProcessCompletion) => {
      if (settled) return;
      settled = true;
      const containment = await processHandle.finalizeAfterExit();
      await Promise.race([
        closed,
        new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, OUTPUT_DRAIN_TIMEOUT_MS)),
      ]);
      if (containment && !containment.success && !completion.error) {
        completion.error = new Error(containment.error ?? "Process containment cleanup failed");
        completion.code = 1;
      }
      resolveCompletion(completion);
    };
    child.once("error", (error) => { void settle({ code: 1, error }); });
    child.once("exit", (code, signal) => { void settle({ code: code ?? 1, ...(signal ? { signal } : {}) }); });
  });
}

export async function drainProcessOutput(processHandle: ManagedShellProcess): Promise<void> {
  const child = processHandle.child;
  const streams = [child.stdout, child.stderr].filter((stream) => stream && !stream.destroyed && !stream.readableEnded);
  if (streams.length === 0) return;
  await Promise.race([
    Promise.all(streams.map((stream) => new Promise<void>((resolveStream) => {
      const finish = () => resolveStream();
      stream!.once("end", finish);
      stream!.once("close", finish);
      stream!.once("error", finish);
    }))),
    new Promise<void>((resolveDrain) => setTimeout(resolveDrain, OUTPUT_DRAIN_TIMEOUT_MS)),
  ]);
}

export function closeProcessOutput(processHandle: ManagedShellProcess): void {
  processHandle.child.stdout?.destroy();
  processHandle.child.stderr?.destroy();
}
