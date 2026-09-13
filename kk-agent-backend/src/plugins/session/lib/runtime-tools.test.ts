import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeToolDefinition } from "../../loop/types.js";
import type { ResolvedInternalToolRuntime } from "../../tools/service.js";
import { buildRuntimeToolCollection } from "./runtime-tools.js";

function internalTool(name: string): RuntimeToolDefinition {
  return {
    name,
    description: `${name} test tool`,
    parameters: { type: "object", properties: {} },
    source: "internal",
    capabilityId: "filesystem",
    isConcurrencySafe: () => true,
    resultPolicy: {},
    permissionPolicy: { kind: "allow" },
  };
}

function runtime(names: string[]): ResolvedInternalToolRuntime {
  return {
    instructionsById: {},
    runtimeVariables: {},
    runtimeToolsByName: Object.fromEntries(names.map((name) => [name, internalTool(name)])),
  };
}

test("an empty per-tool selection exposes every tool of an active capability", () => {
  const names = ["Read", "Edit", "Write", "List", "Stat", "Mkdir", "Move", "Glob", "Grep"];
  const collection = buildRuntimeToolCollection(runtime(names), [], []);

  assert.deepEqual(collection.allTools.map((tool) => tool.name), names);
  assert.deepEqual(Object.keys(collection.runtimeToolsByName), names);
});

test("an explicit per-tool selection remains an intentional capability subset", () => {
  const collection = buildRuntimeToolCollection(runtime(["Read", "Edit", "Move"]), [], ["Read", "Move"]);

  assert.deepEqual(collection.allTools.map((tool) => tool.name), ["Read", "Move"]);
});
