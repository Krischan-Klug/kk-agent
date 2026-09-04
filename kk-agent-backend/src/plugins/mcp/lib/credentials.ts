import type { CredentialStatus, McpCredentialBinding } from "kk-agent-contract";

let runtimeCredentials = new Map<string, string>();

export function replaceRuntimeCredentials(values: Record<string, string>): Set<string> {
  const next = new Map(
    Object.entries(values).filter(([id, value]) => id.trim().length > 0 && value.length > 0),
  );
  const changed = new Set<string>();
  for (const id of new Set([...runtimeCredentials.keys(), ...next.keys()])) {
    if (runtimeCredentials.get(id) !== next.get(id)) changed.add(id);
  }
  runtimeCredentials = next;
  return changed;
}

export function resolveCredential(id: string): string | undefined {
  return runtimeCredentials.get(id);
}

export function hasCredential(id: string): boolean {
  return runtimeCredentials.has(id);
}

export function buildCredentialStatuses(bindings: McpCredentialBinding[] = []): CredentialStatus[] {
  return bindings.map((binding) => ({
    id: binding.id,
    label: binding.label,
    required: binding.required,
    configured: hasCredential(binding.credentialId),
  }));
}

export function redactRuntimeCredentials(value: string): string {
  let redacted = value;
  for (const secret of runtimeCredentials.values()) {
    if (secret.length > 0) redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted;
}
