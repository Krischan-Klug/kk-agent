import { createHash } from "node:crypto";

interface DenialEntry {
  toolName: string;
  argsHash: string;
  reason: string;
  at: string;
}

const MAX_ENTRIES_PER_SESSION = 5;
const denials = new Map<string, DenialEntry[]>();

function hashArgs(args: Record<string, unknown>): string {
  try {
    return createHash("sha1").update(JSON.stringify(args ?? {})).digest("hex").slice(0, 12);
  } catch {
    return "unknown";
  }
}

export function recordSessionDenial(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
  reason: string,
): void {
  if (!sessionId) return;
  const list = denials.get(sessionId) ?? [];
  list.push({
    toolName,
    argsHash: hashArgs(args),
    reason: reason || "(no reason given)",
    at: new Date().toISOString(),
  });
  while (list.length > MAX_ENTRIES_PER_SESSION) list.shift();
  denials.set(sessionId, list);
}

export function listSessionDenials(sessionId: string): DenialEntry[] {
  return denials.get(sessionId) ?? [];
}

export function clearSessionDenials(sessionId: string): void {
  denials.delete(sessionId);
}

export function buildDenialReminderBody(entries: DenialEntry[]): string {
  const lines = entries.map(
    (entry) =>
      `- ${entry.toolName} (args=${entry.argsHash}): ${entry.reason}`,
  );
  return [
    "The user previously denied the following tool calls in this session.",
    "Do not retry the exact same call. Either change the arguments meaningfully, choose a different approach, or ask the user.",
    "",
    ...lines,
  ].join("\n");
}
