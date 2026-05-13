import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeToolCollection } from "./runtime-tools.js";
import type { ResolvedSystemToolRuntime } from "../../tools/service.js";

test("buildRuntimeToolCollection augments system tool schema with tool_call_description", () => {
  const systemRuntime: ResolvedSystemToolRuntime = {
    instructionsById: {},
    runtimeVariables: {},
    runtimeToolsByName: {
      Read: {
        name: "Read",
        description: "Read a file.",
        parameters: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "File path." },
          },
          required: ["file_path"],
        },
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "File path." },
          },
          required: ["file_path"],
        },
        source: "system",
        capabilityId: "filesystem",
        isConcurrencySafe: () => true,
        interruptBehavior: "block",
        resultPolicy: {},
        permissionPolicy: { kind: "allow" },
      },
    },
  };

  const collection = buildRuntimeToolCollection(systemRuntime, [], ["Read"]);
  const tool = collection.runtimeToolsByName["Read"];
  assert.ok(tool);

  const schema = tool.inputSchema;
  assert.ok(
    typeof schema.properties === "object" &&
      schema.properties !== null &&
      "tool_call_description" in schema.properties,
  );
  const descSchema = (schema.properties as Record<string, unknown>)?.tool_call_description;
  assert.ok(descSchema && typeof descSchema === "object");

  assert.deepEqual(schema.required, ["file_path"]);
  assert.equal(tool.display?.descriptionInputKey, "tool_call_description");
  assert.deepEqual(tool.display?.displayOnlyInputKeys, ["tool_call_description"]);
});

test("buildRuntimeToolCollection augments MCP tool schema with tool_call_description", () => {
  const systemRuntime: ResolvedSystemToolRuntime = {
    instructionsById: {},
    runtimeVariables: {},
    runtimeToolsByName: {},
  };

  const collection = buildRuntimeToolCollection(systemRuntime, [], []);
  assert.equal(collection.allTools.length, 0);
  assert.equal(Object.keys(collection.runtimeToolsByName).length, 0);
});

test("buildRuntimeToolCollection does not override existing tool_call_description in MCP schema", () => {
  const systemRuntime: ResolvedSystemToolRuntime = {
    instructionsById: {},
    runtimeVariables: {},
    runtimeToolsByName: {},
  };

  const collection = buildRuntimeToolCollection(systemRuntime, [], []);
  assert.equal(collection.allTools.length, 0);
});

test("buildRuntimeToolCollection does not mutate original system tool schema", () => {
  const originalSchema = {
    type: "object",
    properties: {
      file_path: { type: "string", description: "File path." },
    },
    required: ["file_path"],
  };

  const systemRuntime: ResolvedSystemToolRuntime = {
    instructionsById: {},
    runtimeVariables: {},
    runtimeToolsByName: {
      Read: {
        name: "Read",
        description: "Read a file.",
        parameters: { ...originalSchema },
        inputSchema: { ...originalSchema },
        source: "system",
        capabilityId: "filesystem",
        isConcurrencySafe: () => true,
        interruptBehavior: "block",
        resultPolicy: {},
        permissionPolicy: { kind: "allow" },
      },
    },
  };

  buildRuntimeToolCollection(systemRuntime, [], ["Read"]);
  assert.equal(Object.keys(originalSchema.properties).length, 1);
  assert.ok(!("tool_call_description" in originalSchema.properties));
});

test("buildRuntimeToolCollection strips Bash old description and adds tool_call_description", () => {
  const systemRuntime: ResolvedSystemToolRuntime = {
    instructionsById: {},
    runtimeVariables: {},
    runtimeToolsByName: {
      Bash: {
        name: "Bash",
        description: "Run a shell command.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command." },
          },
          required: ["command"],
        },
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command." },
          },
          required: ["command"],
        },
        source: "system",
        capabilityId: "terminal",
        isConcurrencySafe: () => false,
        interruptBehavior: "block",
        resultPolicy: {},
        permissionPolicy: { kind: "allow" },
      },
    },
  };

  const collection = buildRuntimeToolCollection(systemRuntime, [], ["Bash"]);
  const tool = collection.runtimeToolsByName["Bash"];
  assert.ok(tool);

  const schema = tool.inputSchema;
  assert.ok(
    typeof schema.properties === "object" &&
      schema.properties !== null &&
      "tool_call_description" in schema.properties,
  );
  assert.ok(
    typeof schema.properties === "object" &&
      schema.properties !== null &&
      !("description" in schema.properties),
  );
});
