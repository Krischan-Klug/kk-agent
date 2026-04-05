import type { TranscriptMessage } from "../../lib/transcript.js";
import { createTranscriptMessage, getMessageText, getToolUses, hasVisibleAssistantContent, repairTranscript, textBlock } from "../../lib/transcript.js";
import type { LoopOptions, LoopResult } from "../types.js";
import type { AgentLoopState } from "../../agent/types.js";
import { callProviderStream } from "../../provider/service.js";
import { buildPrompt } from "../../systemprompt/service.js";
import { getSystemVariables } from "../../systemprompt/lib/builder.js";
import { getTaskSummary } from "../../tools/service.js";
import { StreamingToolExecutor } from "./tool-executor.js";
import { getDefaults } from "../../lib/defaults.js";

const EMPTY_RESPONSE_RETRY_BUDGET = 1;

function buildLoopState(opts: LoopOptions): AgentLoopState {
  const now = new Date().toISOString();
  return {
    sessionId: opts.sessionId,
    agentId: opts.agentId,
    status: "running",
    mode: opts.activeMode,
    iteration: 0,
    maxIterations: opts.maxIterations,
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
  extraSystemMessages: string[] = [],
): TranscriptMessage[] {
  return [
    createTranscriptMessage({ role: "system", content: [textBlock(systemPrompt)] }),
    ...(retryInstruction ? [createTranscriptMessage({ role: "system", content: [textBlock(retryInstruction)] })] : []),
    ...extraSystemMessages.map((message) => createTranscriptMessage({ role: "system", content: [textBlock(message)] })),
    ...repairTranscript(messages),
  ];
}

async function runModelPass(
  opts: LoopOptions,
  messages: TranscriptMessage[],
  providerState: LoopOptions["providerState"],
  onToolUseBlock?: (toolUse: import("../../lib/transcript.js").TranscriptToolUseBlock) => void,
  retryInstruction?: string,
  extraSystemMessages: string[] = [],
) {
  const modeConfig = opts.modeConfigs[opts.activeMode];
  if (!modeConfig) {
    throw new Error(`Missing mode config for mode "${opts.activeMode}"`);
  }

  const variables: Record<string, string> = {
    ...getSystemVariables({ CURRENT_MODEL: opts.model }),
    ...(modeConfig.runtimeVariables ?? {}),
    iteration: String(messages.filter((message) => message.role === "assistant").length + 1),
    maxIterations: String(opts.maxIterations),
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
      iteration: Number(variables.iteration),
      maxIterations: opts.maxIterations,
    },
  );

  let receivedProviderStats = false;
  const response = await callProviderStream(
    {
      providerId: opts.providerId,
      model: opts.model,
      messages: buildModelMessages(systemPrompt, messages, retryInstruction, extraSystemMessages),
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
  let providerState = opts.providerState;
  let providerDebug: LoopResult["providerDebug"] = undefined;
  let runtimeContext = {
    values: { ...(opts.toolContext?.values ?? {}) },
  };
  const defaults = getDefaults();

  while (iteration < opts.maxIterations) {
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
    const extraSystemMessages = iteration === 1 && opts.extraSystemMessages ? [...opts.extraSystemMessages] : [];
    let response;
    try {
      response = await runModelPass(
        opts,
        messages,
        providerState,
        (toolUse) => {
          if (streamedToolUseIds.has(toolUse.id)) return;
          streamedToolUseIds.add(toolUse.id);
          executor.addTool(toolUse);
        },
        retryInstruction,
        extraSystemMessages,
      );
    } catch (error) {
      executor.discardPending("Tool execution was discarded because the provider stream failed.");
      await executor.getFinalResults().catch(() => []);
      throw error;
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
        opts.onSystemNotice?.("warning", "Modell hat ungueltige Tool-Calls erzeugt. Korrekturversuch.");
        retryInstruction = [
          defaults.retry.invalidToolInstruction,
          "If you call a tool, use only registered tool names and valid JSON object arguments.",
        ].join(" ");
        iteration--;
        continue;
      }

      emptyResponseRetryCount++;
      if (emptyResponseRetryCount <= EMPTY_RESPONSE_RETRY_BUDGET) {
        opts.onSystemNotice?.("warning", "Modellantwort war leer. Korrekturversuch.");
        retryInstruction = defaults.retry.emptyResponseInstruction;
        iteration--;
        continue;
      }
      emitLoopState(loopState, opts, { status: "error" });
      throw new Error("Model returned an empty response twice in a row.");
    }

    emptyResponseRetryCount = 0;
    invalidToolRetryCount = 0;
    messages.push(assistantMessage);
    finalResponse = assistantText || finalResponse;
    providerState = response.transportState ?? providerState;
    providerDebug = response.debug ?? providerDebug;

    if (toolUses.length === 0) {
      break;
    }

    for (const toolUse of toolUses) {
      if (!streamedToolUseIds.has(toolUse.id)) {
        executor.addTool(toolUse);
      }
    }
    const toolResults = await executor.getFinalResults();
    runtimeContext = executor.getRuntimeContext();
    messages.push(...toolResults);
  }

  const repaired = repairTranscript(messages);
  emitLoopState(loopState, opts, {
    status: loopState.status === "error" ? "error" : "completed",
    iteration,
    mode: opts.activeMode,
  });

  return {
    messages: repaired,
    finalResponse,
    iterations: iteration,
    providerState,
    providerDebug,
  };
}
