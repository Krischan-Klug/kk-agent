import type { UnifiedMessage, UnifiedToolDefinition, UnifiedToolCall } from "../../provider/lib/types.js";
import type { LoopOptions, LoopResult, ToolDefinition } from "../types.js";
import type { LoopPhase, AgentLoopState, PhaseHistoryEntry, TransitionCondition } from "../../agent/types.js";
import { callProviderStream } from "../../provider/service.js";
import { buildPrompt } from "../../systemprompt/service.js";
import { getSystemVariables } from "../../systemprompt/lib/builder.js";
import { compactContext, DEFAULT_COMPACTION_PROMPT } from "./compaction.js";

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

function checkTransition(
  phase: LoopPhase,
  phaseIteration: number,
  finishReason: string,
  toolsCalled: UnifiedToolCall[],
  responseContent: string,
): { to: string; reason: string } | null {
  for (const transition of phase.transitions) {
    if (matchesCondition(transition.condition, phaseIteration, phase.maxIterations, finishReason, toolsCalled, responseContent)) {
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
  phaseIteration: number,
  maxIterations: number,
  finishReason: string,
  toolsCalled: UnifiedToolCall[],
  responseContent: string,
): boolean {
  switch (condition.type) {
    case "max_iterations":
      return phaseIteration >= maxIterations;
    case "no_tool_calls":
      return finishReason !== "tool_calls";
    case "tool_called":
      return toolsCalled.some((tc) => tc.name === condition.toolName);
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

  const allMessages: UnifiedMessage[] = [...opts.messages];
  let totalIterations = 0;
  let phaseIteration = 0;
  let lastContent = "";
  let phaseToolCallCount = 0;
  let phaseStartedAt = new Date().toISOString();

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
      ...allMessages,
    ];

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
          opts.onContent?.(chunk.content);
        } else if (chunk.type === "reasoning" && chunk.content) {
          opts.onReasoning?.(chunk.content);
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
        const compacted = await compactContext(allMessages, prompt, opts.model);
        allMessages.length = 0;
        allMessages.push(...compacted);
        cumulativeStats.inputTokens = 0;
      }
    }

    lastContent = response.content;
    const toolsCalled = response.tool_calls ?? [];

    // Add assistant message
    if (toolsCalled.length > 0) {
      allMessages.push({
        role: "assistant",
        content: response.content,
        tool_calls: toolsCalled,
      });
    } else {
      allMessages.push({ role: "assistant", content: response.content });
    }

    // Execute tool calls
    if (response.finishReason === "tool_calls" && toolsCalled.length > 0) {
      phaseToolCallCount += toolsCalled.length;

      for (const tc of toolsCalled) {
        opts.onToolCall?.(tc);
        const result = await opts.executeTool(tc.name, tc.arguments);
        opts.onToolResult?.(tc.id, result);
        allMessages.push({
          role: "tool",
          content: result.content,
          tool_call_id: tc.id,
        });
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

  return { messages: allMessages, finalResponse: lastContent, iterations: totalIterations };
}
