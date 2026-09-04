import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CredentialStore, type CredentialCipher } from "./credential-store.js";

const cipher: CredentialCipher = {
  encrypt: async (value) => Buffer.from(`encrypted:${value}`, "utf8"),
  decrypt: async (value) => value.toString("utf8").replace(/^encrypted:/, ""),
};

test("stores encrypted credentials and never writes plaintext", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kk-agent-credentials-"));
  try {
    const file = path.join(directory, "credentials.json");
    const store = new CredentialStore(file, cipher);
    await store.set("managed-mcp/context7/api-key", "secret-value");
    assert.deepEqual(await store.readAll(), { "managed-mcp/context7/api-key": "secret-value" });
    assert.equal((await readFile(file, "utf8")).includes("secret-value"), false);
    await store.remove("managed-mcp/context7/api-key");
    assert.deepEqual(await store.readAll(), {});
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("serializes concurrent credential mutations", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kk-agent-credentials-"));
  try {
    const store = new CredentialStore(path.join(directory, "credentials.json"), cipher);
    await Promise.all([
      store.set("external-mcp/one", "first"),
      store.set("external-mcp/two", "second"),
    ]);
    assert.deepEqual(await store.readAll(), {
      "external-mcp/one": "first",
      "external-mcp/two": "second",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
