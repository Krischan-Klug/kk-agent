import test from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop } from "./agent-loop.js";
import { createTranscriptMessage, textBlock, toolUseBlock } from "../../lib/transcript.js";
import type { LoopOptions } from "../types.js";

const PROMPT_SECTIONS = {
  identity: "Identity",
  system: "System",
  runtime: "Runtime",
  tasks: "Tasks",
  security: "Security",
  toolUsage: "Tools",
  communication: "Communication",
} as const;

function buildOptions(overrides: Partial<LoopOptions> = {}): LoopOptions {
  return {
    agentId: "agent-1",
    sessionId: "session-1",
    providerId: "provider-1",
    model: "model-1",
    messages: [],
    modeConfigs: {
      edit: {
        promptSections: PROMPT_SECTIONS,
        modeInstruction: "Do the work.",
        mcpInstructions: "",
        skillsCatalog: "",
        activeSkillIds: [],
        skillInstructionsById: {},
        allTools: [{ name: "demo_tool", description: "Demo tool", parameters: {} }],
        runtimeToolsByName: {
          demo_tool: {
            name: "demo_tool",
            description: "Demo tool",
            parameters: {},
            source: "system",
            capabilityId: "demo_tool",
            inputSchema: {},
            isConcurrencySafe: () => true,
            interruptBehavior: "block",
            resultPolicy: {},
            permissionPolicy: { kind: "allow" },
          },
        },
      },
    },
    activeMode: "edit",
    agentVariables: {},
    executeTool: async () => ({ content: "tool-finished" }),
    ...overrides,
  };
}

test("runAgentLoop keeps going across multiple tool turns until the model stops", async (t) => {
  let callCount = 0;
  const modelPassRunner: LoopOptions["modelPassRunner"] = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        message: createTranscriptMessage({
          role: "assistant",
          content: [toolUseBlock("tool-1", "demo_tool", { step: 1 })],
        }),
        finishReason: "tool_use" as const,
      };
    }
    if (callCount === 2) {
      return {
        message: createTranscriptMessage({
          role: "assistant",
          content: [toolUseBlock("tool-2", "demo_tool", { step: 2 })],
        }),
        finishReason: "tool_use" as const,
      };
    }
    return {
      message: createTranscriptMessage({
        role: "assistant",
        content: [textBlock("done")],
      }),
      finishReason: "stop" as const,
    };
  };

  const result = await runAgentLoop(buildOptions({ modelPassRunner }));

  assert.equal(callCount, 3);
  assert.equal(result.iterations, 3);
  assert.equal(result.finalResponse, "done");
  assert.deepEqual(
    result.messages
      .filter((message) => message.role === "tool")
      .flatMap((message) => message.content)
      .filter((block) => block.type === "tool_result")
      .map((block) => block.type === "tool_result" ? block.tool_use_id : ""),
    ["tool-1", "tool-2"],
  );
});

test("runAgentLoop autonomous mode still stops on TASK_COMPLETE", async () => {
  const modelPassRunner: LoopOptions["modelPassRunner"] = async () => ({
    message: createTranscriptMessage({
      role: "assistant",
      content: [textBlock("TASK_COMPLETE")],
    }),
    finishReason: "stop" as const,
  });

  const result = await runAgentLoop(buildOptions({
    activeMode: "autonomous",
    modeConfigs: {
      autonomous: {
        promptSections: PROMPT_SECTIONS,
        modeInstruction: "Keep working.",
        mcpInstructions: "",
        skillsCatalog: "",
        activeSkillIds: [],
        skillInstructionsById: {},
        allTools: [],
        runtimeToolsByName: {},
      },
    },
    autonomous: true,
    modelPassRunner,
  }));

  assert.equal(result.iterations, 1);
  assert.equal(result.finalResponse, "TASK_COMPLETE");
});

test("runAgentLoop appends tool-provided assistant attachment blocks to the owning assistant turn", async () => {
  let callCount = 0;
  const streamedBlocks: string[] = [];
  const modelPassRunner: LoopOptions["modelPassRunner"] = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        message: createTranscriptMessage({
          role: "assistant",
          id: "assistant-1",
          content: [toolUseBlock("tool-1", "demo_tool", { filename: "summary.md" })],
        }),
        finishReason: "tool_use" as const,
      };
    }
    return {
      message: createTranscriptMessage({
        role: "assistant",
        content: [textBlock("done")],
      }),
      finishReason: "stop" as const,
    };
  };

  const result = await runAgentLoop(buildOptions({
    executeTool: async () => ({
      content: "attachment ready",
      assistantBlocks: [{
        type: "attachment_ref",
        attachmentId: "att-1",
        filename: "summary.md",
        mimeType: "text/markdown",
        category: "text",
        source: "assistant",
        size: 22,
      }],
    }),
    modelPassRunner,
    onAssistantBlockDelta: (_messageId, block) => {
      if (block.type === "attachment_ref") streamedBlocks.push(block.filename);
    },
  }));

  const firstAssistant = result.messages.find((message) => message.role === "assistant");
  const attachmentBlock = firstAssistant?.content.find((block) => block.type === "attachment_ref");

  assert.equal(streamedBlocks[0], "summary.md");
  assert.ok(attachmentBlock && attachmentBlock.type === "attachment_ref");
  assert.equal(attachmentBlock?.source, "assistant");
  assert.equal(attachmentBlock?.attachmentId, "att-1");
});
