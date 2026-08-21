import {
  createTranscriptMessage,
  normalizeToolResultContent,
  toolResultBlock,
  type TranscriptMessage,
  type TranscriptToolUseBlock,
} from "kk-agent-contract";
import type { ToolExecutionStatus } from "kk-agent-contract";
import type {
  ModeRuntimeRef,
  RuntimeToolDefinition,
  ToolExecutionResult,
  ToolRuntimeContext,
} from "../types.js";
import { getErrorMessage } from "../../../lib/error.js";
import { fitToolResultsToBudget } from "./tool-result-budget.js";
import { withHarnessToolCallDescription } from "../../session/lib/tool-call-description.js";

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
  executionInput: Record<string, unknown>;
  displayInput: Record<string, unknown>;
  runtimeTool?: RuntimeToolDefinition;
  status: ToolExecutionStatus;
  isConcurrencySafe: boolean;
  result?: { content: string; isError: boolean };
  streamedResult?: TranscriptMessage;
  yielded: boolean;
  settled: boolean;
  promise?: Promise<void>;
  contextModifier?: (context: ToolRuntimeContext) => ToolRuntimeContext;
  metadata?: Record<string, unknown>;
};

function toToolResultMessage(
  toolUse: TranscriptToolUseBlock,
  content: string,
  isError = false,
  metadata?: Record<string, unknown>,
): TranscriptMessage {
  return createTranscriptMessage({
    role: "tool",
    content: [toolResultBlock(toolUse.id, normalizeToolResultContent(toolUse.name, content), isError, metadata)],
  });
}

function toSyntheticErrorMessage(toolUse: TranscriptToolUseBlock, message: string): TranscriptMessage {
  return toToolResultMessage(toolUse, message, true);
}

function getPersistedToolMetadata(
  toolUse: TranscriptToolUseBlock,
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return toolUse.name === "Terminal" ? metadata : undefined;
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
    const executionInput = toolUse.input;
    const tracked: TrackedTool = {
      toolUse,
      executionInput,
      displayInput: withHarnessToolCallDescription(toolUse.name, toolUse.input),
      runtimeTool,
      status: runtimeTool ? "queued" : "invalid",
      isConcurrencySafe: runtimeTool ? runtimeTool.isConcurrencySafe(executionInput) : false,
      yielded: false,
      settled: true,
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
    await this.waitForAllTools();
    this.flushReadyResults();

    const ordered = this.tools.map((tool) => ({
      tool,
      content: tool.result?.content ?? "",
      isError: tool.result?.isError === true,
      policy: tool.runtimeTool?.resultPolicy,
    }));

    const finalContents = fitToolResultsToBudget(
      ordered.map((entry) => ({
        toolName: entry.tool.toolUse.name,
        content: entry.content,
        policy: entry.policy,
      })),
    );

    const results: TranscriptMessage[] = [];
    finalContents.forEach((content, index) => {
      const entry = ordered[index]!;
      const finalMessage = toToolResultMessage(
        entry.tool.toolUse,
        content,
        entry.isError,
        getPersistedToolMetadata(entry.tool.toolUse, entry.tool.metadata),
      );
      results.push(finalMessage);
    });

    return results;
  }

  private async waitForAllTools(): Promise<void> {
    const isTerminal = (tool: TrackedTool) =>
      tool.status === "completed"
      || tool.status === "error"
      || tool.status === "invalid"
      || tool.status === "discarded";

    while (this.tools.some((tool) => !isTerminal(tool) || !tool.settled)) {
      await this.processQueue();
      const inFlight = this.tools
        .filter((tool) => !tool.settled)
        .map((tool) => tool.promise)
        .filter((promise): promise is Promise<void> => Boolean(promise));
      if (inFlight.length === 0) {
        for (const tool of this.tools.filter((entry) => !isTerminal(entry))) {
          this.finishWithSyntheticError(tool, "error", "Tool scheduler could not make progress.");
        }
        break;
      }
      await Promise.all(inFlight);
    }
  }

  getRuntimeContext(): ToolRuntimeContext {
    return this.runtimeContext;
  }

  private emitUpdate(tracked: TrackedTool, update: Omit<ToolExecutionUpdate, "toolUseId" | "toolName" | "input">): void {
    this.onUpdate?.({
      toolUseId: tracked.toolUse.id,
      toolName: tracked.toolUse.name,
      input: tracked.displayInput,
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
    tracked.settled = false;
    this.emitUpdate(tracked, {
      status: "executing",
      detail: `Executing ${tracked.toolUse.name}`,
    });

    tracked.promise = (async () => {
      try {
        if (this.discarded) {
          this.finishWithSyntheticError(tracked, "discarded", "Tool execution was discarded before start.", {
            emit: false,
            flush: false,
          });
          return;
        }

        const runtimeTool = tracked.runtimeTool!;
        const permission = await this.resolveToolPermission(runtimeTool, tracked.toolUse.name, tracked.executionInput, this.mode);
        if (!permission.allowed) {
          const message = permission.reason ?? `Tool "${tracked.toolUse.name}" was blocked by runtime permissions.`;
          this.finishWithSyntheticError(tracked, "error", message);
          return;
        }

        const execution = await this.executeTool(
          tracked.toolUse.name,
          tracked.executionInput,
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
        };
        tracked.streamedResult = toToolResultMessage(
          tracked.toolUse,
          tracked.result.content,
          tracked.result.isError,
          getPersistedToolMetadata(tracked.toolUse, execution.metadata),
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
        tracked.settled = true;
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
