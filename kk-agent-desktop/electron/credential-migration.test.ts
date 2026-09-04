import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CredentialStore } from "./credential-store.js";
import { migrateLegacyMcpCredentials } from "./credential-migration.js";

test("moves legacy MCP env and header values into encrypted credentials", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kk-agent-migration-"));
  try {
    const registryPath = path.join(directory, "mcps.json");
    await writeFile(registryPath, JSON.stringify({ mcps: [{
      id: "example",
      server: { env: { API_KEY: "secret" }, headers: { Authorization: "Bearer token" } },
    }] }));
    const store = new CredentialStore(path.join(directory, "credentials.json"), {
      encrypt: async (value) => Buffer.from(`cipher:${value}`),
      decrypt: async (value) => value.toString().slice("cipher:".length),
    });
    assert.equal(await migrateLegacyMcpCredentials(registryPath, store), 2);
    const registry = await readFile(registryPath, "utf8");
    assert.equal(registry.includes("secret"), false);
    assert.equal(registry.includes("token"), false);
    assert.deepEqual(Object.values(await store.readAll()).sort(), ["secret", "token"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
