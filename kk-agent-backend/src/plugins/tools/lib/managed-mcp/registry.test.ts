import assert from "node:assert/strict";
import test from "node:test";
import { buildManagedInternalToolDefinitions, buildManagedMcpConfig, listManagedMcpManifests } from "./registry.js";

test("Context7 is a validated streamable HTTP managed MCP", () => {
  const manifest = listManagedMcpManifests().find((entry) => entry.id === "context7");
  assert.ok(manifest);
  assert.equal(manifest.connection.transport, "streamable-http");
  assert.deepEqual(manifest.allowedTools, ["resolve-library-id", "query-docs"]);

  const tool = buildManagedInternalToolDefinitions().find((entry) => entry.id === "context7");
  assert.ok(tool);
  assert.equal(tool.driver, "mcp");
  assert.match(tool.instruction, /must use Context7 before any web tool/);
  assert.match(tool.instruction, /Use WebSearch, WebOpen, WebFind, or WebFetch only if Context7 is unavailable/);
  assert.match(tool.instruction, /user explicitly asks you to inspect a specific source/);
  const config = buildManagedMcpConfig(tool);
  assert.equal(config?.transport, "streamable-http");
  assert.equal(config?.credentialBindings?.[0]?.required, false);
});
