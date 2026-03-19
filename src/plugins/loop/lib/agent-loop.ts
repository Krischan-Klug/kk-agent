import type { UnifiedMessage, UnifiedToolDefinition, UnifiedToolCall } from "../../provider/lib/types.js";
import type { LoopOptions, LoopResult, ToolDefinition, LoopMessage } from "../types.js";
import type {
  LoopPhase,
  AgentLoopState,
  PhaseHistoryEntry,
  TransitionCondition,
  PhaseCompletionCriteria,
} from "../../agent/types.js";
import { callProviderStream } from "../../provider/service.js";
import { buildPrompt } from "../../systemprompt/service.js";
import { getSystemVariables } from "../../systemprompt/lib/builder.js";
import { compactContext, DEFAULT_COMPACTION_PROMPT } from "./compaction.js";

const INVALID_TOOL_RETRY_BUDGET = 2;
const INVALID_TOOL_CALL_PATTERNS = [
  /<tool_call\b/i,
  /<function=/i,
  /<parameter=/i,
  /<\/function>/i,
  /<\/tool_call>/i,
];
const INVALID_TOOL_RETRY_INSTRUCTION = [
  "Dein letzter Versuch hat einen Tool-Aufruf nur als Text oder Thinking ausgegeben.",
  "Wichtig: Tools duerfen nur ueber strukturierte tool_calls der API aufgerufen werden.",
  "Freitext, XML, Markdown oder Thinking werden nicht als Tool-Aufruf interpretiert.",
  "Antworte jetzt entweder mit einer normalen Antwort oder sende einen echten strukturierten Tool-Call.",
].join(" ");

function filterTools(allTools: ToolDefinition[], phase: LoopPhase): UnifiedToolDefinition[] {
  let tools = allTools;

  if (phase.toolFilter) {
    const { mode, toolNames } = phase.toolFilter;
    if (mode === "include") {
      tools = tools.filter((t) => toolNames.includes(t.name));
    } else {
      tools = tools.filter((t) => !toolNames.includes(t.name));
    }
  }

  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

function buildSystemPrompt(
  opts: LoopOptions,
  phase: LoopPhase,
  phaseIteration: number,
): string {
  const phaseExtension = opts.promptTemplates.phases[phase.name] ?? "";
  const variables: Record<string, string> = {
    // System variables (CURRENT_DATE, CURRENT_TIME, etc.)
    ...getSystemVariables(),
    // Loop variables
    phase: phase.name,
    iteration: String(phaseIteration),
    maxIterations: String(phase.maxIterations),
    mcpInstructions: opts.mcpInstructions,
    // Agent custom variables (override system vars if same key)
    ...opts.agentVariables,
  };
  return buildPrompt(opts.promptTemplates.base, phaseExtension, opts.mcpInstructions, variables);
}

function hasVisibleAssistantContent(content: string): boolean {
  return content.trim().length > 0;
}

function sanitizeVisibleAssistantContent(content: string): string {
  return content
    .replace(/\s*PHASE_COMPLETE:\s*[A-Z_]+\s*/gim, "\n")
    .trim();
}

function shouldPersistAssistantMessage(content: string, toolsCalled: UnifiedToolCall[], reasoning?: string): boolean {
  if (toolsCalled.length > 0) return true;
  if (hasVisibleAssistantContent(content)) return true;
  return !!reasoning?.trim();
}

function serializeMessagesForModel(messages: LoopMessage[]): UnifiedMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    tool_call_id: message.tool_call_id,
    tool_calls: message.tool_calls,
  }));
}

function looksLikeInvalidToolAttempt(content: string, reasoning?: string): boolean {
  const combined = `${content}\n${reasoning ?? ""}`;
  return INVALID_TOOL_CALL_PATTERNS.some((pattern) => pattern.test(combined));
}

function isPhaseComplete(
  phase: LoopPhase,
  finishReason: string,
  responseContent: string,
  phaseToolCallCount: number,
): boolean {
  if (finishReason === "tool_calls") return false;

  const criteria: PhaseCompletionCriteria = phase.completionCriteria ?? { mode: "stop" };
  if (criteria.requiresToolCall && phaseToolCallCount === 0) return false;

  if (criteria.mode === "signal") {
    return !!criteria.signal && responseContent.includes(criteria.signal);
  }

  return true;
}

function checkTransition(
  phase: LoopPhase,
  phaseIteration: number,
  finishReason: string,
  toolsCalled: UnifiedToolCall[],
  responseContent: string,
  phaseToolCallCount: number,
  hadToolError: boolean,
): { to: string; reason: string } | null {
  for (const transition of phase.transitions) {
    if (matchesCondition(
      transition.condition,
      phase,
      phaseIteration,
      phase.maxIterations,
      finishReason,
      toolsCalled,
      responseContent,
      phaseToolCallCount,
      hadToolError,
    )) {
      return { to: transition.to, reason: describeCondition(transition.condition) };
    }
  }

  // autoAdvance: if LLM stops calling tools and no explicit transition matched, end the phase
  if (phase.autoAdvance && finishReason !== "tool_calls") {
    return null; // signals: done with this phase, no next phase → loop ends
  }

  return null;
}

function matchesCondition(
  condition: TransitionCondition,
  phase: LoopPhase,
  phaseIteration: number,
  maxIterations: number,
  finishReason: string,
  toolsCalled: UnifiedToolCall[],
  responseContent: string,
  phaseToolCallCount: number,
  hadToolError: boolean,
): boolean {
  switch (condition.type) {
    case "max_iterations":
      return phaseIteration >= maxIterations;
    case "no_tool_calls":
      return finishReason !== "tool_calls";
    case "tool_called":
      return toolsCalled.some((tc) => tc.name === condition.toolName);
    case "tool_result_error":
      return hadToolError;
    case "phase_complete":
      return isPhaseComplete(phase, finishReason, responseContent, phaseToolCallCount);
    case "keyword":
      return responseContent.includes(condition.keyword);
    case "always":
      return true;
  }
}

function describeCondition(condition: TransitionCondition): string {
  switch (condition.type) {
    case "max_iterations":
      return "max_iterations reached";
    case "no_tool_calls":
      return "no tool calls";
    case "tool_called":
      return `tool "${condition.toolName}" called`;
    case "tool_result_error":
      return "tool result error";
    case "phase_complete":
      return "phase completion criteria met";
    case "keyword":
      return `keyword "${condition.keyword}" found`;
    case "always":
      return "unconditional";
  }
}

function createLoopState(opts: LoopOptions, phase: LoopPhase): AgentLoopState {
  return {
    sessionId: opts.sessionId,
    agentId: opts.agentId,
    status: "running",
    currentPhase: phase.name,
    phaseIteration: 0,
    totalIteration: 0,
    phaseHistory: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const { strategy } = opts;

  // Find initial phase
  let currentPhase = strategy.phases.find((p) => p.name === strategy.initialPhase);
  if (!currentPhase) throw new Error(`Initial phase "${strategy.initialPhase}" not found`);

  const visibleMessages: LoopMessage[] = [...opts.messages];
  const contextMessages: LoopMessage[] = [...opts.messages];
  let totalIterations = 0;
  let phaseIteration = 0;
  let lastContent = "";
  let lastMeaningfulContent = "";
  let phaseToolCallCount = 0;
  let phaseStartedAt = new Date().toISOString();
  let invalidToolAttemptCount = 0;
  let retryInstruction: string | undefined;

  const loopState = createLoopState(opts, currentPhase);
  opts.onLoopState?.(loopState);

  const cumulativeStats = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };

  while (totalIterations < strategy.maxTotalIterations) {
    totalIterations++;
    phaseIteration++;

    // Build system prompt for current phase
    const systemPrompt = buildSystemPrompt(opts, currentPhase, phaseIteration);
    const tools = filterTools(opts.allTools, currentPhase);

    // Prepare messages with current system prompt
    const messagesWithSystem: UnifiedMessage[] = [
      { role: "system", content: systemPrompt },
      ...(retryInstruction ? [{ role: "system" as const, content: retryInstruction }] : []),
      ...serializeMessagesForModel(contextMessages),
    ];
    retryInstruction = undefined;

    const streamedChunks: Array<{ type: "content" | "reasoning"; content: string }> = [];

    // Call LLM (streaming)
    const response = await callProviderStream(
      {
        model: opts.model,
        messages: messagesWithSystem,
        tools: tools.length > 0 ? tools : undefined,
        reasoningEffort: opts.reasoningEffort,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
      },
      (chunk) => {
        if (chunk.type === "content" && chunk.content) {
          streamedChunks.push({ type: "content", content: chunk.content });
        } else if (chunk.type === "reasoning" && chunk.content) {
          streamedChunks.push({ type: "reasoning", content: chunk.content });
        } else if (chunk.type === "stats" && chunk.stats) {
          cumulativeStats.inputTokens = chunk.stats.inputTokens; // last value = current context fill
          cumulativeStats.outputTokens += chunk.stats.outputTokens;
          cumulativeStats.reasoningTokens += chunk.stats.reasoningTokens;
          opts.onStats?.({ ...cumulativeStats });
        }
      },
    );

    // Check context compaction before processing response
    if (opts.maxContextTokens && cumulativeStats.inputTokens > 0) {
      const threshold = opts.compactionThreshold ?? 0.8;
      if (cumulativeStats.inputTokens >= opts.maxContextTokens * threshold) {
        const prompt = opts.compactionPrompt ?? DEFAULT_COMPACTION_PROMPT;
        opts.onContent?.("\n\n---\n[Context wird komprimiert...]\n---\n\n");
        const compacted = await compactContext(serializeMessagesForModel(contextMessages), prompt, opts.model);
        contextMessages.length = 0;
        contextMessages.push(...compacted.map((message) => ({
          role: message.role as LoopMessage["role"],
          content: message.content,
          tool_call_id: message.tool_call_id,
          tool_calls: message.tool_calls,
        })));
        cumulativeStats.inputTokens = 0;
      }
    }

    const messageContent = sanitizeVisibleAssistantContent(response.content);
    const messageReasoning = response.reasoning?.trim() || undefined;

    lastContent = messageContent;
    if (hasVisibleAssistantContent(messageContent)) {
      lastMeaningfulContent = messageContent;
    }
    const toolsCalled = response.tool_calls ?? [];
    const invalidToolAttempt =
      response.finishReason !== "tool_calls"
      && toolsCalled.length === 0
      && looksLikeInvalidToolAttempt(messageContent, messageReasoning);

    if (invalidToolAttempt) {
      invalidToolAttemptCount++;

      if (invalidToolAttemptCount <= INVALID_TOOL_RETRY_BUDGET) {
        retryInstruction = INVALID_TOOL_RETRY_INSTRUCTION;
        continue;
      }

      loopState.status = "error";
      loopState.updatedAt = new Date().toISOString();
      opts.onLoopState?.(loopState);
      throw new Error("Model emitted pseudo-formatted tool calls instead of structured tool_calls.");
    }

    invalidToolAttemptCount = 0;
    for (const chunk of streamedChunks) {
      if (chunk.type === "content") {
        opts.onContent?.(chunk.content);
      } else {
        opts.onReasoning?.(chunk.content);
      }
    }

    // Add assistant message
    if (toolsCalled.length > 0) {
      const assistantMessage: LoopMessage = {
        role: "assistant",
        content: messageContent,
        reasoning: messageReasoning,
        tool_calls: toolsCalled,
      };
      visibleMessages.push(assistantMessage);
      contextMessages.push(assistantMessage);
    } else if (shouldPersistAssistantMessage(messageContent, toolsCalled, messageReasoning)) {
      const assistantMessage: LoopMessage = {
        role: "assistant",
        content: messageContent,
        reasoning: messageReasoning,
      };
      visibleMessages.push(assistantMessage);
      contextMessages.push(assistantMessage);
    }

    // Execute tool calls
    let hadToolError = false;
    if (response.finishReason === "tool_calls" && toolsCalled.length > 0) {
      phaseToolCallCount += toolsCalled.length;

      for (const tc of toolsCalled) {
        opts.onToolCall?.(tc);
        const result = await opts.executeTool(tc.name, tc.arguments);
        hadToolError ||= result.isError;
        opts.onToolResult?.(tc.id, result);
        const toolMessage: LoopMessage = {
          role: "tool",
          content: result.content,
          tool_call_id: tc.id,
        };
        visibleMessages.push(toolMessage);
        contextMessages.push(toolMessage);
      }
    }

    // Update loop state
    loopState.totalIteration = totalIterations;
    loopState.phaseIteration = phaseIteration;
    loopState.updatedAt = new Date().toISOString();
    opts.onLoopState?.(loopState);

    // Check transition conditions
    const transition = checkTransition(
      currentPhase,
      phaseIteration,
      response.finishReason,
      toolsCalled,
      response.content,
      phaseToolCallCount,
      hadToolError,
    );

    if (transition) {
      // Record phase history
      const historyEntry: PhaseHistoryEntry = {
        phase: currentPhase.name,
        iterations: phaseIteration,
        toolCallCount: phaseToolCallCount,
        transitionReason: transition.reason,
        startedAt: phaseStartedAt,
        endedAt: new Date().toISOString(),
      };
      loopState.phaseHistory.push(historyEntry);

      // Transition to next phase
      const nextPhase = strategy.phases.find((p) => p.name === transition.to);
      if (!nextPhase) {
        // Target phase doesn't exist → end loop
        break;
      }

      opts.onPhaseChange?.(currentPhase.name, nextPhase.name, transition.reason);
      currentPhase = nextPhase;
      phaseIteration = 0;
      phaseToolCallCount = 0;
      phaseStartedAt = new Date().toISOString();

      loopState.currentPhase = currentPhase.name;
      loopState.phaseIteration = 0;
      opts.onLoopState?.(loopState);
    } else if (
      response.finishReason !== "tool_calls"
      && hasVisibleAssistantContent(messageContent)
      && currentPhase.continueOnStop
      && !isPhaseComplete(currentPhase, response.finishReason, response.content, phaseToolCallCount)
    ) {
      continue;
    } else if (response.finishReason !== "tool_calls") {
      // No transition and LLM done → end loop
      // Record final phase
      loopState.phaseHistory.push({
        phase: currentPhase.name,
        iterations: phaseIteration,
        toolCallCount: phaseToolCallCount,
        transitionReason: "completed",
        startedAt: phaseStartedAt,
        endedAt: new Date().toISOString(),
      });
      break;
    }
    // else: finishReason === "tool_calls" but no transition → continue in same phase
  }

  // Finalize loop state
  loopState.status = "completed";
  loopState.updatedAt = new Date().toISOString();
  opts.onLoopState?.(loopState);

  return { messages: visibleMessages, finalResponse: lastMeaningfulContent || lastContent, iterations: totalIterations };
}
