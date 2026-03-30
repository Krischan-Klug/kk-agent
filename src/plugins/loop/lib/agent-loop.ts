import type { UnifiedMessage, UnifiedToolDefinition } from "../../provider/lib/types.js";
import type { LoopOptions, LoopResult, LoopMessage } from "../types.js";
import type { AgentLoopState } from "../../agent/types.js";
import { callProviderStream } from "../../provider/service.js";
import { buildPrompt } from "../../systemprompt/service.js";
import { getSystemVariables } from "../../systemprompt/lib/builder.js";
import { getDefaults } from "../../lib/defaults.js";

const INVALID_TOOL_RETRY_BUDGET = 2;
const EMPTY_RESPONSE_RETRY_BUDGET = 1;

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

function buildModelMessages(
  systemPrompt: string,
  messages: LoopMessage[],
  retryInstruction?: string,
): UnifiedMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...(retryInstruction ? [{ role: "system" as const, content: retryInstruction }] : []),
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls,
    })),
  ];
}

export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const messages: LoopMessage[] = [...opts.messages];
  const tools = toUnifiedTools(opts.allTools);

  let iteration = 0;
  let lastContent = "";
  let lastMeaningfulContent = "";
  let invalidToolAttemptCount = 0;
  let emptyResponseRetryCount = 0;
  let retryInstruction: string | undefined;

  const loopState: AgentLoopState = {
    sessionId: opts.sessionId,
    agentId: opts.agentId,
    status: "running",
    iteration: 0,
    maxIterations: opts.maxIterations,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  opts.onLoopState?.(loopState);

  const cumulativeStats = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };

  while (iteration < opts.maxIterations) {
    iteration++;

    const variables: Record<string, string> = {
      ...getSystemVariables({ CURRENT_MODEL: opts.model }),
      iteration: String(iteration),
      maxIterations: String(opts.maxIterations),
      mcpInstructions: opts.mcpInstructions,
      ...opts.agentVariables,
    };
    const systemPrompt = buildPrompt(opts.systemPrompt, opts.mcpInstructions, variables);

    const messagesWithSystem = buildModelMessages(systemPrompt, messages, retryInstruction);
    retryInstruction = undefined;

    let receivedProviderStats = false;

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
          return;
        }

        if (chunk.type === "reasoning" && chunk.content) {
          opts.onReasoning?.(chunk.content);
          return;
        }

        if (chunk.type === "stats" && chunk.stats) {
          receivedProviderStats = true;
          cumulativeStats.inputTokens = chunk.stats.inputTokens;
          cumulativeStats.outputTokens += chunk.stats.outputTokens;
          cumulativeStats.reasoningTokens += chunk.stats.reasoningTokens;
          opts.onStats?.({
            inputTokens: cumulativeStats.inputTokens,
            outputTokens: cumulativeStats.outputTokens,
            reasoningTokens: cumulativeStats.reasoningTokens,
            source: chunk.stats.source,
          });
        }
      },
    );

    if (!receivedProviderStats) {
      opts.onStats?.({
        inputTokens: 0,
        outputTokens: cumulativeStats.outputTokens,
        reasoningTokens: cumulativeStats.reasoningTokens,
        source: "unknown",
      });
    }

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
        continue;
      }
      loopState.status = "error";
      loopState.updatedAt = new Date().toISOString();
      opts.onLoopState?.(loopState);
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
        continue;
      }
      loopState.status = "error";
      loopState.updatedAt = new Date().toISOString();
      opts.onLoopState?.(loopState);
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

    if (toolsCalled.length > 0 || hasVisibleContent(messageContent) || messageReasoning) {
      messages.push(assistantMessage);
    }

    if (response.finishReason === "tool_calls" && toolsCalled.length > 0) {
      for (const toolCall of toolsCalled) {
        opts.onToolCall?.(toolCall);
        const result = await opts.executeTool(toolCall.name, toolCall.arguments);
        opts.onToolResult?.(toolCall.id, result);

        messages.push({
          role: "tool",
          content: result.content,
          tool_call_id: toolCall.id,
        });
      }
    }

    loopState.iteration = iteration;
    loopState.updatedAt = new Date().toISOString();
    opts.onLoopState?.(loopState);

    if (response.finishReason !== "tool_calls") {
      break;
    }
  }

  loopState.status = "completed";
  loopState.iteration = iteration;
  loopState.updatedAt = new Date().toISOString();
  opts.onLoopState?.(loopState);

  return {
    messages,
    finalResponse: lastMeaningfulContent || lastContent,
    iterations: iteration,
  };
}
