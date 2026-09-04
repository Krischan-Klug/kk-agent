import assert from "node:assert/strict";
import test from "node:test";
import { buildCredentialStatuses, redactRuntimeCredentials, replaceRuntimeCredentials, resolveCredential } from "./credentials.js";

test("runtime credentials expose only status and redact secret values", () => {
  replaceRuntimeCredentials({ "managed-mcp/context7/api-key": "top-secret" });
  assert.equal(resolveCredential("managed-mcp/context7/api-key"), "top-secret");
  assert.deepEqual(buildCredentialStatuses([{
    id: "api-key",
    label: "API key",
    credentialId: "managed-mcp/context7/api-key",
    required: false,
    target: { kind: "header", name: "Authorization", prefix: "Bearer " },
  }]), [{ id: "api-key", label: "API key", required: false, configured: true }]);
  assert.equal(redactRuntimeCredentials("failure: top-secret"), "failure: [REDACTED]");
  replaceRuntimeCredentials({});
});
