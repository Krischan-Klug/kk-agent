import type { ApprovalMode } from "../../../mcp/types.js";
import type { ModeBehavior } from "../../../agent/types.js";
import type { RuntimeToolPermissionPolicy } from "../../../loop/types.js";
import { isDestructiveShellCommand, isReadOnlyShellCommand } from "./command-policy.js";
import type { TerminalShellDialect } from "./shell-profile.js";

export const TERMINAL_RUN_GRANT_KEY = "terminal:destructive";

export function resolveApprovalMode(mode?: ApprovalMode): ApprovalMode {
  return mode === "full_access" ? "full_access" : "ask_approval";
}

export function getTerminalApprovalInstruction(mode?: ApprovalMode): string {
  return resolveApprovalMode(mode) === "full_access"
    ? "Approval mode is full access. Execute permitted terminal commands without asking the user for confirmation. Never use ask_user for command or tool approval."
    : "Approval mode is ask approval. The harness automatically requests approval immediately before protected terminal commands. Do not request command or tool approval through ask_user or in normal chat text.";
}

export function resolveTerminalCommandPermission(input: {
  command: string;
  modeBehavior: ModeBehavior;
  shellDialect?: TerminalShellDialect;
  approvalMode?: ApprovalMode;
}): RuntimeToolPermissionPolicy {
  const command = input.command.trim();
  if (!command) return { kind: "deny", reason: "Terminal requires a command." };
  if (!input.shellDialect) {
    return { kind: "deny", reason: "Terminal is unavailable because no supported shell was detected." };
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
