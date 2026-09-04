import assert from "node:assert/strict";
import test from "node:test";
import { extractImportedCredentials } from "./credentialImport";

test("extracts imported environment and header secrets into credential bindings", () => {
  let index = 0;
  const result = extractImportedCredentials({
    name: "Example",
    transport: "streamable-http",
    url: "https://example.com/mcp",
    env: { API_KEY: "env-secret" },
    headers: { Authorization: "Bearer header-secret" },
  }, () => String(++index));

  assert.equal(result.body.env, undefined);
  assert.equal(result.body.headers, undefined);
  assert.deepEqual(result.pending, [
    { credentialId: "external-mcp/1", value: "env-secret" },
    { credentialId: "external-mcp/2", value: "header-secret" },
  ]);
  assert.deepEqual(result.body.credentialBindings?.map((binding) => binding.target), [
    { kind: "env", name: "API_KEY" },
    { kind: "header", name: "Authorization", prefix: "Bearer " },
  ]);
});

test("reuses an existing binding when a credential is replaced through JSON", () => {
  const result = extractImportedCredentials({
    name: "Example",
    transport: "stdio",
    command: "node",
    env: { API_KEY: "new-secret" },
    credentialBindings: [{
      id: "env-API_KEY",
      label: "API_KEY",
      credentialId: "external-mcp/existing",
      required: true,
      target: { kind: "env", name: "API_KEY" },
    }],
  });
  assert.equal(result.body.credentialBindings?.length, 1);
  assert.deepEqual(result.pending, [{ credentialId: "external-mcp/existing", value: "new-secret" }]);
});
