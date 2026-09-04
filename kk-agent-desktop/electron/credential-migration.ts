import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import type { CredentialStore } from "./credential-store.js";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodedName(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export async function migrateLegacyMcpCredentials(
  registryPath: string,
  store: CredentialStore,
): Promise<number> {
  let root: JsonObject;
  try {
    const parsed: unknown = JSON.parse(await readFile(registryPath, "utf8"));
    if (!isObject(parsed)) return 0;
    root = parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  if (!Array.isArray(root.mcps)) return 0;

  const secrets: Record<string, string> = {};
  let migrated = 0;
  for (const rawMcp of root.mcps) {
    if (!isObject(rawMcp) || typeof rawMcp.id !== "string" || !isObject(rawMcp.server)) continue;
    const bindings = Array.isArray(rawMcp.credentialBindings) ? [...rawMcp.credentialBindings] : [];
    for (const [property, kind] of [["env", "env"], ["headers", "header"]] as const) {
      const values: unknown = rawMcp.server[property];
      if (!isObject(values)) continue;
      for (const [name, value] of Object.entries(values) as Array<[string, unknown]>) {
        if (typeof value !== "string" || !value) continue;
        const credentialId = `external-mcp/${rawMcp.id}/${kind}/${encodedName(name)}`;
        const bearer = kind === "header" && name.toLowerCase() === "authorization" && value.toLowerCase().startsWith("bearer ");
        secrets[credentialId] = bearer ? value.slice("bearer ".length) : value;
        bindings.push({
          id: `${kind}-${name}`,
          label: name,
          credentialId,
          required: true,
          target: { kind, name, ...(bearer ? { prefix: "Bearer " } : {}) },
        });
        migrated += 1;
      }
      delete rawMcp.server[property];
    }
    if (bindings.length > 0) rawMcp.credentialBindings = bindings;
  }

  if (migrated === 0) return 0;
  await store.setMany(secrets);
  const temporaryPath = `${registryPath}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(root, null, 2)}\n`, "utf8");
  await rename(temporaryPath, registryPath);
  return migrated;
}
