import test from "node:test";
import assert from "node:assert/strict";
import { ToolExecutor } from "./tool-executor.js";
import type { TranscriptToolUseBlock } from "../../lib/transcript.js";

function toolUse(id: string, name: string, input: Record<string, unknown>): TranscriptToolUseBlock {
  return { type: "tool_use", id, name, input };
}

test("ToolExecutor runs concurrency-safe tools in parallel and preserves output order", async () => {
  const startTimes = new Map<string, number>();

  const executor = new ToolExecutor(
    async (toolName) => {
      startTimes.set(toolName, Date.now());
      await new Promise((resolve) => setTimeout(resolve, toolName === "read_file" ? 40 : 20));
      return { content: `${toolName} ok` };
    },
    "edit",
  );

  const results = await executor.execute([
    toolUse("1", "read_file", { path: "a" }),
    toolUse("2", "grep", { pattern: "TODO" }),
  ]);

  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((message) => message.content[0] && "tool_use_id" in message.content[0] ? message.content[0].tool_use_id : ""),
    ["1", "2"],
  );

  const readStart = startTimes.get("read_file") ?? 0;
  const grepStart = startTimes.get("grep") ?? 0;
  assert.ok(Math.abs(readStart - grepStart) < 20);
});

test("ToolExecutor serializes mutating tools after concurrent batches", async () => {
  const order: string[] = [];

  const executor = new ToolExecutor(
    async (toolName) => {
      order.push(`start:${toolName}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(`end:${toolName}`);
      return { content: `${toolName} ok` };
    },
    "edit",
  );

  await executor.execute([
    toolUse("1", "read_file", { path: "a" }),
    toolUse("2", "run_command", { command: "echo hi" }),
  ]);

  const endReadFile = order.indexOf("end:read_file");
  const startMutating = order.indexOf("start:run_command");
  assert.ok(endReadFile >= 0 && startMutating > endReadFile);
});

