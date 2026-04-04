import {
  createTranscriptMessage,
  normalizeToolResultContent,
  toolResultBlock,
  type TranscriptMessage,
  type TranscriptToolUseBlock,
} from "../../lib/transcript.js";
import type {
  ChatMode,
} from "../../agent/types.js";
import type {
  RuntimeToolDefinition,
  ToolExecutionResult,
  ToolExecutionStatus,
  ToolRuntimeContext,
} from "../types.js";
import { fitToolResultsToBudget, persistLargeToolResult } from "./tool-result-storage.js";

export interface ToolExecutionUpdate {
  toolUseId: string;
  toolName: string;
  status: ToolExecutionStatus;
  result?: TranscriptMessage;
  detail?: string;
  summary?: string;
}

type TrackedTool = {
  toolUse: TranscriptToolUseBlock;
  runtimeTool?: RuntimeToolDefinition;
  status: ToolExecutionStatus;
  isConcurrencySafe: boolean;
  result?: { content: string; isError: boolean };
  streamedResult?: TranscriptMessage;
  finalResult?: TranscriptMessage;
  yielded: boolean;
  promise?: Promise<void>;
  contextModifier?: (context: ToolRuntimeContext) => ToolRuntimeContext;
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
      mode: ChatMode,
      context: ToolRuntimeContext,
    ) => Promise<ToolExecutionResult>,
    private readonly mode: ChatMode,
    private readonly runtimeToolsByName: Record<string, RuntimeToolDefinition>,
    private readonly resolveToolPermission: (
      runtimeTool: RuntimeToolDefinition,
      toolName: string,
      args: Record<string, unknown>,
      mode: ChatMode,
    ) => Promise<{ allowed: boolean; reason?: string }>,
    private readonly onUpdate?: (update: ToolExecutionUpdate) => void,
  ) {}

  addTool(toolUse: TranscriptToolUseBlock): void {
    if (this.tools.some((entry) => entry.toolUse.id === toolUse.id)) return;

    const runtimeTool = this.runtimeToolsByName[toolUse.name];
    const tracked: TrackedTool = {
      toolUse,
      runtimeTool,
      status: runtimeTool ? "queued" : "invalid",
      isConcurrencySafe: runtimeTool ? runtimeTool.isConcurrencySafe(toolUse.input) : false,
      yielded: false,
    };
    this.tools.push(tracked);

    if (!runtimeTool) {
      const message = `Tool "${toolUse.name}" is not available in the current runtime configuration.`;
      tracked.result = { content: message, isError: true };
      tracked.streamedResult = toSyntheticErrorMessage(toolUse, message);
      tracked.finalResult = tracked.streamedResult;
      this.onUpdate?.({
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        status: "invalid",
        result: tracked.streamedResult,
        detail: message,
      });
      this.flushReadyResults();
      return;
    }

    this.onUpdate?.({
      toolUseId: toolUse.id,
      toolName: toolUse.name,
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
      tracked.status = "discarded";
      tracked.result = { content: reason, isError: true };
      tracked.streamedResult = toSyntheticErrorMessage(tracked.toolUse, reason);
      tracked.finalResult = tracked.streamedResult;
      this.onUpdate?.({
        toolUseId: tracked.toolUse.id,
        toolName: tracked.toolUse.name,
        status: "discarded",
        result: tracked.streamedResult,
        detail: reason,
      });
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
    });

    return results;
  }

  getRuntimeContext(): ToolRuntimeContext {
    return this.runtimeContext;
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
    this.onUpdate?.({
      toolUseId: tracked.toolUse.id,
      toolName: tracked.toolUse.name,
      status: "executing",
      detail: `Executing ${tracked.toolUse.name}`,
    });

    tracked.promise = (async () => {
      if (this.discarded) {
        const message = "Tool execution was discarded before start.";
        tracked.status = "discarded";
        tracked.result = { content: message, isError: true };
        tracked.streamedResult = toSyntheticErrorMessage(tracked.toolUse, message);
        return;
      }

      const runtimeTool = tracked.runtimeTool!;
      const permission = await this.resolveToolPermission(runtimeTool, tracked.toolUse.name, tracked.toolUse.input, this.mode);
      if (!permission.allowed) {
        const message = permission.reason ?? `Tool "${tracked.toolUse.name}" was blocked by runtime permissions.`;
        tracked.status = "error";
        tracked.result = { content: message, isError: true };
        tracked.streamedResult = toSyntheticErrorMessage(tracked.toolUse, message);
        this.onUpdate?.({
          toolUseId: tracked.toolUse.id,
          toolName: tracked.toolUse.name,
          status: "error",
          result: tracked.streamedResult,
          detail: message,
        });
        this.flushReadyResults();
        return;
      }

      try {
        const execution = await this.executeTool(
          tracked.toolUse.name,
          tracked.toolUse.input,
          this.mode,
          this.runtimeContext,
        );
        if (this.discarded) {
          const message = "Tool execution was discarded after completion.";
          tracked.status = "discarded";
          tracked.result = { content: message, isError: true };
          tracked.streamedResult = toSyntheticErrorMessage(tracked.toolUse, message);
          this.onUpdate?.({
            toolUseId: tracked.toolUse.id,
            toolName: tracked.toolUse.name,
            status: "discarded",
            result: tracked.streamedResult,
            detail: message,
          });
          this.flushReadyResults();
          return;
        }

        tracked.result = {
          content: execution.content,
          isError: execution.isError === true,
        };
        tracked.streamedResult = toToolResultMessage(
          tracked.toolUse,
          tracked.result.content,
          tracked.result.isError,
        );
        tracked.status = tracked.result.isError ? "error" : "completed";

        tracked.contextModifier = execution.contextModifier;

        this.onUpdate?.({
          toolUseId: tracked.toolUse.id,
          toolName: tracked.toolUse.name,
          status: tracked.result.isError ? "error" : "completed",
          result: tracked.streamedResult,
          detail: tracked.result.isError ? `${tracked.toolUse.name} failed` : `${tracked.toolUse.name} completed`,
          summary: `${tracked.toolUse.name} ${tracked.result.isError ? "failed" : "completed"}`,
        });
        this.flushReadyResults();
      } catch (error) {
        const message = (error as Error).message;
        tracked.status = "error";
        tracked.result = { content: message, isError: true };
        tracked.streamedResult = toSyntheticErrorMessage(tracked.toolUse, message);
        this.onUpdate?.({
          toolUseId: tracked.toolUse.id,
          toolName: tracked.toolUse.name,
          status: "error",
          result: tracked.streamedResult,
          detail: message,
        });
        this.flushReadyResults();
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
      this.onUpdate?.({
        toolUseId: tracked.toolUse.id,
        toolName: tracked.toolUse.name,
        status: tracked.result?.isError ? "error" : "yielded",
        result: tracked.streamedResult,
        detail: tracked.result?.isError ? `${tracked.toolUse.name} failed` : `${tracked.toolUse.name} yielded`,
        summary: `${tracked.toolUse.name} result ready`,
      });
    }
  }
}
