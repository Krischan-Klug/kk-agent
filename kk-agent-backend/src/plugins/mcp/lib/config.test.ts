import assert from "node:assert/strict";
import test from "node:test";
import type { McpServerConfig } from "../types.js";
import { validateMcpConfig } from "./config.js";

test("credential targets must match the configured MCP transport", () => {
  const config: McpServerConfig = {
    id: "test",
    name: "Test",
    active: false,
    instruction: "",
    transport: "stdio",
    server: { command: "node", args: [] },
    credentialBindings: [{
      id: "token",
      label: "Token",
      credentialId: "test/token",
      required: true,
      target: { kind: "header", name: "Authorization" },
    }],
  };
  assert.throws(() => validateMcpConfig(config), /must target env/);
});
