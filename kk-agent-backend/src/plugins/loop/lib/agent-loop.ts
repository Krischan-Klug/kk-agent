import { randomUUID } from "node:crypto";
import type { AgentLoopState, RunEvent, RunEventKind, RunEventSeverity } from "kk-agent-contract";
import type { TranscriptMessage } from "kk-agent-contract";
import {
  getMessageText,
  getToolResults,
  getToolUses,
  hasVisibleAssistantContent,
  repairTranscript,
} from "kk-agent-contract";
import type { LoopCheckpoint, LoopOptions, LoopResult, ToolRuntimeContext } from "../types.js";
import { callProviderStream } from "../../provider/service.js";
import { buildPrompt, getSystemVariables } from "../../systemprompt/lib/builder.js";
import { StreamingToolExecutor } from "./tool-executor.js";
import { getDefaults } from "../../lib/defaults.js";
import { classifyProviderError, computeBackoffMs } from "../../provider/lib/errors.js";
import { getErrorMessage } from "../../../lib/error.js";
import {
  estimateTranscriptChars,
  OUTPUT_CONTINUE_INSTRUCTION,
  PTL_SNIP_NOTICE,
  snipOldestToolCycles,
} from "./recovery.js";
const EMPTY_RESPONSE_RETRY_BUDGET = 1;
const TRANSIENT_RETRY_BUDGET = 3;
const PROMPT_TOO_LONG_RETRY_BUDGET = 3;
const MAX_OUTPUT_RECOVERY_RETRIES = 3;
const PROMPT_SNIP_TARGET_RATIO = 0.6;
const MAX_COMMITTED_STEPS_PER_RUN = 200;
const MAX_TOOL_BATCHES_PER_RUN = 100;

class AbortedError extends Error {
  constructor() {
    super("Loop aborted by signal");
    this.name = "AbortedError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortedError();
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function cloneToolContext(context: ToolRuntimeContext): ToolRuntimeContext {
  return { values: structuredClone(context.values) };
}

function buildLoopState(opts: LoopOptions): AgentLoopState {
  const modeConfig = opts.modeConfigs[opts.activeModeId];
  if (!modeConfig) throw new Error(`Missing mode config for mode "${opts.activeModeId}"`);
  const now = new Date().toISOString();
  return {
    runId: opts.runId,
    sessionId: opts.sessionId,
    agentId: opts.agentId,
    status: "running",
    modeId: opts.activeModeId,
    modeBehavior: modeConfig.modeBehavior,
    step: 0,
    attempt: 0,
    toolBatch: 0,
    startedAt: now,
    updatedAt: now,
  };
}

function updateLoopState(
  state: AgentLoopState,
  opts: Pick<LoopOptions, "onLoopState">,
  patch: Partial<AgentLoopState>,
): void {
  Object.assign(state, patch, { updatedAt: new Date().toISOString() });
  opts.onLoopState?.({ ...state });
}

function latestAnchorMessageId(messages: TranscriptMessage[], fallback: string): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" || message?.role === "user") return message.id;
  }
  return fallback;
}

async function emitRunEvent(
  opts: LoopOptions,
  messages: TranscriptMessage[],
  counters: Pick<AgentLoopState, "step" | "attempt">,
  input: {
    kind: RunEventKind;
    severity: RunEventSeverity;
    message: string;
    code?: string;
    detail?: string;
    anchorMessageId?: string;
  },
): Promise<void> {
  const event: RunEvent = {
    id: randomUUID(),
    runId: opts.runId,
    sessionId: opts.sessionId,
    anchorMessageId: input.anchorMessageId ?? latestAnchorMessageId(messages, opts.userMessageId),
    kind: input.kind,
    severity: input.severity,
    message: input.message,
    code: input.code,
    detail: input.detail?.slice(0, 4000),
    step: counters.step,
    attempt: counters.attempt,
    createdAt: new Date().toISOString(),
  };
  await opts.onRunEvent?.(event);
}

function buildInstructions(systemPrompt: string, runtimeContext: string, retryInstruction?: string): string {
  return [
    systemPrompt.trim(),
    runtimeContext.trim(),
    retryInstruction?.trim()
      ? `<retry_directive>\n${retryInstruction.trim()}\n</retry_directive>`
      : "",
  ].filter(Boolean).join("\n\n");
}

async function runModelPass(
  opts: LoopOptions,
  messages: TranscriptMessage[],
  providerState: LoopOptions["providerState"],
  retryInstruction?: string,
  runtimeContext = "",
) {
  const modeConfig = opts.modeConfigs[opts.activeModeId];
  if (!modeConfig) throw new Error(`Missing mode config for mode "${opts.activeModeId}"`);

  const variables: Record<string, string> = {
    ...getSystemVariables({ CURRENT_MODEL: opts.model }),
    ...(modeConfig.runtimeVariables ?? {}),
    mode: modeConfig.modeId,
    ...opts.agentVariables,
  };
  const systemPrompt = buildPrompt(
    modeConfig.promptSections,
    modeConfig.modeInstruction,
    modeConfig.mcpInstructions,
    modeConfig.skillsCatalog,
    variables,
    { sessionId: opts.sessionId, modeId: modeConfig.modeId, modeName: modeConfig.modePromptName },
  );

  let receivedProviderStats = false;
  const streamedMessageIds = new Set<string>();
  let response;
  try {
    response = await callProviderStream({
      providerId: opts.providerId,
      model: opts.model,
      instructions: buildInstructions(systemPrompt, runtimeContext, retryInstruction),
      messages: repairTranscript(messages),
      tools: modeConfig.allTools.length > 0 ? modeConfig.allTools : undefined,
      llmRequestConfig: opts.llmRequestConfig,
      transportState: providerState,
      modelContentByMessageId: opts.modelContentByMessageId,
    }, (chunk) => {
      if (chunk.type === "assistant_block_delta") {
        streamedMessageIds.add(chunk.messageId);
        opts.onAssistantBlockDelta?.(chunk.messageId, chunk.block);
        return;
      }
      if (chunk.type === "assistant_message") {
        streamedMessageIds.add(chunk.message.id);
        opts.onAssistantMessage?.(chunk.message);
        return;
      }
      if (chunk.type === "stats") {
        receivedProviderStats = true;
        opts.onStats?.(chunk.stats);
      }
    });
  } catch (error) {
    if (streamedMessageIds.size > 0) opts.onAssistantAttemptDiscarded?.([...streamedMessageIds]);
    throw error;
  }

  if (!receivedProviderStats) {
    opts.onStats?.({ inputTokens: 0, outputTokens: 0, reasoningTokens: 0, source: "unknown" });
  }
  return response;
}

function createCheckpoint(input: {
  messages: TranscriptMessage[];
  status: LoopCheckpoint["status"];
  state: AgentLoopState;
  toolContext: ToolRuntimeContext;
  providerState: LoopOptions["providerState"];
  providerDebug: LoopCheckpoint["providerDebug"];
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
  };
}

export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const messages = repairTranscript([...opts.messages]);
  let contextMessages = [...messages];
  const state = buildLoopState(opts);
  opts.onLoopState?.({ ...state });

  let finalResponse = "";
  let retryInstruction: string | undefined;
  let emptyResponseRetries = 0;
  let invalidToolRetries = 0;
  let promptTooLongRetries = 0;
  let maxOutputRetries = 0;
  let transientRetries = 0;
  let providerState = opts.providerState;
  let providerDebug: LoopCheckpoint["providerDebug"];
  let toolContext = cloneToolContext(opts.toolContext ?? { values: {} });
  const defaults = getDefaults();

  let status: Exclude<LoopCheckpoint["status"], "running"> = "completed";

  try {
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
        await emitRunEvent(opts, messages, state, {
          kind: "run_limit",
          severity: "warning",
          code: "run_safety_limit_reached",
          message: `Run stopped because its ${safetyStopReason}.`,
        });
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

      let response;
      try {
        response = await runModelPass(
          opts,
          contextMessages,
          providerState,
          retryInstruction,
          runtimeContext,
        );
      } catch (error) {
        if (error instanceof AbortedError) throw error;
        const classified = classifyProviderError(error);
        if (classified.kind === "prompt_too_long" && promptTooLongRetries < PROMPT_TOO_LONG_RETRY_BUDGET) {
          const before = estimateTranscriptChars(contextMessages);
          const target = Math.max(2000, Math.floor(before * PROMPT_SNIP_TARGET_RATIO));
          const snipped = snipOldestToolCycles(contextMessages, target);
          if (snipped.removed === 0) throw error;
          promptTooLongRetries += 1;
          contextMessages = snipped.messages;
          providerState = undefined;
          retryInstruction = PTL_SNIP_NOTICE;
          await emitRunEvent(opts, messages, state, {
            kind: "context_compacted",
            severity: "warning",
            code: "prompt_too_long",
            message: `Context limit reached. Removed ${snipped.removed} older context messages and retrying.`,
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
            code: classified.kind,
            message: `Provider ${classified.kind} error. Retrying in ${Math.round(delayMs / 100) / 10}s (${transientRetries}/${TRANSIENT_RETRY_BUDGET}).`,
            detail: getErrorMessage(error),
          });
          await waitForRetry(delayMs, opts.abortSignal);
          continue;
        }
        throw error;
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
          retryInstruction = `${defaults.retry.invalidToolInstruction} If you call a tool, use only registered tool names and valid JSON object arguments.`;
          await emitRunEvent(opts, messages, state, {
            kind: "model_retry",
            severity: "warning",
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
      state.step += 1;
      messages.push(assistantMessage);
      contextMessages.push(assistantMessage);
      finalResponse = assistantText || finalResponse;
      providerState = response.transportState ?? providerState;
      providerDebug = response.debug ?? providerDebug;
      await opts.onCheckpoint?.(createCheckpoint({
        messages,
        status: "running",
        state,
        toolContext,
        providerState,
        providerDebug,
      }));

      if (response.finishReason === "length" && toolUses.length === 0) {
        if (maxOutputRetries < MAX_OUTPUT_RECOVERY_RETRIES) {
          maxOutputRetries += 1;
          retryInstruction = OUTPUT_CONTINUE_INSTRUCTION;
          await emitRunEvent(opts, messages, state, {
            kind: "output_limit",
            severity: "warning",
            code: "max_output_tokens",
            message: `Response reached the output limit. Continuing (${maxOutputRetries}/${MAX_OUTPUT_RECOVERY_RETRIES}).`,
            anchorMessageId: assistantMessage.id,
          });
          state.attempt = 0;
          continue;
        }
        await emitRunEvent(opts, messages, state, {
          kind: "output_limit",
          severity: "error",
          code: "max_output_retries_exhausted",
          message: "Response reached the output limit repeatedly. The run was stopped.",
          anchorMessageId: assistantMessage.id,
        });
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

        for (const resultMessage of toolResults) {
          for (const result of getToolResults(resultMessage).filter((entry) => entry.is_error)) {
            const toolUse = toolUses.find((entry) => entry.id === result.tool_use_id);
            await emitRunEvent(opts, messages, state, {
              kind: "tool_error",
              severity: "error",
              code: "tool_execution_failed",
              message: `${toolUse?.name ?? "Tool"} failed: ${result.content.slice(0, 1000)}`,
              anchorMessageId: assistantMessage.id,
            });
          }
        }

        await opts.onCheckpoint?.(createCheckpoint({
          messages,
          status: "running",
          state,
          toolContext,
          providerState,
          providerDebug,
        }));
        throwIfAborted(opts.abortSignal);
        state.attempt = 0;
        continue;
      }

      break;
    }
  } catch (error) {
    if (error instanceof AbortedError || opts.abortSignal?.aborted) {
      status = "aborted";
      await emitRunEvent(opts, messages, state, {
        kind: "run_aborted",
        severity: "info",
        code: "user_aborted",
        message: "Run aborted by the user.",
      }).catch(() => undefined);
    } else {
      status = "failed";
      const detail = getErrorMessage(error);
      await emitRunEvent(opts, messages, state, {
        kind: "run_failed",
        severity: "error",
        code: "unhandled_run_error",
        message: "The agent run failed. The completed partial work was preserved.",
        detail,
      }).catch(() => undefined);
    }
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
  }));

  return {
    finalResponse,
  };
}
