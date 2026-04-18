import type { TranscriptMessage } from "../../lib/transcript.js";
import { createTranscriptMessage, getMessageText, getToolUses, hasVisibleAssistantContent, repairTranscript, textBlock } from "../../lib/transcript.js";
import type { LoopOptions, LoopResult } from "../types.js";
import type { AgentLoopState } from "../../agent/types.js";
import { callProviderStream } from "../../provider/service.js";
import { buildPrompt, getSystemVariables } from "../../systemprompt/index.js";
import { getTaskSummary } from "../../tools/service.js";
import { StreamingToolExecutor } from "./tool-executor.js";
import { getDefaults } from "../../lib/defaults.js";
import { classifyProviderError, computeBackoffMs } from "../../provider/lib/errors.js";
import { snipOldestToolCycles, estimateTranscriptChars, OUTPUT_CONTINUE_INSTRUCTION, PTL_SNIP_NOTICE } from "./recovery.js";
import { createTokenBudget, recordTurn, shouldContinue } from "./token-budget.js";

const TASK_COMPLETE_SENTINEL = "TASK_COMPLETE";
const AUTONOMOUS_CONTINUE_INSTRUCTION = `Continue working on the task autonomously. If you believe the task is fully complete, respond with exactly "${TASK_COMPLETE_SENTINEL}" on its own line and nothing else.`;

const EMPTY_RESPONSE_RETRY_BUDGET = 1;
const TRANSIENT_RETRY_BUDGET = 3;
const PTL_RETRY_BUDGET = 3;
const MAX_OUTPUT_RECOVERY_RETRIES = 3;
const PTL_SNIP_TARGET_RATIO = 0.6;

class AbortedError extends Error {
  constructor() {
    super("Loop aborted by signal");
    this.name = "AbortedError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortedError();
}

function buildLoopState(opts: LoopOptions): AgentLoopState {
  const now = new Date().toISOString();
  return {
    sessionId: opts.sessionId,
    agentId: opts.agentId,
    status: "running",
    mode: opts.activeMode,
    iteration: 0,
    startedAt: now,
    updatedAt: now,
  };
}

function emitLoopState(
  loopState: AgentLoopState,
  opts: Pick<LoopOptions, "onLoopState">,
  patch: Partial<AgentLoopState>,
): void {
  Object.assign(loopState, patch, { updatedAt: new Date().toISOString() });
  opts.onLoopState?.(loopState);
}

function buildModelMessages(
  systemPrompt: string,
  messages: TranscriptMessage[],
  retryInstruction?: string,
  metaMessages: TranscriptMessage[] = [],
): TranscriptMessage[] {
  return [
    createTranscriptMessage({ role: "system", content: [textBlock(systemPrompt)] }),
    ...(retryInstruction ? [createTranscriptMessage({ role: "system", content: [textBlock(retryInstruction)] })] : []),
    ...metaMessages,
    ...repairTranscript(messages),
  ];
}

async function runModelPass(
  opts: LoopOptions,
  messages: TranscriptMessage[],
  providerState: LoopOptions["providerState"],
  onToolUseBlock?: (toolUse: import("../../lib/transcript.js").TranscriptToolUseBlock) => void,
  retryInstruction?: string,
  metaMessages: TranscriptMessage[] = [],
) {
  const modeConfig = opts.modeConfigs[opts.activeMode];
  if (!modeConfig) {
    throw new Error(`Missing mode config for mode "${opts.activeMode}"`);
  }

  const variables: Record<string, string> = {
    ...getSystemVariables({ CURRENT_MODEL: opts.model }),
    ...(modeConfig.runtimeVariables ?? {}),
    mode: opts.activeMode,
    TASK_SUMMARY: getTaskSummary(opts.sessionId),
    ...opts.agentVariables,
  };

  const systemPrompt = buildPrompt(
    modeConfig.promptSections,
    modeConfig.modeInstruction,
    modeConfig.mcpInstructions,
    modeConfig.skillsCatalog,
    variables,
    {
      sessionId: opts.sessionId,
      mode: opts.activeMode,
    },
  );

  let receivedProviderStats = false;
  const response = await callProviderStream(
    {
      providerId: opts.providerId,
      model: opts.model,
      messages: buildModelMessages(systemPrompt, messages, retryInstruction, metaMessages),
      tools: modeConfig.allTools.length > 0 ? modeConfig.allTools : undefined,
      reasoningEffort: opts.reasoningEffort,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      transportState: providerState,
    },
    (chunk) => {
      if (chunk.type === "assistant_block_delta") {
        if (chunk.block.type === "tool_use") {
          onToolUseBlock?.(chunk.block);
        }
        opts.onAssistantBlockDelta?.(chunk.messageId, chunk.block);
        return;
      }
      if (chunk.type === "assistant_message") {
        opts.onAssistantMessage?.(chunk.message);
        return;
      }
      if (chunk.type === "stats") {
        receivedProviderStats = true;
        opts.onStats?.(chunk.stats);
      }
    },
  );

  if (!receivedProviderStats) {
    opts.onStats?.({
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      source: "unknown",
    });
  }

  return response;
}

export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const messages: TranscriptMessage[] = [...opts.messages];
  const loopState = buildLoopState(opts);
  opts.onLoopState?.(loopState);

  let iteration = 0;
  let finalResponse = "";
  let retryInstruction: string | undefined;
  let emptyResponseRetryCount = 0;
  let invalidToolRetryCount = 0;
  let ptlRetries = 0;
  let maxOutputRetries = 0;
  const tokenBudget = createTokenBudget({
    maxInputTokens: opts.autonomousBudget?.maxInputTokens,
    maxOutputTokens: opts.autonomousBudget?.maxOutputTokens,
  });
  const autonomousStart = Date.now();
  const maxWallClockMs = opts.autonomousBudget?.maxWallClockMs ?? 30 * 60 * 1000;
  const maxConsecutiveAutoContinues = opts.autonomousBudget?.maxConsecutiveAutoContinues ?? 20;
  let consecutiveAutoContinues = 0;
  let providerState = opts.providerState;
  let providerDebug: LoopResult["providerDebug"] = undefined;
  let runtimeContext = {
    values: { ...(opts.toolContext?.values ?? {}) },
  };
  const defaults = getDefaults();

  let lastTurnStats: import("../../provider/lib/types.js").TokenStats | undefined;
  const loopOpts: LoopOptions = {
    ...opts,
    onStats: (stats) => {
      lastTurnStats = stats;
      opts.onStats?.(stats);
    },
  };

  let aborted = false;
  try {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    throwIfAborted(opts.abortSignal);
    iteration++;
    emitLoopState(loopState, opts, { iteration, status: "running", mode: opts.activeMode });

    const modeConfig = opts.modeConfigs[opts.activeMode];
    if (!modeConfig) {
      throw new Error(`Missing mode config for mode "${opts.activeMode}"`);
    }

    const executor = new StreamingToolExecutor(
      opts.executeTool,
      opts.activeMode,
      modeConfig.runtimeToolsByName,
      async (runtimeTool, toolName, args, mode) => {
        return (await opts.resolveToolPermission?.(runtimeTool, toolName, args, mode)) ?? { allowed: true };
      },
      (update) => {
        opts.onToolExecutionUpdate?.(
          update.toolUseId,
          update.toolName,
          update.status,
          update.result,
          update.detail,
          update.summary,
        );
      },
      runtimeContext,
    );

    const streamedToolUseIds = new Set<string>();
    const metaMessages = opts.buildEphemeralMetaMessages?.({
      sessionId: opts.sessionId,
      agentId: opts.agentId,
      mode: opts.activeMode,
      model: opts.model,
      iteration,
    }) ?? [];
    let response;
    let transientRetries = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        throwIfAborted(opts.abortSignal);
        response = await (opts.modelPassRunner ?? runModelPass)(
          loopOpts,
          messages,
          providerState,
          (toolUse) => {
            if (streamedToolUseIds.has(toolUse.id)) return;
            streamedToolUseIds.add(toolUse.id);
            executor.addTool(toolUse);
          },
          retryInstruction,
          metaMessages,
        );
        break;
      } catch (error) {
        if (error instanceof AbortedError) {
          executor.discardPending("Tool execution aborted by user.");
          await executor.getFinalResults().catch(() => []);
          throw error;
        }
        const classified = classifyProviderError(error);
        if (classified.kind === "prompt_too_long") {
          if (ptlRetries >= PTL_RETRY_BUDGET) {
            executor.discardPending("Provider stream failed after repeated prompt_too_long.");
            await executor.getFinalResults().catch(() => []);
            throw error;
          }
          ptlRetries++;
          const before = estimateTranscriptChars(messages);
          const target = Math.max(2000, Math.floor(before * PTL_SNIP_TARGET_RATIO));
          const snipped = snipOldestToolCycles(messages, target);
          messages.length = 0;
          messages.push(...snipped.messages);
          opts.onSystemNotice?.(
            "warning",
            `Context overflow — trimmed ${snipped.removed} older messages and retrying.`,
          );
          retryInstruction = PTL_SNIP_NOTICE;
          // Reset streamed tool tracking since no tools fired this attempt.
          streamedToolUseIds.clear();
          continue;
        }
        if (classified.kind === "rate_limit" || classified.kind === "transient") {
          if (transientRetries >= TRANSIENT_RETRY_BUDGET) {
            executor.discardPending("Tool execution was discarded because the provider stream failed.");
            await executor.getFinalResults().catch(() => []);
            throw error;
          }
          transientRetries++;
          const delayMs = computeBackoffMs(transientRetries);
          opts.onSystemNotice?.(
            "warning",
            `Provider ${classified.kind} error — retrying in ${Math.round(delayMs / 100) / 10}s (${transientRetries}/${TRANSIENT_RETRY_BUDGET}).`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          streamedToolUseIds.clear();
          continue;
        }
        executor.discardPending("Tool execution was discarded because the provider stream failed.");
        await executor.getFinalResults().catch(() => []);
        throw error;
      }
    }
    retryInstruction = undefined;
    for (const notice of response.notices ?? []) {
      opts.onSystemNotice?.(notice.level, notice.message);
    }

    const assistantMessage = response.message;
    const assistantText = getMessageText(assistantMessage).trim();
    const toolUses = getToolUses(assistantMessage);
    const hasToolParseErrors = (response.parseIssues ?? []).some((issue) => issue.severity === "error");

    if (toolUses.length === 0 && !hasVisibleAssistantContent(assistantMessage)) {
      if (hasToolParseErrors && invalidToolRetryCount < EMPTY_RESPONSE_RETRY_BUDGET) {
        invalidToolRetryCount++;
        opts.onSystemNotice?.("warning", "Model produced invalid tool calls. Retrying.");
        retryInstruction = [
          defaults.retry.invalidToolInstruction,
          "If you call a tool, use only registered tool names and valid JSON object arguments.",
        ].join(" ");
        iteration--;
        continue;
      }

      emptyResponseRetryCount++;
      if (emptyResponseRetryCount <= EMPTY_RESPONSE_RETRY_BUDGET) {
        opts.onSystemNotice?.("warning", "Model returned an empty response. Retrying.");
        retryInstruction = defaults.retry.emptyResponseInstruction;
        iteration--;
        continue;
      }
      emitLoopState(loopState, opts, { status: "error" });
      throw new Error("Model returned an empty response twice in a row.");
    }

    emptyResponseRetryCount = 0;
    invalidToolRetryCount = 0;
    ptlRetries = 0;
    messages.push(assistantMessage);
    finalResponse = assistantText || finalResponse;
    providerState = response.transportState ?? providerState;
    providerDebug = response.debug ?? providerDebug;

    if (response.finishReason === "length" && toolUses.length === 0) {
      if (maxOutputRetries < MAX_OUTPUT_RECOVERY_RETRIES) {
        maxOutputRetries++;
        opts.onSystemNotice?.(
          "warning",
          `Response hit output limit — continuing (${maxOutputRetries}/${MAX_OUTPUT_RECOVERY_RETRIES}).`,
        );
        retryInstruction = OUTPUT_CONTINUE_INSTRUCTION;
        continue;
      }
      opts.onSystemNotice?.(
        "warning",
        "Response hit output limit after max retries — stopping.",
      );
    } else {
      maxOutputRetries = 0;
    }

    if (lastTurnStats) recordTurn(tokenBudget, lastTurnStats);

    if (toolUses.length === 0) {
      if (!opts.autonomous) break;
      // Explicit task-complete sentinel: always honored.
      if (assistantText.includes(TASK_COMPLETE_SENTINEL)) break;
      // Anti-runaway caps.
      if (Date.now() - autonomousStart >= maxWallClockMs) {
        opts.onSystemNotice?.("info", "Autonomous mode stopped: wall-clock budget reached.");
        break;
      }
      if (consecutiveAutoContinues >= maxConsecutiveAutoContinues) {
        opts.onSystemNotice?.("info", "Autonomous mode stopped: consecutive auto-continue limit reached.");
        break;
      }
      const verdict = shouldContinue(tokenBudget);
      if (!verdict.continue) {
        opts.onSystemNotice?.("info", `Autonomous mode stopped: ${verdict.reason}.`);
        break;
      }
      consecutiveAutoContinues++;
      opts.onSystemNotice?.(
        "info",
        `Auto-continue (${consecutiveAutoContinues}/${maxConsecutiveAutoContinues}) — budget ok.`,
      );
      retryInstruction = AUTONOMOUS_CONTINUE_INSTRUCTION;
      continue;
    }
    consecutiveAutoContinues = 0;

    for (const toolUse of toolUses) {
      if (!streamedToolUseIds.has(toolUse.id)) {
        executor.addTool(toolUse);
      }
    }
    if (opts.abortSignal?.aborted) {
      executor.discardPending("Tool execution aborted by user.");
    }
    const toolResults = await executor.getFinalResults();
    const assistantBlocks = executor.getAssistantBlocks();
    if (assistantBlocks.length > 0) {
      assistantMessage.content = [...assistantMessage.content, ...assistantBlocks];
      for (const block of assistantBlocks) {
        opts.onAssistantBlockDelta?.(assistantMessage.id, block);
      }
    }
    runtimeContext = executor.getRuntimeContext();
    messages.push(...toolResults);
    throwIfAborted(opts.abortSignal);
  }
  } catch (error) {
    if (error instanceof AbortedError) {
      aborted = true;
    } else {
      throw error;
    }
  }

  const repaired = repairTranscript(messages);
  const finalStatus: AgentLoopState["status"] = aborted
    ? "aborted"
    : loopState.status === "error"
      ? "error"
      : "completed";
  emitLoopState(loopState, opts, {
    status: finalStatus,
    iteration,
    mode: opts.activeMode,
  });

  return {
    messages: repaired,
    finalResponse,
    iterations: iteration,
    providerState,
    providerDebug,
    aborted,
  };
}
