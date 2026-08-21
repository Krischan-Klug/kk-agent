import assert from "node:assert/strict";
import test from "node:test";
import { toolUseBlock } from "kk-agent-contract";
import { StreamingToolExecutor } from "../../loop/lib/tool-executor.js";
import type { RuntimeToolDefinition } from "../../loop/types.js";
import { withHarnessToolCallDescription } from "./tool-call-description.js";

test("harness adds a minimal tool description without model input", () => {
  assert.deepEqual(withHarnessToolCallDescription("create_tasks", { tasks: [] }), {
    tasks: [],
    tool_call_description: "create tasks",
  });
});

test("harness preserves a provided tool description", () => {
  const input = { query: "docs", tool_call_description: "Search docs" };
  assert.equal(withHarnessToolCallDescription("WebSearch", input), input);
});

test("tool executor adds display text without sending it to the tool", async () => {
  const toolUse = toolUseBlock("call-1", "Read", { file_path: "README.md" });
  let executionInput: Record<string, unknown> | undefined;
  let displayInput: Record<string, unknown> | undefined;
  const runtimeTool: RuntimeToolDefinition = {
    name: "Read",
    description: "Read a file.",
    parameters: { type: "object" },
    source: "system",
    capabilityId: "filesystem",
    isConcurrencySafe: () => true,
    resultPolicy: {},
    permissionPolicy: { kind: "allow" },
  };
  const executor = new StreamingToolExecutor(
    async (_toolName, input) => {
      executionInput = input;
      return { content: "ok" };
    },
    { id: "edit", behavior: "edit" },
    { Read: runtimeTool },
    async () => ({ allowed: true }),
    (update) => {
      displayInput = update.input;
    },
  );

  executor.addTool(toolUse);
  await executor.getFinalResults();

  assert.equal(toolUse.input.tool_call_description, undefined);
  assert.deepEqual(executionInput, { file_path: "README.md" });
  assert.equal(displayInput?.tool_call_description, "Read");
});
