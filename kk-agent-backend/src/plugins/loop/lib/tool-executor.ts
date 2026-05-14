import {
  createTranscriptMessage,
  normalizeToolResultContent,
  toolResultBlock,
  type TranscriptBlock,
  type TranscriptMessage,
  type TranscriptToolUseBlock,
} from "../../lib/transcript.js";
import type { ToolExecutionStatus } from "kk-agent-contract";
import type {
  ModeRuntimeRef,
  RuntimeToolDefinition,
  ToolExecutionResult,
  ToolRuntimeContext,
} from "../types.js";
import { getErrorMessage } from "../../../lib/error.js";
import { fitToolResultsToBudget, persistLargeToolResult } from "./tool-result-storage.js";
import { stripDisplayOnlyInputKeys } from "../../session/lib/tool-call-description.js";

interface ToolExecutionUpdate {
  toolUseId: string;
  toolName: string;
  input?: Record<string, unknown>;
  status: ToolExecutionStatus;
  result?: TranscriptMessage;
  detail?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

type TrackedTool = {
  toolUse: TranscriptToolUseBlock;
  runtimeTool?: RuntimeToolDefinition;
  status: ToolExecutionStatus;
  isConcurrencySafe: boolean;
  result?: { content: string; isError: boolean; metadata?: Record<string, unknown> };
  streamedResult?: TranscriptMessage;
  finalResult?: TranscriptMessage;
  assistantBlocks?: TranscriptBlock[];
  additionalMessages?: TranscriptMessage[];
  yielded: boolean;
  promise?: Promise<void>;
  contextModifier?: (context: ToolRuntimeContext) => ToolRuntimeContext;
  metadata?: Record<string, unknown>;
};

function toToolResultMessage(toolUse: TranscriptToolUseBlock, content: string, isError = false): TranscriptMessage {
  return createTranscriptMessage({
    role: "tool",
    content: [toolResultBlock(toolUse.id, normalizeToolResultContent(toolUse.name, content), isError)],
  });
}

function toSyntheticErrorMessage(toolUse: TranscriptToolUseBlock, message: string): TranscriptMessage {
  return toToolResultMessage(toolUse, message, true);
}

function partitionCanRunTogether(executing: TrackedTool[], next: TrackedTool): boolean {
  return executing.length === 0 || (next.isConcurrencySafe && executing.every((entry) => entry.isConcurrencySafe));
}

export class StreamingToolExecutor {
  private readonly tools: TrackedTool[] = [];
  private discarded = false;
  private runtimeContext: ToolRuntimeContext = { values: {} };

  constructor(
    private readonly executeTool: (
      toolName: string,
      args: Record<string, unknown>,
      mode: ModeRuntimeRef,
      context: ToolRuntimeContext,
    ) => Promise<ToolExecutionResult>,
    private readonly mode: ModeRuntimeRef,
    private readonly runtimeToolsByName: Record<string, RuntimeToolDefinition>,
    private readonly resolveToolPermission: (
      runtimeTool: RuntimeToolDefinition,
      toolName: string,
      args: Record<string, unknown>,
      mode: ModeRuntimeRef,
    ) => Promise<{ allowed: boolean; reason?: string }>,
    private readonly onUpdate?: (update: ToolExecutionUpdate) => void,
    initialContext: ToolRuntimeContext = { values: {} },
  ) {
    this.runtimeContext = {
      values: { ...initialContext.values },
    };
  }

  addTool(toolUse: TranscriptToolUseBlock): void {
    if (this.tools.some((entry) => entry.toolUse.id === toolUse.id)) return;

    const runtimeTool = this.runtimeToolsByName[toolUse.name];
    const executionInput = runtimeTool
      ? stripDisplayOnlyInputKeys(toolUse.input, runtimeTool.display?.displayOnlyInputKeys)
      : toolUse.input;
    const tracked: TrackedTool = {
      toolUse,
      runtimeTool,
      status: runtimeTool ? "queued" : "invalid",
      isConcurrencySafe: runtimeTool ? runtimeTool.isConcurrencySafe(executionInput) : false,
      yielded: false,
    };
    this.tools.push(tracked);

    if (!runtimeTool) {
      const message = `Tool "${toolUse.name}" is not available in the current runtime configuration.`;
      this.finishWithSyntheticError(tracked, "invalid", message);
      return;
    }

    this.emitUpdate(tracked, {
      status: "queued",
      detail: `Queued ${toolUse.name}`,
    });
    void this.processQueue();
  }

  discardPending(reason = "Tool execution was discarded before completion."): void {
    this.discarded = true;
    for (const tracked of this.tools) {
      if (tracked.yielded || tracked.status === "completed" || tracked.status === "error" || tracked.status === "invalid") {
        continue;
      }
      this.finishWithSyntheticError(tracked, "discarded", reason, { flush: false });
    }
  }

  async getFinalResults(): Promise<TranscriptMessage[]> {
    await Promise.all(this.tools.map((tool) => tool.promise).filter((promise): promise is Promise<void> => Boolean(promise)));
    this.flushReadyResults();

    const ordered = this.tools.map((tool) => ({
      tool,
      content: tool.result?.content ?? "",
      isError: tool.result?.isError === true,
      policy: tool.runtimeTool?.resultPolicy,
    }));

    const persistedContents = await Promise.all(
      ordered.map(async ({ tool, content, policy }) => ({
        tool,
        isError: tool.result?.isError === true,
        content: await persistLargeToolResult(tool.toolUse.id, tool.toolUse.name, content, policy),
        policy,
      })),
    );

    const finalContents = fitToolResultsToBudget(
      persistedContents.map((entry) => ({
        toolName: entry.tool.toolUse.name,
        content: entry.content,
        policy: entry.policy,
      })),
    );

    const results: TranscriptMessage[] = [];
    finalContents.forEach((content, index) => {
      const entry = persistedContents[index]!;
      const finalMessage = toToolResultMessage(entry.tool.toolUse, content, entry.isError);
      entry.tool.finalResult = finalMessage;
      results.push(finalMessage);
      if (entry.tool.additionalMessages?.length) {
        results.push(...entry.tool.additionalMessages);
      }
    });

    return results;
  }

  getRuntimeContext(): ToolRuntimeContext {
    return this.runtimeContext;
  }

  getAssistantBlocks(): TranscriptBlock[] {
    const blocks: TranscriptBlock[] = [];
    for (const tracked of this.tools) {
      if (tracked.assistantBlocks?.length) {
        blocks.push(...tracked.assistantBlocks);
      }
    }
    return blocks;
  }

  private emitUpdate(tracked: TrackedTool, update: Omit<ToolExecutionUpdate, "toolUseId" | "toolName" | "input">): void {
    this.onUpdate?.({
      toolUseId: tracked.toolUse.id,
      toolName: tracked.toolUse.name,
      input: tracked.toolUse.input,
      ...update,
    });
  }

  private finishWithSyntheticError(
    tracked: TrackedTool,
    status: Extract<ToolExecutionStatus, "discarded" | "error" | "invalid">,
    message: string,
    options: { emit?: boolean; flush?: boolean } = {},
  ): void {
    const emit = options.emit ?? true;
    const flush = options.flush ?? true;
    tracked.status = status;
    tracked.result = { content: message, isError: true };
    tracked.streamedResult = toSyntheticErrorMessage(tracked.toolUse, message);
    tracked.finalResult = tracked.streamedResult;
    if (emit) {
      this.emitUpdate(tracked, {
        status,
        result: tracked.streamedResult,
        detail: message,
      });
    }
    if (flush) this.flushReadyResults();
  }

  private async processQueue(): Promise<void> {
    while (true) {
      const executing = this.tools.filter((entry) => entry.status === "executing");
      const next = this.tools.find((entry) => entry.status === "queued");
      if (!next) return;
      if (!partitionCanRunTogether(executing, next)) return;
      void this.executeTrackedTool(next);
      if (!next.isConcurrencySafe) return;
    }
  }

  private async executeTrackedTool(tracked: TrackedTool): Promise<void> {
    tracked.status = "executing";
    this.emitUpdate(tracked, {
      status: "executing",
      detail: `Executing ${tracked.toolUse.name}`,
    });

    tracked.promise = (async () => {
      if (this.discarded) {
        this.finishWithSyntheticError(tracked, "discarded", "Tool execution was discarded before start.", {
          emit: false,
          flush: false,
        });
        return;
      }

      const runtimeTool = tracked.runtimeTool!;
      const executionInput = stripDisplayOnlyInputKeys(
        tracked.toolUse.input,
        runtimeTool.display?.displayOnlyInputKeys,
      );
      const permission = await this.resolveToolPermission(runtimeTool, tracked.toolUse.name, executionInput, this.mode);
      if (!permission.allowed) {
        const message = permission.reason ?? `Tool "${tracked.toolUse.name}" was blocked by runtime permissions.`;
        this.finishWithSyntheticError(tracked, "error", message);
        return;
      }

      try {
        const execution = await this.executeTool(
          tracked.toolUse.name,
          executionInput,
          this.mode,
          this.runtimeContext,
        );
        if (this.discarded) {
          this.finishWithSyntheticError(tracked, "discarded", "Tool execution was discarded after completion.");
          return;
        }

        tracked.result = {
          content: execution.content,
          isError: execution.isError === true,
          metadata: execution.metadata,
        };
        tracked.assistantBlocks = execution.assistantBlocks;
        tracked.additionalMessages = execution.additionalMessages;
        tracked.streamedResult = toToolResultMessage(
          tracked.toolUse,
          tracked.result.content,
          tracked.result.isError,
        );
        tracked.status = tracked.result.isError ? "error" : "completed";
        tracked.metadata = execution.metadata;
        tracked.contextModifier = execution.contextModifier;

        this.emitUpdate(tracked, {
          status: tracked.result.isError ? "error" : "completed",
          result: tracked.streamedResult,
          detail: tracked.result.isError ? `${tracked.toolUse.name} failed` : `${tracked.toolUse.name} completed`,
          summary: `${tracked.toolUse.name} ${tracked.result.isError ? "failed" : "completed"}`,
          metadata: execution.metadata,
        });
        this.flushReadyResults();
      } catch (error) {
        this.finishWithSyntheticError(tracked, "error", getErrorMessage(error));
      } finally {
        void this.processQueue();
      }
    })();

    await tracked.promise;
  }

  private flushReadyResults(): void {
    for (const tracked of this.tools) {
      if (tracked.yielded) continue;
      if (!tracked.streamedResult) break;
      tracked.yielded = true;
      if (tracked.contextModifier) {
        this.runtimeContext = tracked.contextModifier(this.runtimeContext);
      }
      this.emitUpdate(tracked, {
        status: tracked.result?.isError ? "error" : "yielded",
        result: tracked.streamedResult,
        detail: tracked.result?.isError ? `${tracked.toolUse.name} failed` : `${tracked.toolUse.name} yielded`,
        summary: `${tracked.toolUse.name} result ready`,
        metadata: tracked.metadata,
      });
    }
  }
}
