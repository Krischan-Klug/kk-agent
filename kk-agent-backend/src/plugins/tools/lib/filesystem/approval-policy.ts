import type { RuntimeToolPermissionPolicy } from "../../../loop/types.js";
import type { ApprovalMode } from "../../types.js";

export const FILESYSTEM_REMOVE_GRANT_KEY = "filesystem:remove";

export function resolveFilesystemToolPermission(input: {
  toolName: string;
  args: Record<string, unknown>;
  approvalMode: ApprovalMode;
}): RuntimeToolPermissionPolicy {
  if (input.toolName !== "Remove") return { kind: "allow" };

  const path = typeof input.args.path === "string" ? input.args.path.trim() : "";
  if (!path) return { kind: "deny", reason: "Remove requires an exact path." };
  if (input.approvalMode === "full_access") return { kind: "allow" };

  return {
    kind: "prompt",
    question: `Diese Aktion loescht einen lokalen Pfad. Ausfuehren?\n\n${path}`,
    choices: [
      { key: "allow_once", label: "Einmal erlauben" },
      { key: "allow_run", label: "Fuer diesen Run erlauben" },
      { key: "deny", label: "Ablehnen" },
    ],
    allowKeys: ["allow_once", "allow_run"],
    runGrantKey: FILESYSTEM_REMOVE_GRANT_KEY,
    grantForRunKeys: ["allow_run"],
    deniedMessage: "The filesystem removal was rejected by the user.",
  };
}
