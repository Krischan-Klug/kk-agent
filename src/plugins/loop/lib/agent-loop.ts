import type { UnifiedMessage, UnifiedToolDefinition, ContentBlock } from "../../provider/lib/types.js";
import { getTextContent } from "../../provider/lib/types.js";
import type { LoopOptions, LoopResult, LoopMessage } from "../types.js";
import type { AgentLoopState } from "../../agent/types.js";
import { callProviderStream } from "../../provider/service.js";
import { buildPrompt } from "../../systemprompt/service.js";
import { getSystemVariables } from "../../systemprompt/lib/builder.js";
import { getDefaults } from "../../lib/defaults.js";
import { getTaskSummary } from "../../tools/service.js";

const INVALID_TOOL_RETRY_BUDGET = 2;
const EMPTY_RESPONSE_RETRY_BUDGET = 1;

const INVALID_TOOL_CALL_PATTERNS = [
  /<tool_call\b/i,
  /<function=/i,
  /<parameter=/i,
  /<\/function>/i,
  /<\/tool_call>/i,
];

function looksLikeInvalidToolAttempt(content: string | ContentBlock[], reasoning?: string): boolean {
  const text = getTextContent(content);
  const combined = `${text}\n${reasoning ?? ""}`;
  return INVALID_TOOL_CALL_PATTERNS.some((pattern) => pattern.test(combined));
}

function hasVisibleContent(content: string | ContentBlock[]): boolean {
  return getTextContent(content).trim().length > 0;
}

function toUnifiedTools(tools: UnifiedToolDefinition[]): UnifiedToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

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
  messages: LoopMessage[],
  retryInstruction?: string,
  extraSystemMessages: string[] = [],
): UnifiedMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...(retryInstruction ? [{ role: "system" as const, content: retryInstruction }] : []),
    ...extraSystemMessages.map((content) => ({ role: "system" as const, content })),
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls,
    })),
  ];
}

async function runModelPass(
  opts: LoopOptions,
  messages: LoopMessage[],
  retryInstruction?: string,
  extraSystemMessages: string[] = [],
): Promise<Awaited<ReturnType<typeof callProviderStream>>> {
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
    variables,
    {
      sessionId: opts.sessionId,
      mode: opts.activeMode,
      iteration: Number(variables.iteration),
      maxIterations: opts.maxIterations,
    }
  );

  const messagesWithSystem = buildModelMessages(systemPrompt, messages, retryInstruction, extraSystemMessages);

  let receivedProviderStats = false;
  const response = await callProviderStream(
    {
      providerId: opts.providerId,
      model: opts.model,
      messages: messagesWithSystem,
      tools: modeConfig.allTools.length > 0 ? toUnifiedTools(modeConfig.allTools) : undefined,
      reasoningEffort: opts.reasoningEffort,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
    },
    (chunk) => {
      if (chunk.type === "content" && chunk.content) {
        opts.onContent?.(chunk.content);
        return;
      }

      if (chunk.type === "reasoning" && chunk.content) {
        opts.onReasoning?.(chunk.content);
        return;
      }

      if (chunk.type === "stats" && chunk.stats) {
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
  const messages: LoopMessage[] = [...opts.messages];
  let iteration = 0;
  let lastContent = "";
  let lastMeaningfulContent = "";
  let invalidToolAttemptCount = 0;
  let emptyResponseRetryCount = 0;
  let retryInstruction: string | undefined;
  const loopState = buildLoopState(opts);
  opts.onLoopState?.(loopState);

  while (iteration < opts.maxIterations) {
    iteration++;
    emitLoopState(loopState, opts, { iteration, status: "running", mode: opts.activeMode });

    const extraSys = iteration === 1 && opts.extraSystemMessages ? [...opts.extraSystemMessages] : [];
    const response = await runModelPass(opts, messages, retryInstruction, extraSys);
    retryInstruction = undefined;

    const messageContent = response.content.trim();
    const messageReasoning = response.reasoning?.trim() || undefined;
    const toolsCalled = response.tool_calls ?? [];

    const invalidToolAttempt =
      response.finishReason !== "tool_calls"
      && toolsCalled.length === 0
      && looksLikeInvalidToolAttempt(messageContent, messageReasoning);

    if (invalidToolAttempt) {
      invalidToolAttemptCount++;
      if (invalidToolAttemptCount <= INVALID_TOOL_RETRY_BUDGET) {
        opts.onContentReset?.();
        opts.onRetryNotice?.("Modellantwort wurde verworfen: Tool-Aufruf nur als Text statt strukturierter tool_call. Korrekturversuch.");
        retryInstruction = getDefaults().retry.invalidToolInstruction;
        iteration--;
        continue;
      }
      emitLoopState(loopState, opts, { status: "error" });
      throw new Error("Model emitted pseudo-formatted tool calls instead of structured tool_calls.");
    }
    invalidToolAttemptCount = 0;

    const emptyResponse =
      response.finishReason === "stop"
      && toolsCalled.length === 0
      && !hasVisibleContent(messageContent)
      && !messageReasoning;

    if (emptyResponse) {
      emptyResponseRetryCount++;
      if (emptyResponseRetryCount <= EMPTY_RESPONSE_RETRY_BUDGET) {
        opts.onContentReset?.();
        opts.onRetryNotice?.("Modellantwort war leer. Korrekturversuch.");
        retryInstruction = getDefaults().retry.emptyResponseInstruction;
        iteration--;
        continue;
      }
      emitLoopState(loopState, opts, { status: "error" });
      throw new Error("Model returned an empty response twice in a row.");
    }
    emptyResponseRetryCount = 0;

    lastContent = messageContent;
    if (hasVisibleContent(messageContent)) {
      lastMeaningfulContent = messageContent;
    }

    const assistantMessage: LoopMessage = {
      role: "assistant",
      content: messageContent,
      reasoning: messageReasoning,
      tool_calls: toolsCalled.length > 0 ? toolsCalled : undefined,
    };
    const shouldAppendAssistant =
      toolsCalled.length > 0 || hasVisibleContent(messageContent) || Boolean(messageReasoning);

    if (shouldAppendAssistant) {
      messages.push(assistantMessage);
    }

    if (response.finishReason === "tool_calls" && toolsCalled.length > 0) {
      for (const toolCall of toolsCalled) {
        opts.onToolCall?.(toolCall);
        const result = await opts.executeTool(toolCall.name, toolCall.arguments, opts.activeMode);
        opts.onToolResult?.(toolCall.id, result);

        messages.push({
          role: "tool",
          content: result.contextContent ?? result.content,
          isError: result.isError,
          tool_call_id: toolCall.id,
        });
      }

      continue;
    }

    break;
  }

  emitLoopState(loopState, opts, {
    status: loopState.status === "error" ? "error" : "completed",
    iteration,
    mode: opts.activeMode,
  });

  return {
    messages,
    finalResponse: lastMeaningfulContent || lastContent,
    iterations: iteration,
  };
}
