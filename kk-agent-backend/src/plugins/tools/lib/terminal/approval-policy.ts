import type { ApprovalMode } from "../../types.js";
import type { ModeBehavior } from "../../../agent/types.js";
import type { RuntimeToolPermissionPolicy } from "../../../loop/types.js";
import {
  isDestructiveShellCommand,
  isReadOnlyShellCommand,
  isUnmanagedProcessTerminationCommand,
} from "./command-policy.js";
import type { TerminalShellDialect } from "./shell-profile.js";

export const TERMINAL_RUN_GRANT_KEY = "terminal:destructive";

export function resolveApprovalMode(mode?: ApprovalMode): ApprovalMode {
  return mode === "full_access" ? "full_access" : "ask_approval";
}

export function resolveTerminalCommandPermission(input: {
  action?: unknown;
  command: string;
  taskId?: unknown;
  modeBehavior: ModeBehavior;
  shellDialect?: TerminalShellDialect;
  approvalMode?: ApprovalMode;
}): RuntimeToolPermissionPolicy {
  const action = input.action === undefined ? "run" : String(input.action).trim().toLowerCase();
  if (!new Set(["run", "status", "stop"]).has(action)) {
    return { kind: "deny", reason: `Unsupported Terminal action "${action}".` };
  }
  if (action === "status" || action === "stop") {
    if (!String(input.taskId ?? "").trim()) {
      return { kind: "deny", reason: `Terminal action "${action}" requires taskId.` };
    }
    if (action === "stop" && input.modeBehavior === "plan") {
      return { kind: "deny", reason: "Im Plan-Mode duerfen Terminal-Tasks nicht gestoppt werden." };
    }
    return { kind: "allow" };
  }

  const command = input.command.trim();
  if (!command) return { kind: "deny", reason: "Terminal requires a command." };
  if (!input.shellDialect) {
    return { kind: "deny", reason: "Terminal is unavailable because no supported shell was detected." };
  }
  if (isUnmanagedProcessTerminationCommand(command)) {
    return {
      kind: "deny",
      reason: "Raw process-termination commands are disabled. Use Terminal action=\"stop\" with a managed taskId.",
    };
  }
  if (input.modeBehavior === "plan" && !isReadOnlyShellCommand(command, input.shellDialect)) {
    return {
      kind: "deny",
      reason: "Im Plan-Mode ist Terminal nur fuer read-only Diagnose, Suche und Inspektion erlaubt.",
    };
  }
  if (resolveApprovalMode(input.approvalMode) === "full_access" || !isDestructiveShellCommand(command)) {
    return { kind: "allow" };
  }
  return {
    kind: "prompt",
    question: `Der Terminalbefehl kann lokalen Zustand loeschen oder schwer rueckgaengig machen. Ausfuehren?\n\n${command}`,
    choices: [
      { key: "allow_once", label: "Einmal erlauben" },
      { key: "allow_run", label: "Fuer diesen Run erlauben" },
      { key: "deny", label: "Ablehnen" },
    ],
    allowKeys: ["allow_once", "allow_run"],
    runGrantKey: TERMINAL_RUN_GRANT_KEY,
    grantForRunKeys: ["allow_run"],
    deniedMessage: "The terminal command was rejected by the user.",
  };
}
