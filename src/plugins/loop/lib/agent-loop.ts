import type { UnifiedMessage, UnifiedToolDefinition } from "../../provider/lib/types.js";
import type { LoopOptions, LoopResult, LoopMessage } from "../types.js";
import type { AgentLoopMode, AgentLoopPhase, AgentLoopState } from "../../agent/types.js";
import { callProviderStream } from "../../provider/service.js";
import { buildPrompt } from "../../systemprompt/service.js";
import { getSystemVariables } from "../../systemprompt/lib/builder.js";
import { getDefaults } from "../../lib/defaults.js";
import { getTaskSummary } from "../../tools/service.js";

const INVALID_TOOL_RETRY_BUDGET = 2;
const EMPTY_RESPONSE_RETRY_BUDGET = 1;
const VERIFY_RETRY_LIMIT = 1;

const INVALID_TOOL_CALL_PATTERNS = [
  /<tool_call\b/i,
  /<function=/i,
  /<parameter=/i,
  /<\/function>/i,
  /<\/tool_call>/i,
];

function looksLikeInvalidToolAttempt(content: string, reasoning?: string): boolean {
  const combined = `${content}\n${reasoning ?? ""}`;
  return INVALID_TOOL_CALL_PATTERNS.some((pattern) => pattern.test(combined));
}

function hasVisibleContent(content: string): boolean {
  return content.trim().length > 0;
}

function toUnifiedTools(tools: LoopOptions["allTools"]): UnifiedToolDefinition[] {
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
    phase: opts.phase,
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

function getPhasePrompt(opts: LoopOptions, phase: AgentLoopPhase): string | undefined {
  if (phase === "planning") {
    return opts.phasePrompts.planning;
  }
  if (phase === "verifying") {
    return opts.phasePrompts.verifying;
  }
  if (phase === "executing") {
    return opts.phasePrompts.executing;
  }
  return undefined;
}

function getInitialPhase(loopMode: AgentLoopMode): AgentLoopPhase {
  return loopMode === "simple" ? "executing" : "planning";
}

function shouldVerify(loopMode: AgentLoopMode): boolean {
  return loopMode === "full_verify";
}

async function runModelPass(
  opts: LoopOptions,
  messages: LoopMessage[],
  phase: AgentLoopPhase,
  feedback: string,
  retryInstruction?: string,
  extraSystemMessages: string[] = [],
): Promise<Awaited<ReturnType<typeof callProviderStream>>> {
  const variables: Record<string, string> = {
    ...getSystemVariables({ CURRENT_MODEL: opts.model }),
    iteration: String(messages.filter((message) => message.role === "assistant").length + 1),
    maxIterations: String(opts.maxIterations),
    mcpInstructions: opts.mcpInstructions,
    phase,
    TASK_SUMMARY: getTaskSummary(opts.sessionId),
    FEEDBACK: feedback,
    ...opts.agentVariables,
  };
  const systemPrompt = buildPrompt(
    opts.systemPrompt,
    opts.mcpInstructions,
    variables,
    { sessionId: opts.sessionId, phase, phasePrompt: getPhasePrompt(opts, phase), feedback },
  );

  const messagesWithSystem = buildModelMessages(systemPrompt, messages, retryInstruction, extraSystemMessages);

  let receivedProviderStats = false;
  const response = await callProviderStream(
    {
      model: opts.model,
      messages: messagesWithSystem,
      tools: phase === "verifying" ? undefined : opts.allTools.length > 0 ? toUnifiedTools(opts.allTools) : undefined,
      reasoningEffort: opts.reasoningEffort,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
    },
    (chunk) => {
      if (chunk.type === "content" && chunk.content && phase !== "verifying") {
        opts.onContent?.(chunk.content);
        return;
      }

      if (chunk.type === "reasoning" && chunk.content && phase !== "verifying") {
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

function parseVerificationVerdict(content: string): { ok: boolean; feedback?: string } {
  const trimmed = content.trim();
  if (/^VERIFY_OK\b/i.test(trimmed)) return { ok: true };
  if (/^VERIFY_RETRY\b/i.test(trimmed)) {
    return { ok: false, feedback: trimmed.replace(/^VERIFY_RETRY\s*:?\s*/i, "").trim() };
  }
  return {
    ok: false,
    feedback: trimmed || "Die Verifikation konnte das Ergebnis nicht bestaetigen. Pruefe offene Punkte erneut.",
  };
}

function applyTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const messages: LoopMessage[] = [...opts.messages];
  let iteration = 0;
  let lastContent = "";
  let lastMeaningfulContent = "";
  let invalidToolAttemptCount = 0;
  let emptyResponseRetryCount = 0;
  let verificationRetryCount = 0;
  let retryInstruction: string | undefined;
  let latestFeedback = "";
  let phase: AgentLoopPhase = opts.phase || getInitialPhase(opts.loopMode);
  const loopState = buildLoopState(opts);
  opts.onLoopState?.(loopState);

  while (iteration < opts.maxIterations) {
    iteration++;
    emitLoopState(loopState, opts, { iteration, phase, status: "running" });

    const response = await runModelPass(opts, messages, phase, latestFeedback, retryInstruction);
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
      emitLoopState(loopState, opts, { status: "error", phase: "error" });
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
      emitLoopState(loopState, opts, { status: "error", phase: "error" });
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
    let appendedAssistantMessage = false;

    if (toolsCalled.length > 0 || hasVisibleContent(messageContent) || messageReasoning) {
      messages.push(assistantMessage);
      appendedAssistantMessage = true;
    }

    if (response.finishReason === "tool_calls" && toolsCalled.length > 0) {
      phase = "executing";
      latestFeedback = "";
      for (const toolCall of toolsCalled) {
        opts.onToolCall?.(toolCall);
        const result = await opts.executeTool(toolCall.name, toolCall.arguments);
        opts.onToolResult?.(toolCall.id, result);

        messages.push({
          role: "tool",
          content: result.contextContent ?? result.content,
          tool_call_id: toolCall.id,
        });
      }
      emitLoopState(loopState, opts, { iteration, phase });
      continue;
    }

    if (phase === "planning") {
      phase = "executing";
      latestFeedback = "";
    }

    if (!shouldVerify(opts.loopMode)) {
      phase = "completed";
      break;
    }

    emitLoopState(loopState, opts, { iteration, phase: "verifying" });
    const verificationTaskSummary = getTaskSummary(opts.sessionId);
    const verificationInstruction = applyTemplate(getDefaults().loop.verificationInstruction, {
      TASK_SUMMARY: verificationTaskSummary,
    });
    const verificationResponse = await runModelPass(
      opts,
      messages,
      "verifying",
      latestFeedback,
      undefined,
      [verificationInstruction],
    );

    const verification = parseVerificationVerdict(verificationResponse.content);
    if (verification.ok) {
      phase = "completed";
      break;
    }

    if (verificationRetryCount >= VERIFY_RETRY_LIMIT) {
      phase = "completed";
      break;
    }

    if (appendedAssistantMessage) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage
        && lastMessage.role === "assistant"
        && lastMessage.content === assistantMessage.content
        && lastMessage.reasoning === assistantMessage.reasoning
      ) {
        messages.pop();
      }
    }

    verificationRetryCount++;
    latestFeedback = verification.feedback ?? "Bitte Ergebnis erneut pruefen und vervollstaendigen.";
    opts.onContentReset?.();
    retryInstruction = applyTemplate(getDefaults().loop.verificationRetryMessage, {
      FEEDBACK: latestFeedback,
    });
    phase = "executing";
  }

  emitLoopState(loopState, opts, {
    status: loopState.status === "error" ? "error" : "completed",
    phase: loopState.status === "error" ? "error" : "completed",
    iteration,
  });

  return {
    messages,
    finalResponse: lastMeaningfulContent || lastContent,
    iterations: iteration,
  };
}
