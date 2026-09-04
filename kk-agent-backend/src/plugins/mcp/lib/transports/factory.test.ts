import assert from "node:assert/strict";
import test from "node:test";
import type { McpServerConfig } from "../../types.js";
import { replaceRuntimeCredentials } from "../credentials.js";
import { buildStdioEnvironment, createMcpTransport } from "./factory.js";

const config: McpServerConfig = {
  id: "test",
  name: "Test",
  active: true,
  instruction: "",
  transport: "streamable-http",
  server: { url: "https://example.com/mcp" },
  credentialBindings: [{
    id: "token",
    label: "Token",
    credentialId: "test/token",
    required: true,
    target: { kind: "header", name: "Authorization", prefix: "Bearer " },
  }],
};

test("transport creation fails closed when a required credential is missing", () => {
  replaceRuntimeCredentials({});
  assert.throws(() => createMcpTransport(config), /requires credential "Token"/);
  replaceRuntimeCredentials({ "test/token": "secret" });
  assert.doesNotThrow(() => createMcpTransport(config));
  replaceRuntimeCredentials({});
});

test("stdio MCPs do not inherit private backend tokens", () => {
  const previousApiToken = process.env.KK_AGENT_API_TOKEN;
  const previousHostToken = process.env.KK_AGENT_HOST_TOKEN;
  process.env.KK_AGENT_API_TOKEN = "api-secret";
  process.env.KK_AGENT_HOST_TOKEN = "host-secret";
  try {
    const stdioConfig: McpServerConfig = {
      ...config,
      transport: "stdio",
      server: { command: "node", args: [], env: { EXPLICIT_VALUE: "yes" } },
      credentialBindings: undefined,
    };
    const env = buildStdioEnvironment(stdioConfig, stdioConfig.server as { command: string; args: string[]; env?: Record<string, string> });
    assert.equal(env?.KK_AGENT_API_TOKEN, undefined);
    assert.equal(env?.KK_AGENT_HOST_TOKEN, undefined);
    assert.equal(env?.EXPLICIT_VALUE, "yes");
  } finally {
    if (previousApiToken === undefined) delete process.env.KK_AGENT_API_TOKEN;
    else process.env.KK_AGENT_API_TOKEN = previousApiToken;
    if (previousHostToken === undefined) delete process.env.KK_AGENT_HOST_TOKEN;
    else process.env.KK_AGENT_HOST_TOKEN = previousHostToken;
  }
});
