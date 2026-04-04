import { createTranscriptMessage, normalizeToolResultContent, toolResultBlock, type TranscriptMessage, type TranscriptToolUseBlock } from "../../lib/transcript.js";
import type { ChatMode } from "../../agent/types.js";
import type { ToolExecutionResult, ToolExecutionStatus } from "../types.js";
import { fitToolResultsToBudget, persistLargeToolResult } from "./tool-result-storage.js";

const CONCURRENCY_SAFE_TOOLS = new Set([
  "read_file",
  "grep",
  "search_files",
  "list_directory",
  "stat_path",
  "web_search",
  "fetch_url",
  "run_command_readonly",
  "list_attachments",
  "read_attachment",
]);

function isConcurrencySafeTool(toolName: string): boolean {
  return CONCURRENCY_SAFE_TOOLS.has(toolName);
}

export interface ToolExecutionUpdate {
  toolUseId: string;
  toolName: string;
  status: ToolExecutionStatus;
  result?: TranscriptMessage;
}

function toToolResultMessage(toolUse: TranscriptToolUseBlock, content: string, isError = false): TranscriptMessage {
  return createTranscriptMessage({
    role: "tool",
    content: [toolResultBlock(toolUse.id, normalizeToolResultContent(toolUse.name, content), isError)],
  });
}

type SettledToolExecution = {
  toolUse: TranscriptToolUseBlock;
  content: string;
  isError: boolean;
};

export class ToolExecutor {
  private discarded = false;

  constructor(
    private readonly executeTool: (toolName: string, args: Record<string, unknown>, mode: ChatMode) => Promise<ToolExecutionResult>,
    private readonly mode: ChatMode,
    private readonly onUpdate?: (update: ToolExecutionUpdate) => void,
  ) {}

  discardPending(reason = "Tool execution was discarded before completion."): void {
    this.discarded = true;
    this.onUpdate?.({ toolUseId: "", toolName: "", status: "discarded" });
    void reason;
  }

  async execute(toolUses: TranscriptToolUseBlock[]): Promise<TranscriptMessage[]> {
    const results: TranscriptMessage[] = [];

    for (const batch of partitionToolUses(toolUses)) {
      const settled = batch.concurrent
        ? await Promise.all(batch.toolUses.map((toolUse) => this.runTool(toolUse)))
        : await this.runSerial(batch.toolUses);

      const persisted = await Promise.all(
        settled.map(async (entry) => ({
          toolUse: entry.toolUse,
          isError: entry.isError,
          content: await persistLargeToolResult(entry.toolUse.id, entry.toolUse.name, entry.content),
        })),
      );

      const budgetedContents = fitToolResultsToBudget(
        persisted.map((entry) => ({ toolName: entry.toolUse.name, content: entry.content })),
      );

      budgetedContents.forEach((content, index) => {
        const entry = persisted[index]!;
        const result = toToolResultMessage(entry.toolUse, content, entry.isError);
        this.onUpdate?.({
          toolUseId: entry.toolUse.id,
          toolName: entry.toolUse.name,
          status: entry.isError ? "error" : "yielded",
          result,
        });
        this.onUpdate?.({
          toolUseId: entry.toolUse.id,
          toolName: entry.toolUse.name,
          status: entry.isError ? "error" : "completed",
          result,
        });
        results.push(result);
      });
    }

    return results;
  }

  private async runSerial(toolUses: TranscriptToolUseBlock[]): Promise<SettledToolExecution[]> {
    const settled: SettledToolExecution[] = [];
    for (const toolUse of toolUses) {
      settled.push(await this.runTool(toolUse));
    }
    return settled;
  }

  private async runTool(toolUse: TranscriptToolUseBlock): Promise<SettledToolExecution> {
    this.onUpdate?.({ toolUseId: toolUse.id, toolName: toolUse.name, status: "queued" });

    if (this.discarded) {
      const message = "Tool execution was discarded before start.";
      this.onUpdate?.({
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        status: "discarded",
        result: toToolResultMessage(toolUse, message, true),
      });
      return { toolUse, content: message, isError: true };
    }

    this.onUpdate?.({ toolUseId: toolUse.id, toolName: toolUse.name, status: "executing" });

    try {
      const execution = await this.executeTool(toolUse.name, toolUse.input, this.mode);
      if (this.discarded) {
        const message = "Tool execution was discarded after completion.";
        this.onUpdate?.({
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          status: "discarded",
          result: toToolResultMessage(toolUse, message, true),
        });
        return { toolUse, content: message, isError: true };
      }

      return {
        toolUse,
        content: execution.contextContent ?? execution.content,
        isError: execution.isError === true,
      };
    } catch (error) {
      return {
        toolUse,
        content: (error as Error).message,
        isError: true,
      };
    }
  }
}

function partitionToolUses(toolUses: TranscriptToolUseBlock[]): Array<{ concurrent: boolean; toolUses: TranscriptToolUseBlock[] }> {
  const partitions: Array<{ concurrent: boolean; toolUses: TranscriptToolUseBlock[] }> = [];
  for (const toolUse of toolUses) {
    const concurrent = isConcurrencySafeTool(toolUse.name);
    const last = partitions.at(-1);
    if (concurrent && last?.concurrent) {
      last.toolUses.push(toolUse);
      continue;
    }
    partitions.push({ concurrent, toolUses: [toolUse] });
  }
  return partitions;
}

