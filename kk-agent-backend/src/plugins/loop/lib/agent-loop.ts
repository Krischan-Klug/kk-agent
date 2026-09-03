import { randomUUID } from "node:crypto";
import type {
  AgentLoopState,
  SessionContextState,
} from "kk-agent-contract";
import type { TranscriptMessage } from "kk-agent-contract";
import {
  getMessageText,
  getToolResults,
  getToolUses,
  hasVisibleAssistantContent,
  repairTranscript,
} from "kk-agent-contract";
import type { LoopCheckpoint, LoopOptions, LoopResult, ToolRuntimeContext } from "../types.js";
import { StreamingToolExecutor } from "./tool-executor.js";
import { getDefaults } from "../../lib/defaults.js";
import { classifyProviderError, computeBackoffMs } from "../../provider/lib/errors.js";
import { getErrorMessage } from "../../../lib/error.js";
import {
  buildValidatedCompactionProjection,
  estimateMessagesTokens,
  getCompactionReserveTokens,
  isValidCompactionSummary,
  measureContextUsage,
  projectContextMessages,
  shouldCompactContext,
  validateCompactionSummary,
} from "./context-compaction.js";
import { OUTPUT_CONTINUE_INSTRUCTION } from "./recovery.js";
import { buildModelPassInput, compactModelContext, runModelPass } from "./model-pass.js";
import {
  AbortedError,
  RunFailure,
  buildLoopState,
  cloneToolContext,
  emitRunEvent,
  providerRunFailure,
  throwIfAborted,
  updateLoopState,
  waitForRetry,
  type TerminalOutcome,
} from "./run-state.js";
const EMPTY_RESPONSE_RETRY_BUDGET = 1;
const TRANSIENT_RETRY_BUDGET = 3;
const PROMPT_TOO_LONG_COMPACTION_BUDGET = 3;
const MAX_OUTPUT_RECOVERY_RETRIES = 3;
const MAX_COMMITTED_STEPS_PER_RUN = 200;
const MAX_TOOL_BATCHES_PER_RUN = 100;
const IDENTICAL_TOOL_ERROR_LIMIT = 3;

function hasEnoughNewContextToCompact(
  contextMessages: TranscriptMessage[],
  contextState: SessionContextState,
  reserveTokens: number,
): boolean {
  if (!contextState.activeCompaction) return contextMessages.length > 0;
  return estimateMessagesTokens(contextMessages.slice(1)) >= Math.max(1_000, Math.floor(reserveTokens / 2));
}

function createCheckpoint(input: {
  messages: TranscriptMessage[];
  status: LoopCheckpoint["status"];
  state: AgentLoopState;
  toolContext: ToolRuntimeContext;
  providerState: LoopOptions["providerState"];
  providerDebug: LoopCheckpoint["providerDebug"];
  contextState: SessionContextState;
}): LoopCheckpoint {
  return {
    messages: repairTranscript(input.messages),
    status: input.status,
    step: input.state.step,
    attempt: input.state.attempt,
    toolBatch: input.state.toolBatch,
    toolContext: cloneToolContext(input.toolContext),
    providerState: input.providerState,
    providerDebug: input.providerDebug,
    contextState: structuredClone(input.contextState),
  };
}

export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const messages = repairTranscript([...opts.messages]);
  const storedCompaction = opts.contextState.activeCompaction;
  const invalidStoredCompaction = storedCompaction && !isValidCompactionSummary(storedCompaction.summary)
    ? storedCompaction
    : undefined;
  let contextState = structuredClone(opts.contextState);
  if (invalidStoredCompaction) {
    contextState = {
      ...contextState,
      activeCompaction: undefined,
      consecutiveCompactionFailures: 0,
    };
  }
  let contextMessages = projectContextMessages(messages, contextState);
  const state = buildLoopState(opts);
  opts.onLoopState?.({ ...state });

  let finalResponse = "";
  let retryInstruction: string | undefined;
  let emptyResponseRetries = 0;
  let invalidToolRetries = 0;
  let promptTooLongRetries = 0;
  let forceContextCompaction = false;
  let maxOutputRetries = 0;
  let transientRetries = 0;
  let providerState = opts.providerState;
  let providerDebug: LoopCheckpoint["providerDebug"];
  let contextLimitChecks = 0;
  let toolContext = cloneToolContext({
    ...(opts.toolContext ?? { values: {} }),
    abortSignal: opts.abortSignal,
  });
  let lastToolErrorSignature = "";
  let identicalToolErrorRepeats = 0;
  let terminalOutcome: TerminalOutcome | undefined;
  const defaults = getDefaults();

  let status: Exclude<LoopCheckpoint["status"], "running"> = "completed";

  try {
    if (invalidStoredCompaction) {
      await emitRunEvent(opts, messages, state, {
        kind: "provider_notice",
        severity: "warning",
        visibility: "debug",
        errorCategory: "internal",
        code: "invalid_context_compaction_ignored",
        message: "An invalid stored context summary was ignored. The full transcript will be compacted again before use.",
        detail: validateCompactionSummary({ summary: invalidStoredCompaction.summary }).join("\n"),
      });
    }

    // Each cycle asks for one committed assistant step. Retries only advance attempt.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      throwIfAborted(opts.abortSignal);
      const safetyStopReason = state.step >= MAX_COMMITTED_STEPS_PER_RUN
        ? "committed step limit reached"
        : state.toolBatch >= MAX_TOOL_BATCHES_PER_RUN
          ? "tool batch limit reached"
          : undefined;
      if (safetyStopReason) {
        terminalOutcome = {
          status: "stopped",
          kind: "run_limit",
          severity: "warning",
          errorCategory: "limit",
          code: "run_safety_limit_reached",
          message: `Run stopped because its ${safetyStopReason}.`,
        };
        status = "stopped";
        break;
      }
      const modeConfig = opts.modeConfigs[opts.activeModeId];
      if (!modeConfig) throw new Error(`Missing mode config for mode "${opts.activeModeId}"`);

      state.attempt += 1;
      updateLoopState(state, opts, { status: "running" });
      const runtimeContext = opts.buildRuntimeContext?.({
        sessionId: opts.sessionId,
        agentId: opts.agentId,
        modeId: modeConfig.modeId,
        modeName: modeConfig.modePromptName,
        model: opts.model,
        step: state.step,
        toolContext,
      }) ?? "";
      const modelPassInput = buildModelPassInput(opts, runtimeContext, retryInstruction);
      let effectiveContextLimit = contextState.usage?.limitTokens;
      if (contextLimitChecks === 0) {
        contextLimitChecks += 1;
        try {
          effectiveContextLimit = await opts.resolveContextLimit() ?? effectiveContextLimit;
        } catch {
          // A temporary model-discovery failure must not stop an otherwise usable run.
        }
      }

      if (effectiveContextLimit) {
        const usage = measureContextUsage({
          messages: contextMessages,
          limitTokens: effectiveContextLimit,
          estimatedFixedTokens: modelPassInput.estimatedFixedTokens,
        });
        contextState = { ...contextState, usage };
        opts.onContextUsage?.(usage);
        const reserveTokens = getCompactionReserveTokens(effectiveContextLimit);
        const compactable = forceContextCompaction
          || hasEnoughNewContextToCompact(contextMessages, contextState, reserveTokens);
        if (
          compactable
          && (forceContextCompaction || shouldCompactContext(usage.usedTokens, effectiveContextLimit))
        ) {
          try {
            const compaction = await compactModelContext(
              opts,
              contextMessages,
              effectiveContextLimit,
              state.step,
              state.attempt,
            );
            const { summary } = compaction;
            const boundary = messages.at(-1);
            if (!boundary) throw new Error("Cannot compact an empty transcript.");
            const createdAt = new Date().toISOString();
            let projection;
            try {
              projection = buildValidatedCompactionProjection({
                messages,
                summary,
                boundaryMessageId: boundary.id,
                beforeTokens: usage.usedTokens,
                limitTokens: effectiveContextLimit,
                estimatedFixedTokens: modelPassInput.estimatedFixedTokens,
                compactionId: randomUUID(),
                createdAt,
              });
            } catch (error) {
              if (compaction.debugInputId) {
                await opts.onModelInputOutcome?.(compaction.debugInputId, {
                  ...compaction.outcome,
                  status: "rejected",
                  validationErrors: [
                    ...(compaction.outcome.validationErrors ?? []),
                    getErrorMessage(error),
                  ],
                  contextBeforeTokens: usage.usedTokens,
                });
              }
              throw error;
            }
            contextState = projection.contextState;
            contextMessages = projection.contextMessages;
            forceContextCompaction = false;
            const compactedUsage = projection.contextState.usage!;
            opts.onContextUsage?.(compactedUsage);
            if (compaction.debugInputId) {
              await opts.onModelInputOutcome?.(compaction.debugInputId, {
                ...compaction.outcome,
                status: "accepted",
                contextBeforeTokens: usage.usedTokens,
                contextAfterTokens: compactedUsage.usedTokens,
              });
            }
            providerState = undefined;
            await emitRunEvent(opts, messages, state, {
              kind: "context_compacted",
              severity: "warning",
              visibility: "user",
              errorCategory: "limit",
              code: "automatic_context_compaction",
              message: `Context compacted from about ${usage.usedTokens.toLocaleString()} to ${compactedUsage.usedTokens.toLocaleString()} tokens.`,
            });
            await opts.onCheckpoint?.(createCheckpoint({
              messages,
              status: "running",
              state,
              toolContext,
              providerState,
              providerDebug,
              contextState,
            }));
          } catch (error) {
            throwIfAborted(opts.abortSignal);
            contextState = {
              ...contextState,
              consecutiveCompactionFailures: contextState.consecutiveCompactionFailures + 1,
            };
            terminalOutcome = classifyProviderError(error).kind === "model_unloaded"
              ? {
                  status: "failed",
                  kind: "run_failed",
                  severity: "error",
                  errorCategory: "configuration",
                  code: "provider_model_unloaded",
                  message: "The selected model was unloaded during context compaction. Load it in the provider and start the run again.",
                  detail: getErrorMessage(error),
                }
              : {
                  status: "failed",
                  kind: "run_failed",
                  severity: "error",
                  errorCategory: "limit",
                  code: "context_compaction_failed",
                  message: "The run stopped because no verified continuation state could be produced. The full transcript and completed work were preserved.",
                  detail: getErrorMessage(error),
                };
            status = "failed";
            break;
          }
        }
      }

      let response;
      try {
        response = await runModelPass(
          opts,
          contextMessages,
          providerState,
          retryInstruction,
          runtimeContext,
          state.step,
          state.attempt,
          retryInstruction || transientRetries > 0 || promptTooLongRetries > 0 ? "recovery" : "agent",
        );
      } catch (error) {
        if (error instanceof AbortedError || opts.abortSignal?.aborted) throw new AbortedError();
        const classified = classifyProviderError(error);
        if (
          classified.kind === "prompt_too_long"
          && promptTooLongRetries < PROMPT_TOO_LONG_COMPACTION_BUDGET
          && effectiveContextLimit
        ) {
          promptTooLongRetries += 1;
          forceContextCompaction = true;
          providerState = undefined;
          retryInstruction = undefined;
          await emitRunEvent(opts, messages, state, {
            kind: "model_retry",
            severity: "warning",
            visibility: "user",
            errorCategory: "limit",
            code: "prompt_too_long",
            message: "The provider rejected the context window. Creating a validated continuation state before retrying.",
          });
          continue;
        }
        if (
          (classified.kind === "rate_limit" || classified.kind === "transient")
          && transientRetries < TRANSIENT_RETRY_BUDGET
        ) {
          transientRetries += 1;
          const delayMs = computeBackoffMs(transientRetries);
          await emitRunEvent(opts, messages, state, {
            kind: "provider_retry",
            severity: "warning",
            errorCategory: "provider_transient",
            code: classified.kind,
            message: `Provider ${classified.kind} error. Retrying in ${Math.round(delayMs / 100) / 10}s (${transientRetries}/${TRANSIENT_RETRY_BUDGET}).`,
            detail: getErrorMessage(error),
          });
          await waitForRetry(delayMs, opts.abortSignal);
          continue;
        }
        throw providerRunFailure(error);
      }

      retryInstruction = undefined;
      transientRetries = 0;
      for (const notice of response.notices ?? []) {
        await emitRunEvent(opts, messages, state, {
          kind: "provider_notice",
          severity: notice.level,
          code: notice.code,
          message: notice.message,
        });
      }
      const assistantMessage = response.message;
      const assistantText = getMessageText(assistantMessage).trim();
      const toolUses = getToolUses(assistantMessage);
      const hasToolParseErrors = (response.parseIssues ?? []).some((issue) => issue.severity === "error");

      if (toolUses.length === 0 && !hasVisibleAssistantContent(assistantMessage)) {
        opts.onAssistantAttemptDiscarded?.([assistantMessage.id]);
        if (hasToolParseErrors && invalidToolRetries < EMPTY_RESPONSE_RETRY_BUDGET) {
          invalidToolRetries += 1;
          retryInstruction = defaults.retry.invalidToolInstruction;
          await emitRunEvent(opts, messages, state, {
            kind: "model_retry",
            severity: "warning",
            errorCategory: "internal",
            code: "invalid_tool_call",
            message: "Model produced an invalid tool call. Retrying the same step.",
          });
          continue;
        }
        if (emptyResponseRetries < EMPTY_RESPONSE_RETRY_BUDGET) {
          emptyResponseRetries += 1;
          retryInstruction = defaults.retry.emptyResponseInstruction;
          await emitRunEvent(opts, messages, state, {
            kind: "model_retry",
            severity: "warning",
            errorCategory: "internal",
            code: "empty_response",
            message: "Model returned an empty response. Retrying the same step.",
          });
          continue;
        }
        throw new Error("Model returned an empty response after retry.");
      }

      emptyResponseRetries = 0;
      invalidToolRetries = 0;
      promptTooLongRetries = 0;
      forceContextCompaction = false;
      state.step += 1;
      messages.push(assistantMessage);
      contextMessages.push(assistantMessage);
      finalResponse = assistantText || finalResponse;
      providerState = response.transportState ?? providerState;
      providerDebug = response.debug ?? providerDebug;
      if (!effectiveContextLimit && contextLimitChecks < 2) {
        contextLimitChecks += 1;
        try {
          effectiveContextLimit = await opts.resolveContextLimit() ?? effectiveContextLimit;
        } catch {
          // Provider usage still remains valid when runtime model discovery is temporarily unavailable.
        }
      }
      if (effectiveContextLimit) {
        const usage = measureContextUsage({
          messages: contextMessages,
          limitTokens: effectiveContextLimit,
          estimatedFixedTokens: modelPassInput.estimatedFixedTokens,
        });
        contextState = {
          ...contextState,
          usage,
        };
        opts.onContextUsage?.(usage);
      }
      await opts.onCheckpoint?.(createCheckpoint({
        messages,
        status: "running",
        state,
        toolContext,
        providerState,
        providerDebug,
        contextState,
      }));

      if (response.finishReason === "length" && toolUses.length === 0) {
        if (maxOutputRetries < MAX_OUTPUT_RECOVERY_RETRIES) {
          maxOutputRetries += 1;
          retryInstruction = OUTPUT_CONTINUE_INSTRUCTION;
          await emitRunEvent(opts, messages, state, {
            kind: "output_limit",
            severity: "warning",
            errorCategory: "limit",
            code: "max_output_tokens",
            message: `Response reached the output limit. Continuing (${maxOutputRetries}/${MAX_OUTPUT_RECOVERY_RETRIES}).`,
            anchorMessageId: assistantMessage.id,
          });
          state.attempt = 0;
          continue;
        }
        terminalOutcome = {
          status: "failed",
          kind: "run_failed",
          severity: "error",
          errorCategory: "limit",
          code: "max_output_retries_exhausted",
          message: "Response reached the output limit repeatedly. The run was stopped.",
          anchorMessageId: assistantMessage.id,
        };
        status = "failed";
        break;
      }
      maxOutputRetries = 0;

      if (toolUses.length > 0) {
        const executor = new StreamingToolExecutor(
          opts.executeTool,
          { id: modeConfig.modeId, behavior: modeConfig.modeBehavior },
          modeConfig.runtimeToolsByName,
          async (runtimeTool, toolName, args, mode) =>
            (await opts.resolveToolPermission?.(runtimeTool, toolName, args, mode)) ?? { allowed: true },
          (update) => opts.onToolExecutionUpdate?.(
            update.toolUseId,
            update.toolName,
            update.status,
            update.result,
            update.detail,
            update.summary,
            update.input,
            update.metadata,
          ),
          toolContext,
        );
        for (const toolUse of toolUses) executor.addTool(toolUse);
        const discardTools = () => executor.discardPending("Tool execution aborted by user.");
        if (opts.abortSignal?.aborted) discardTools();
        else opts.abortSignal?.addEventListener("abort", discardTools, { once: true });
        let toolResults: TranscriptMessage[];
        try {
          toolResults = await executor.getFinalResults();
        } finally {
          opts.abortSignal?.removeEventListener("abort", discardTools);
        }
        toolContext = executor.getRuntimeContext();
        messages.push(...toolResults);
        contextMessages.push(...toolResults);
        state.toolBatch += 1;

        if (opts.abortSignal?.aborted) {
          await opts.onCheckpoint?.(createCheckpoint({
            messages,
            status: "running",
            state,
            toolContext,
            providerState,
            providerDebug,
            contextState,
          }));
          throwIfAborted(opts.abortSignal);
        }

        const batchResults = toolResults.flatMap((resultMessage) => getToolResults(resultMessage));
        const batchErrors = batchResults.filter((entry) => entry.is_error);
        for (const result of batchErrors) {
          const toolUse = toolUses.find((entry) => entry.id === result.tool_use_id);
          await emitRunEvent(opts, messages, state, {
            kind: "tool_error",
            severity: "error",
            errorCategory: "tool",
            code: "tool_execution_failed",
            message: `${toolUse?.name ?? "Tool"} failed.`,
            detail: result.content,
            anchorMessageId: assistantMessage.id,
          });
        }

        if (batchErrors.length > 0 && batchErrors.length === batchResults.length) {
          const signature = batchErrors
            .map((result) => `${toolUses.find((entry) => entry.id === result.tool_use_id)?.name ?? "Tool"}:${result.content}`)
            .sort()
            .join("\n---\n");
          if (signature === lastToolErrorSignature) identicalToolErrorRepeats += 1;
          else {
            lastToolErrorSignature = signature;
            identicalToolErrorRepeats = 1;
          }
        } else {
          lastToolErrorSignature = "";
          identicalToolErrorRepeats = 0;
        }

        await opts.onCheckpoint?.(createCheckpoint({
          messages,
          status: "running",
          state,
          toolContext,
          providerState,
          providerDebug,
          contextState,
        }));
        if (identicalToolErrorRepeats >= IDENTICAL_TOOL_ERROR_LIMIT) {
          terminalOutcome = {
            status: "stopped",
            kind: "run_limit",
            severity: "warning",
            errorCategory: "limit",
            code: "repeated_tool_error_limit",
            message: "The run stopped after the same tool error repeated without progress.",
            detail: batchErrors.map((result) => result.content).join("\n\n").slice(0, 4000),
            anchorMessageId: assistantMessage.id,
          };
          status = "stopped";
          break;
        }
        throwIfAborted(opts.abortSignal);
        state.attempt = 0;
        continue;
      }

      break;
    }
  } catch (error) {
    if (error instanceof AbortedError || opts.abortSignal?.aborted) {
      status = "aborted";
      terminalOutcome = {
        status: "aborted",
        kind: "run_aborted",
        severity: "info",
        errorCategory: "abort",
        code: "user_aborted",
        message: "Run aborted by the user.",
      };
    } else if (error instanceof RunFailure) {
      status = error.outcome.status;
      terminalOutcome = error.outcome;
    } else {
      status = "failed";
      const detail = getErrorMessage(error);
      terminalOutcome = {
        status: "failed",
        kind: "run_failed",
        severity: "error",
        errorCategory: "internal",
        code: "unhandled_run_error",
        message: "The agent run failed. The completed partial work was preserved.",
        detail,
      };
    }
  }

  if (terminalOutcome) {
    status = terminalOutcome.status;
    await emitRunEvent(opts, messages, state, {
      kind: terminalOutcome.kind,
      severity: terminalOutcome.severity,
      visibility: "user",
      terminal: true,
      errorCategory: terminalOutcome.errorCategory,
      code: terminalOutcome.code,
      message: terminalOutcome.message,
      detail: terminalOutcome.detail,
      anchorMessageId: terminalOutcome.anchorMessageId,
    }).catch(() => undefined);
  }

  const repaired = repairTranscript(messages);
  updateLoopState(state, opts, { status });
  await opts.onCheckpoint?.(createCheckpoint({
    messages: repaired,
    status,
    state,
    toolContext,
    providerState,
    providerDebug,
    contextState,
  }));

  return {
    finalResponse,
  };
}
