import type { CreateMcpBody, McpCredentialBinding } from "kk-agent-contract";

export type PendingCredential = {
  credentialId: string;
  value: string;
};

export function extractImportedCredentials(
  body: CreateMcpBody,
  createId: () => string = () => crypto.randomUUID(),
): { body: CreateMcpBody; pending: PendingCredential[] } {
  const bindings: McpCredentialBinding[] = [...(body.credentialBindings ?? [])];
  const pending: PendingCredential[] = [];

  function addCredential(
    kind: "env" | "header",
    name: string,
    value: string,
    prefix?: string,
  ): void {
    const existing = bindings.find((binding) =>
      binding.target.kind === kind && binding.target.name.toLowerCase() === name.toLowerCase(),
    );
    const credentialId = existing?.credentialId ?? `external-mcp/${createId()}`;
    if (existing && kind === "header") {
      const index = bindings.indexOf(existing);
      bindings[index] = { ...existing, target: { kind, name, ...(prefix ? { prefix } : {}) } };
    } else if (!existing) {
      bindings.push({
        id: `${kind}-${name}`,
        label: name,
        credentialId,
        required: true,
        target: kind === "env" ? { kind, name } : { kind, name, ...(prefix ? { prefix } : {}) },
      });
    }
    pending.push({ credentialId, value });
  }

  for (const [name, value] of Object.entries(body.env ?? {})) {
    addCredential("env", name, value);
  }

  for (const [name, rawValue] of Object.entries(body.headers ?? {})) {
    const isBearer = name.toLowerCase() === "authorization" && rawValue.toLowerCase().startsWith("bearer ");
    const value = isBearer ? rawValue.slice("bearer ".length) : rawValue;
    addCredential("header", name, value, isBearer ? "Bearer " : undefined);
  }

  return {
    body: {
      ...body,
      env: undefined,
      headers: undefined,
      credentialBindings: bindings.length > 0 ? bindings : undefined,
    },
    pending,
  };
}
