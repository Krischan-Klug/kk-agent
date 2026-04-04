import test from "node:test";
import assert from "node:assert/strict";
import { StreamingToolExecutor } from "./tool-executor.js";
import type { TranscriptToolUseBlock } from "../../lib/transcript.js";

function toolUse(id: string, name: string, input: Record<string, unknown>): TranscriptToolUseBlock {
  return { type: "tool_use", id, name, input };
}

function runtimeTool(name: string, concurrencySafe: boolean) {
  return {
    [name]: {
      name,
      description: name,
      parameters: {},
      inputSchema: {},
      source: "system" as const,
      capabilityId: "capability",
      isConcurrencySafe: () => concurrencySafe,
      interruptBehavior: "block" as const,
      resultPolicy: {},
      permissionPolicy: { kind: "allow" as const },
    },
  };
}

test("StreamingToolExecutor runs concurrency-safe tools in parallel and preserves output order", async () => {
  const startTimes = new Map<string, number>();

  const executor = new StreamingToolExecutor(
    async (toolName) => {
      startTimes.set(toolName, Date.now());
      await new Promise((resolve) => setTimeout(resolve, toolName === "read_file" ? 40 : 20));
      return { content: `${toolName} ok` };
    },
    "edit",
    {
      ...runtimeTool("read_file", true),
      ...runtimeTool("grep", true),
    },
    async () => ({ allowed: true }),
  );

  executor.addTool(toolUse("1", "read_file", { path: "a" }));
  executor.addTool(toolUse("2", "grep", { pattern: "TODO" }));
  const results = await executor.getFinalResults();

  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((message) => message.content[0] && "tool_use_id" in message.content[0] ? message.content[0].tool_use_id : ""),
    ["1", "2"],
  );

  const readStart = startTimes.get("read_file") ?? 0;
  const grepStart = startTimes.get("grep") ?? 0;
  assert.ok(Math.abs(readStart - grepStart) < 20);
});

test("StreamingToolExecutor serializes mutating tools after concurrent batches", async () => {
  const order: string[] = [];

  const executor = new StreamingToolExecutor(
    async (toolName) => {
      order.push(`start:${toolName}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(`end:${toolName}`);
      return { content: `${toolName} ok` };
    },
    "edit",
    {
      ...runtimeTool("read_file", true),
      ...runtimeTool("run_command", false),
    },
    async () => ({ allowed: true }),
  );

  executor.addTool(toolUse("1", "read_file", { path: "a" }));
  executor.addTool(toolUse("2", "run_command", { command: "echo hi" }));
  await executor.getFinalResults();

  const endReadFile = order.indexOf("end:read_file");
  const startMutating = order.indexOf("start:run_command");
  assert.ok(endReadFile >= 0 && startMutating > endReadFile);
});

test("StreamingToolExecutor blocks denied tools before execution", async () => {
  const executor = new StreamingToolExecutor(
    async () => ({ content: "should not run" }),
    "edit",
    {
      ...runtimeTool("read_file", true),
    },
    async () => ({ allowed: false, reason: "blocked by policy" }),
  );

  executor.addTool(toolUse("1", "read_file", { path: "a" }));
  const results = await executor.getFinalResults();

  assert.equal(results.length, 1);
  const resultBlock = results[0]?.content[0];
  assert.ok(resultBlock && "content" in resultBlock);
  assert.equal(resultBlock?.content.includes("blocked by policy"), true);
});

test("StreamingToolExecutor applies context modifiers in yielded order", async () => {
  const executor = new StreamingToolExecutor(
    async (toolName, _args, _mode, context) => {
      const sequence = Array.isArray(context.values.sequence) ? context.values.sequence as string[] : [];
      return {
        content: `${toolName}:${sequence.join(">") || "root"}`,
        contextModifier: (previous) => ({
          values: {
            ...previous.values,
            sequence: [...sequence, toolName],
          },
        }),
      };
    },
    "edit",
    {
      ...runtimeTool("read_file", false),
      ...runtimeTool("grep", false),
    },
    async () => ({ allowed: true }),
  );

  executor.addTool(toolUse("1", "read_file", { path: "a" }));
  executor.addTool(toolUse("2", "grep", { pattern: "TODO" }));
  const results = await executor.getFinalResults();

  const firstResult = results[0]?.content[0];
  const secondResult = results[1]?.content[0];
  assert.ok(firstResult && "content" in firstResult);
  assert.ok(secondResult && "content" in secondResult);
  assert.equal(firstResult?.content, "read_file:root");
  assert.equal(secondResult?.content, "grep:read_file");
  assert.deepEqual(executor.getRuntimeContext().values.sequence, ["read_file", "grep"]);
});

test("StreamingToolExecutor discards queued tools cleanly", async () => {
  const executor = new StreamingToolExecutor(
    async (toolName) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { content: `${toolName} ok` };
    },
    "edit",
    {
      ...runtimeTool("read_file", false),
      ...runtimeTool("grep", false),
    },
    async () => ({ allowed: true }),
  );

  executor.addTool(toolUse("1", "read_file", { path: "a" }));
  executor.addTool(toolUse("2", "grep", { pattern: "TODO" }));
  executor.discardPending("discarded for retry");
  const results = await executor.getFinalResults();

  assert.equal(results.length, 2);
  const secondResult = results[1]?.content[0];
  assert.ok(secondResult && "content" in secondResult);
  assert.equal(secondResult?.content.includes("discarded for retry"), true);
});
